import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { distribuirEquilibrado, type MilitarParaDistribuir } from "@/lib/distribuirEquipes";

/* POST /api/ferias/novo-plano
   Cria o plano de ferias de um NOVO ano de gozo, com as datas em branco para o
   admin preencher.

   Copiar as mesmas equipes do ano anterior deixava o efetivo desequilibrado:
   se meia duzia da ROTEM caiu toda na mesma equipe, quando ela sair de ferias a
   ROTEM fica sem ninguem — e o mesmo nos destacamentos do interior, que tem
   poucos militares cada.

   Por isso, por padrao, o plano novo vem EQUILIBRADO:
     - a EQUIPE 1 repete exatamente os mesmos militares do ano anterior;
     - as demais equipes sao redistribuidas espalhando cada unidade (ROTEM, FT,
       ADM e cada destacamento) entre elas, de modo que nunca saia muita gente
       da mesma unidade de uma vez.

   body: { anoDestino, anoOrigem?, equilibrar? }
     equilibrar (padrao true) — false faz a copia crua, como era antes. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { anoDestino, anoOrigem, equilibrar } = await req.json();
    const dest = String(anoDestino || "").trim();
    if (!/^\d{4}$/.test(dest)) {
      return NextResponse.json({ erro: "Informe um ano válido (AAAA)." }, { status: 400 });
    }

    const jaExiste = await prisma.equipeFerias.findFirst({ where: { anoGozo: dest } });
    if (jaExiste) {
      return NextResponse.json({ erro: `Já existe um plano para ${dest}.` }, { status: 409 });
    }

    // equipes de origem (para copiar a estrutura e os membros)
    const orig = String(anoOrigem || "").trim();
    const equipesOrigem = orig ? await prisma.equipeFerias.findMany({ where: { anoGozo: orig } }) : [];
    const numeros = equipesOrigem.length
      ? equipesOrigem.map((e) => e.numeroEquipe).sort((a, b) => Number(a) - Number(b))
      : ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

    await prisma.equipeFerias.createMany({
      data: numeros.map((numeroEquipe) => ({
        numeroEquipe, anoGozo: dest,
        periodo1Inicio: null, periodo1Fim: null, periodo1Apres: null,
        periodo2Inicio: null, periodo2Fim: null, periodo2Apres: null,
      })),
    });

    let membrosCopiados = 0;
    let modo: "equilibrado" | "copia" = "copia";

    if (orig) {
      const membros = await prisma.membroFerias.findMany({ where: { anoGozo: orig } });

      if (membros.length) {
        const querEquilibrar = equilibrar !== false;
        let atribuicoes = membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe }));

        if (querEquilibrar) {
          // ficha de cada militar, para saber a unidade (e ordenar de forma estavel)
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

          // a EQUIPE 1 e preservada: mesma gente do ano anterior
          const primeira = numeros[0];
          const fixos = membros
            .filter((m) => m.numeroEquipe === primeira)
            .map((m) => ({ idPmma: m.idPmma, numeroEquipe: primeira }));

          atribuicoes = distribuirEquilibrado(paraDistribuir, numeros, fixos);
          modo = "equilibrado";
        }

        const r = await prisma.membroFerias.createMany({
          data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo: dest })),
          skipDuplicates: true,
        });
        membrosCopiados = r.count;
      }
    }

    return NextResponse.json({
      ok: true, ano: dest, equipes: numeros.length, membros: membrosCopiados, modo,
    });
  } catch (e) {
    console.error("[POST /api/ferias/novo-plano]", e);
    return NextResponse.json({ erro: "Falha ao criar o plano." }, { status: 500 });
  }
}
