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
   lancadas por causa de um reequilibrio.

   SO NO PLANO DO PROXIMO EXERCICIO. O plano do ano corrente (e os
   passados) ja esta em andamento — gente de ferias, memorandos assinados —
   e reembaralhar as equipes dele desfaz o que foi combinado com a tropa.
   O servidor recusa qualquer ano de gozo que nao seja futuro.

   ANTES de trocar, guarda a composicao anterior em Config
   ("ferias_reequilibrio_backup_<ano>"); { anoGozo, desfazer: true } volta o
   plano exatamente como estava antes do ultimo reequilibrio. */

const chaveBackup = (ano: string) => `ferias_reequilibrio_backup_${ano}`;
function anoCorrente(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
}

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

    /* ---- desfazer o último reequilíbrio: volta a composição guardada ---- */
    if (b?.desfazer === true) {
      const row = await prisma.config.findUnique({ where: { chave: chaveBackup(anoGozo) }, select: { valor: true } });
      const bk = row?.valor ? JSON.parse(row.valor) : null;
      if (!bk || !Array.isArray(bk.membros)) return NextResponse.json({ erro: "Não há reequilíbrio para desfazer neste plano." }, { status: 404 });
      const lista: { idPmma: string; numeroEquipe: string; dataCadastro?: string | null }[] = bk.membros;
      // a cópia pode ser de um plano ainda vazio: aí desfazer é esvaziar de novo
      await prisma.$transaction([
        prisma.membroFerias.deleteMany({ where: { anoGozo } }),
        ...(lista.length ? [prisma.membroFerias.createMany({
          data: lista.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe, anoGozo, dataCadastro: m.dataCadastro ?? null })),
          skipDuplicates: true,
        })] : []),
        prisma.config.delete({ where: { chave: chaveBackup(anoGozo) } }),
      ]);
      return NextResponse.json({ ok: true, desfeito: true, total: lista.length });
    }

    if (Number(anoGozo) <= anoCorrente()) {
      return NextResponse.json({
        erro: `O Reequilibrar só vale para o plano do PRÓXIMO exercício. O plano de ${anoGozo} está em andamento e não pode ser reembaralhado.`,
      }, { status: 403 });
    }

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

    // copia de seguranca da composicao atual (para o "Desfazer")
    const backup = JSON.stringify({
      em: new Date().toISOString(),
      por: String((session.user as any).login || session.user.name || ""),
      membros: membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe, dataCadastro: m.dataCadastro ?? null })),
    });

    // Troca a composicao numa transacao: apaga so os MEMBROS do ano e recria.
    // As equipes (com as datas) nunca sao tocadas.
    await prisma.$transaction([
      prisma.config.upsert({
        where: { chave: chaveBackup(anoGozo) },
        update: { valor: backup },
        create: { chave: chaveBackup(anoGozo), valor: backup, descricao: "Composição do plano de férias antes do último reequilíbrio" },
        select: { chave: true },
      }),
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
