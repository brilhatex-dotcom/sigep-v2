import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rotacionar, mapaRodizio } from "@/lib/distribuirEquipes";
import { incluirNoPlano, saidosAntesDaPublicacao } from "@/lib/feriasForaDoPlano";

/* POST /api/ferias/novo-plano
   Cria o plano de ferias de um NOVO ano de gozo, com as datas em branco para o
   admin preencher.

   Por padrao o plano novo sai por RODIZIO, a regra do Batalhao: cada equipe
   desce um numero e a primeira do rodizio da a volta para a ultima
   (2 -> 9, 3 -> 2, ... 9 -> 8). A EQUIPE 1 fica de fora, com os mesmos
   militares.

   Como cada equipe tem o seu periodo no calendario, o rodizio faz todo mundo
   revezar a epoca do ano, em vez de ficar sempre com o mesmo mes.

   RODIZIO PURO, sem excecao (ver rotacionar em lib/distribuirEquipes): nao
   ha mais "correcao de equilibrio" movendo gente para fora do rodizio.
   Equilibrar e decisao do P/1, no botao Reequilibrar.

   body: { anoDestino, anoOrigem?, equilibrar? }
     equilibrar (padrao true) — false faz a copia crua, sem rodizio (o nome
     ficou por compatibilidade). */
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
    let modo: "rodizio" | "copia" = "copia";

    if (orig) {
      // quem saiu da unidade ANTES da publicação do plano (outubro do ano
      // anterior) não vai para ele; quem sai depois, continua
      const saidos = await saidosAntesDaPublicacao(dest);
      const membros = (await prisma.membroFerias.findMany({ where: { anoGozo: orig } }))
        .filter((m) => !saidos.has(m.idPmma));

      if (membros.length) {
        const querRodizio = equilibrar !== false;
        let atribuicoes = membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe }));

        if (querRodizio) {
          // RODÍZIO PURO: cada equipe desce um número, a 2 dá a volta para a
          // última, a 1 fica — sem mover ninguém por fora da regra.
          atribuicoes = rotacionar(numeros, atribuicoes);
          modo = "rodizio";
        }

        const criados = await prisma.membroFerias.createMany({
          data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo: dest })),
          skipDuplicates: true,
        });
        membrosCopiados = criados.count;
      }
    }

    /* Quem chegou à unidade e não estava em equipe nenhuma do plano de origem
       entra AGORA, na equipe com menos gente da unidade dele (fora a 1).
       Só quando o plano nasce de outro: plano em branco é montado à mão. */
    let novosIncluidos = 0;
    if (orig) {
      try { novosIncluidos = (await incluirNoPlano(dest)).length; }
      catch (e) { console.error("[novo-plano] incluir fora do plano", e); }
    }

    // resumo do rodizio para mostrar na tela ("2→9, 3→2, ...")
    const mapa = mapaRodizio(numeros);
    const resumo = modo === "rodizio" ? numeros.slice(1).map((e) => `${e}→${mapa.get(e)}`).join(", ") : "";

    return NextResponse.json({
      ok: true, ano: dest, equipes: numeros.length, membros: membrosCopiados,
      modo, resumo, novosIncluidos,
    });
  } catch (e) {
    console.error("[POST /api/ferias/novo-plano]", e);
    return NextResponse.json({ erro: "Falha ao criar o plano." }, { status: 500 });
  }
}
