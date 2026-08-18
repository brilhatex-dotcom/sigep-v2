import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { rotacionarComEquilibrio, mapaRodizio, type MilitarParaDistribuir } from "@/lib/distribuirEquipes";

export const dynamic = "force-dynamic";

/* POST /api/ferias/rodizio   { anoDestino, anoOrigem }

   Monta a composição do plano de `anoDestino` a partir do RODÍZIO do plano de
   `anoOrigem`: cada equipe desce um número e a primeira do rodízio dá a volta
   para a última (2 -> 9, 3 -> 2, ... 9 -> 8). A equipe 1 fica de fora, com os
   mesmos militares.

   Como cada equipe tem o seu período no calendário, o rodízio faz todo mundo
   revezar a época do ano em vez de ficar sempre com o mesmo mês.

   Depois de rodar, corrige APENAS o que ficou desequilibrado: se o ano de
   origem tinha uma unidade concentrada numa equipe, o rodízio herdaria a
   concentração, então movemos o mínimo necessário. Quando a origem já está
   equilibrada, ninguém é movido e o rodízio sai limpo.

   NÃO cria nem apaga equipes, e NÃO toca nas datas do ano de destino —
   só troca quem está em cada equipe. */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user as any).perfil?.toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const anoDestino = String(b?.anoDestino || "").trim();
    const anoOrigem = String(b?.anoOrigem || "").trim();
    if (!/^\d{4}$/.test(anoDestino)) return NextResponse.json({ erro: "Ano de destino inválido." }, { status: 400 });
    if (!/^\d{4}$/.test(anoOrigem)) return NextResponse.json({ erro: "Ano de origem inválido." }, { status: 400 });
    if (anoDestino === anoOrigem) return NextResponse.json({ erro: "O ano de origem e o de destino são o mesmo." }, { status: 400 });

    const equipesDestino = await prisma.equipeFerias.findMany({ where: { anoGozo: anoDestino } });
    if (!equipesDestino.length) {
      return NextResponse.json({ erro: `Não existe plano para ${anoDestino}. Crie o plano primeiro.` }, { status: 404 });
    }

    const membrosOrigem = await prisma.membroFerias.findMany({ where: { anoGozo: anoOrigem } });
    if (!membrosOrigem.length) {
      return NextResponse.json({ erro: `O plano de ${anoOrigem} não tem militares.` }, { status: 400 });
    }

    // As equipes do rodízio são as do ANO DE DESTINO (é lá que a gente escreve).
    const numeros = equipesDestino.map((e) => e.numeroEquipe).sort((a, b) => Number(a) - Number(b));

    // Só aproveita da origem quem cabe numa equipe existente no destino
    // (se o destino tem menos equipes, o resto seria descartado sem aviso).
    const numerosSet = new Set(numeros);
    const origemUtil = membrosOrigem.filter((m) => numerosSet.has(m.numeroEquipe));
    if (!origemUtil.length) {
      return NextResponse.json({ erro: "As equipes de origem não existem no plano de destino." }, { status: 400 });
    }

    const ids = Array.from(new Set(origemUtil.map((m) => m.idPmma)));
    const fichas = await prisma.efetivo.findMany({
      where: { id: { in: ids } },
      select: { id: true, lotacao: true, postoGrad: true, nome: true },
    });
    const mapaFicha = new Map(fichas.map((f) => [f.id, f]));

    const militares: MilitarParaDistribuir[] = ids.map((id) => {
      const f = mapaFicha.get(id);
      return {
        idPmma: id,
        lotacao: f?.lotacao ?? null,
        postoOrdem: classificarPatente(f?.postoGrad ?? "").ordem,
        nome: f?.nome ?? null,
      };
    });

    const atribuicoesOrigem = origemUtil.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe }));
    const { atribuicoes, movidosPorEquilibrio } = rotacionarComEquilibrio(militares, numeros, atribuicoesOrigem);

    await prisma.$transaction([
      prisma.membroFerias.deleteMany({ where: { anoGozo: anoDestino } }),
      prisma.membroFerias.createMany({
        data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo: anoDestino })),
        skipDuplicates: true,
      }),
    ]);

    // resumo do rodízio para mostrar na tela ("2 → 9, 3 → 2, ...")
    const mapa = mapaRodizio(numeros);
    const resumo = numeros.slice(1).map((e) => `${e}→${mapa.get(e)}`).join(", ");

    return NextResponse.json({
      ok: true,
      anoDestino, anoOrigem,
      total: atribuicoes.length,
      movidosPorEquilibrio,
      equipe1: atribuicoes.filter((a) => a.numeroEquipe === numeros[0]).length,
      resumo,
    });
  } catch (e) {
    console.error("[POST /api/ferias/rodizio]", e);
    return NextResponse.json({ erro: "Falha ao aplicar o rodízio." }, { status: 500 });
  }
}
