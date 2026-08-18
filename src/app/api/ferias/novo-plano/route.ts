import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { rotacionarComEquilibrio, mapaRodizio, type MilitarParaDistribuir } from "@/lib/distribuirEquipes";

/* POST /api/ferias/novo-plano
   Cria o plano de ferias de um NOVO ano de gozo, com as datas em branco para o
   admin preencher.

   Por padrao o plano novo sai por RODIZIO, a regra do Batalhao: cada equipe
   desce um numero e a primeira do rodizio da a volta para a ultima
   (2 -> 9, 3 -> 2, ... 9 -> 8). A EQUIPE 1 fica de fora, com os mesmos
   militares.

   Como cada equipe tem o seu periodo no calendario, o rodizio faz todo mundo
   revezar a epoca do ano, em vez de ficar sempre com o mesmo mes.

   Depois de rodar, corrigimos APENAS o que ficou desequilibrado: se o ano de
   origem tinha uma unidade concentrada numa equipe (meia duzia da ROTEM na
   mesma), o rodizio herdaria a concentracao e, quando aquela equipe saisse, a
   unidade ficaria sem ninguem. Se a origem ja esta equilibrada, ninguem e
   movido e o rodizio sai limpo.

   body: { anoDestino, anoOrigem?, equilibrar? }
     equilibrar (padrao true) — false faz a copia crua, sem rodizio. */
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
    let movidos = 0;

    if (orig) {
      const membros = await prisma.membroFerias.findMany({ where: { anoGozo: orig } });

      if (membros.length) {
        const querEquilibrar = equilibrar !== false;
        let atribuicoes = membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe }));

        if (querEquilibrar) {
          // RODÍZIO: cada equipe desce um número e a primeira do rodízio dá a
          // volta para a última (2 -> 9, 3 -> 2, ... 9 -> 8). A equipe 1 fica
          // de fora. Assim todo mundo reveza a época do ano, em vez de ficar
          // sempre com o mesmo mês. Depois do rodízio, só corrigimos o que
          // ficou desequilibrado — se a origem já estava equilibrada, o
          // rodízio sai limpo e ninguém é movido.
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

          const rodado = rotacionarComEquilibrio(
            paraDistribuir,
            numeros,
            membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe }))
          );
          atribuicoes = rodado.atribuicoes;
          movidos = rodado.movidosPorEquilibrio;
          modo = "rodizio";
        }

        const criados = await prisma.membroFerias.createMany({
          data: atribuicoes.map((a) => ({ idPmma: a.idPmma, numeroEquipe: a.numeroEquipe, anoGozo: dest })),
          skipDuplicates: true,
        });
        membrosCopiados = criados.count;
      }
    }

    // resumo do rodizio para mostrar na tela ("2→9, 3→2, ...")
    const mapa = mapaRodizio(numeros);
    const resumo = modo === "rodizio" ? numeros.slice(1).map((e) => `${e}→${mapa.get(e)}`).join(", ") : "";

    return NextResponse.json({
      ok: true, ano: dest, equipes: numeros.length, membros: membrosCopiados,
      modo, movidosPorEquilibrio: movidos, resumo,
    });
  } catch (e) {
    console.error("[POST /api/ferias/novo-plano]", e);
    return NextResponse.json({ erro: "Falha ao criar o plano." }, { status: 500 });
  }
}
