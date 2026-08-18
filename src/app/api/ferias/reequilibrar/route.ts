import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { distribuirEquilibrado, type MilitarParaDistribuir } from "@/lib/distribuirEquipes";

export const dynamic = "force-dynamic";

/* POST /api/ferias/reequilibrar   { anoGozo }

   Redistribui os militares de um plano JA EXISTENTE, equilibrando por unidade
   — o mesmo criterio que o plano de ano novo passou a usar.

   Serve para os planos criados antes disso (que so copiavam as equipes do ano
   anterior) e para quando o efetivo mudou muito no meio do caminho.

   NAO apaga o plano: as equipes e as DATAS ja preenchidas ficam como estao,
   e a EQUIPE 1 e preservada com os mesmos militares. So a composicao das
   demais equipes e refeita. Assim ninguem perde o trabalho de datas ja
   lancadas por causa de um reequilibrio. */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user as any).perfil?.toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const anoGozo = String(b?.anoGozo || "").trim();
    if (!/^\d{4}$/.test(anoGozo)) return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });

    const equipes = await prisma.equipeFerias.findMany({ where: { anoGozo } });
    if (!equipes.length) return NextResponse.json({ erro: `Não existe plano para ${anoGozo}.` }, { status: 404 });

    const membros = await prisma.membroFerias.findMany({ where: { anoGozo } });
    if (!membros.length) return NextResponse.json({ erro: "O plano não tem militares para redistribuir." }, { status: 400 });

    const numeros = equipes.map((e) => e.numeroEquipe).sort((a, b) => Number(a) - Number(b));
    const primeira = numeros[0];

    // ficha de cada um, para saber a unidade (e ordenar de forma estavel)
    const ids = Array.from(new Set(membros.map((m) => m.idPmma)));
    const fichas = await prisma.efetivo.findMany({
      where: { id: { in: ids } },
      select: { id: true, lotacao: true, postoGrad: true, nome: true },
    });
    const mapa = new Map(fichas.map((f) => [f.id, f]));

    const paraDistribuir: MilitarParaDistribuir[] = ids.map((id) => {
      const f = mapa.get(id);
      return {
        idPmma: id,
        lotacao: f?.lotacao ?? null,
        postoOrdem: classificarPatente(f?.postoGrad ?? "").ordem,
        nome: f?.nome ?? null,
      };
    });

    const fixos = membros
      .filter((m) => m.numeroEquipe === primeira)
      .map((m) => ({ idPmma: m.idPmma, numeroEquipe: primeira }));

    const atribuicoes = distribuirEquilibrado(paraDistribuir, numeros, fixos);

    // quantos realmente trocaram de equipe (para informar na tela)
    const antes = new Map(membros.map((m) => [m.idPmma, m.numeroEquipe]));
    const mudaram = atribuicoes.filter((a) => antes.get(a.idPmma) !== a.numeroEquipe).length;

    // Troca a composicao numa transacao: apaga so os MEMBROS do ano e recria.
    // As equipes (com as datas) nunca sao tocadas.
    await prisma.$transaction([
      prisma.membroFerias.deleteMany({ where: { anoGozo } }),
      prisma.membroFerias.createMany({
        data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({
      ok: true, ano: anoGozo, total: atribuicoes.length, mudaram,
      equipe1Preservada: fixos.length,
    });
  } catch (e) {
    console.error("[POST /api/ferias/reequilibrar]", e);
    return NextResponse.json({ erro: "Falha ao reequilibrar o plano." }, { status: 500 });
  }
}
