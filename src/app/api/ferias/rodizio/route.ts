import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rotacionar, mapaRodizio } from "@/lib/distribuirEquipes";
import { incluirNoPlano, saidosAntesDaPublicacao } from "@/lib/feriasForaDoPlano";

export const dynamic = "force-dynamic";

/* POST /api/ferias/rodizio   { anoDestino, anoOrigem }

   Monta a composição do plano de `anoDestino` a partir do RODÍZIO do plano de
   `anoOrigem`: cada equipe desce um número e a primeira do rodízio dá a volta
   para a última (2 -> 9, 3 -> 2, ... 9 -> 8). A equipe 1 fica de fora, com os
   mesmos militares.

   Como cada equipe tem o seu período no calendário, o rodízio faz todo mundo
   revezar a época do ano em vez de ficar sempre com o mesmo mês.

   RODÍZIO PURO, sem exceção: quem estava na 9 vai para a 8, quem estava na
   2 vai para a 9, a equipe 1 continua a 1. Antes, depois de rodar, havia uma
   "correção de equilíbrio" que movia gente para a equipe mais vazia da
   unidade — e alguém da 8 aparecia na 4. Equilibrar agora é só no botão
   Reequilibrar, quando o P/1 decidir.

   NÃO cria nem apaga equipes, e NÃO toca nas datas do ano de destino —
   só troca quem está em cada equipe.

   SÓ NO PLANO DO PRÓXIMO EXERCÍCIO, como o Reequilibrar: refazer as equipes
   do ano em andamento desfaz o que já foi combinado com a tropa. Antes de
   trocar, guarda a composição (a mesma cópia do Reequilibrar — o botão
   "Desfazer reequilíbrio" volta como estava). Depois, quem está no efetivo e
   não veio do plano de origem (não estava em equipe nenhuma) entra na equipe
   sugerida — menos os adidos. */

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
    const anoCorrente = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
    if (Number(anoDestino) <= anoCorrente) {
      return NextResponse.json({
        erro: `O rodízio só vale para o plano do PRÓXIMO exercício. O plano de ${anoDestino} está em andamento e não pode ser refeito.`,
      }, { status: 403 });
    }

    const equipesDestino = await prisma.equipeFerias.findMany({ where: { anoGozo: anoDestino } });
    if (!equipesDestino.length) {
      return NextResponse.json({ erro: `Não existe plano para ${anoDestino}. Crie o plano primeiro.` }, { status: 404 });
    }

    // quem saiu da unidade ANTES da publicação do plano (outubro do ano
    // anterior) não vai para ele; quem sai depois, continua
    const saidos = await saidosAntesDaPublicacao(anoDestino);
    const membrosOrigem = (await prisma.membroFerias.findMany({ where: { anoGozo: anoOrigem } }))
      .filter((m) => !saidos.has(m.idPmma));
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

    // quem estava numa equipe que não existe no destino não tem para onde
    // rodar: entra depois como "fora do plano" (e a tela diz quantos)
    const semEquipeNoDestino = new Set(membrosOrigem.filter((m) => !numerosSet.has(m.numeroEquipe)).map((m) => m.idPmma)).size;

    const atribuicoes = rotacionar(numeros, origemUtil.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe })));

    const atuais = await prisma.membroFerias.findMany({ where: { anoGozo: anoDestino } });
    const backup = JSON.stringify({
      em: new Date().toISOString(),
      por: String((session.user as any).login || session.user.name || ""),
      membros: atuais.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe, dataCadastro: m.dataCadastro ?? null })),
    });
    await prisma.$transaction([
      // cópia da composição atual — "Desfazer reequilíbrio" volta para ela
      prisma.config.upsert({
        where: { chave: `ferias_reequilibrio_backup_${anoDestino}` },
        update: { valor: backup },
        create: { chave: `ferias_reequilibrio_backup_${anoDestino}`, valor: backup, descricao: "Composição do plano de férias antes do último reequilíbrio/rodízio" },
        select: { chave: true },
      }),
      prisma.membroFerias.deleteMany({ where: { anoGozo: anoDestino } }),
      prisma.membroFerias.createMany({
        data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo: anoDestino })),
        skipDuplicates: true,
      }),
    ]);

    // quem não veio do plano de origem (e não é adido) entra agora
    let novosIncluidos = 0;
    try { novosIncluidos = (await incluirNoPlano(anoDestino)).length; }
    catch (e) { console.error("[rodizio] incluir fora do plano", e); }

    // resumo do rodízio para mostrar na tela ("2 → 9, 3 → 2, ...")
    const mapa = mapaRodizio(numeros);
    const resumo = numeros.slice(1).map((e) => `${e}→${mapa.get(e)}`).join(", ");

    return NextResponse.json({
      ok: true,
      anoDestino, anoOrigem,
      total: atribuicoes.length,
      semEquipeNoDestino,
      equipe1: atribuicoes.filter((a) => a.numeroEquipe === numeros[0]).length,
      resumo,
      novosIncluidos,
    });
  } catch (e) {
    console.error("[POST /api/ferias/rodizio]", e);
    return NextResponse.json({ erro: "Falha ao aplicar o rodízio." }, { status: 500 });
  }
}
