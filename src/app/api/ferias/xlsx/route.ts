import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { abrevPosto } from "@/lib/refMilitar";
import { compararAntiguidade } from "@/lib/antiguidade";
import { dataBR, hojeBR } from "@/lib/ferias";
import { registrar } from "@/lib/auditoria";
import { gerarPlanoFeriasXlsx, type EquipePlano, type QuemPlano } from "@/lib/planoFeriasXlsx";

export const dynamic = "force-dynamic";

/* GET /api/ferias/xlsx?ano=2027&quem=oficiais|pracas|todos
   O Plano de Férias do ano em Excel: só os oficiais, só as praças ou todos.

   Papel no padrão da Escala de Serviço — mesmos brasões (Config
   "escala_brasoes", a do Batalhão) e o mesmo texto da organização, SEM o
   VISTO — e, no fim, a assinatura do Cmt da unidade: a imagem e o nome que
   estão na aba "Chefe do P1" da escala (Config "escala_chefe_p1").

   O layout segue os modelos do P/1: as praças em uma tabela por equipe
   (com o período de cada uma); os oficiais numa tabela só, por hierarquia.
   "todos" = as duas abas no mesmo arquivo.

   Só o administrador (P/1): o arquivo leva a imagem da assinatura do Cmt. */

const BRASOES_PADRAO = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};
const CMT_PADRAO = {
  nome: "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS",
  assinatura: "/brasoes/assinatura-cmt.png",
};
const QUEM: QuemPlano[] = ["oficiais", "pracas", "todos"];
const SUFIXO: Record<QuemPlano, string> = { oficiais: "Oficiais", pracas: "Pracas", todos: "Oficiais_e_Pracas" };
const ROTULO: Record<QuemPlano, string> = { oficiais: "oficiais", pracas: "praças", todos: "oficiais e praças" };

const ehOficial = (postoGrad: string | null) => classificarPatente(postoGrad).ordem <= 7;

/* O posto COM o quadro, como nos modelos: "TEN CEL QOEM", "CAP QOMUS",
   "SD PM". Praça sem quadro na ficha é PM; oficial sem quadro fica só o posto. */
function postoComQuadro(postoGrad: string | null, quadro: string | null): string {
  const posto = abrevPosto(postoGrad || "");
  const q = (quadro || "").trim().toUpperCase() || (ehOficial(postoGrad) ? "" : "PM");
  if (!posto) return q;
  return q && !posto.split(/\s+/).includes(q) ? `${posto} ${q}` : posto;
}

function lerJson(valor: string | null | undefined): any {
  try { return valor ? JSON.parse(valor) : null; } catch { return null; }
}
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : "");

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const ano = String(sp.get("ano") || "").trim();
  if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "Informe o ano (AAAA)." }, { status: 400 });
  const quem: QuemPlano = QUEM.includes(sp.get("quem") as QuemPlano) ? (sp.get("quem") as QuemPlano) : "todos";

  try {
    const [equipes, membros, rowBrasoes, rowChefe] = await Promise.all([
      prisma.equipeFerias.findMany({ where: { anoGozo: ano } }),
      prisma.membroFerias.findMany({ where: { anoGozo: ano } }),
      prisma.config.findUnique({ where: { chave: "escala_brasoes" } }).catch(() => null),
      prisma.config.findUnique({ where: { chave: "escala_chefe_p1" } }).catch(() => null),
    ]);
    if (!equipes.length) return NextResponse.json({ error: `Não há plano de férias para ${ano}.` }, { status: 404 });

    const fichas = await prisma.efetivo.findMany({
      where: { id: { in: Array.from(new Set(membros.map((m) => m.idPmma))) } },
      select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true, quadro: true, dataPromocao: true },
    });
    const mapaFicha = new Map(fichas.map((f) => [f.id, f]));
    // a posição de cada um na hierarquia do batalhão (a tabela dos oficiais junta as equipes)
    const antiguidade = new Map([...fichas].sort(compararAntiguidade).map((f, i) => [f.id, i]));

    const plano: EquipePlano[] = [...equipes]
      .sort((a, b) => Number(a.numeroEquipe) - Number(b.numeroEquipe))
      .map((e) => {
        const periodos = [{ rotulo: "1º período", inicio: e.periodo1Inicio, fim: e.periodo1Fim, apres: e.periodo1Apres }];
        if (e.periodo2Inicio && e.periodo2Fim) {
          periodos.push({ rotulo: "2º período", inicio: e.periodo2Inicio, fim: e.periodo2Fim, apres: e.periodo2Apres });
        }
        // o mesmo militar não sai duas vezes na mesma equipe
        const ids = Array.from(new Set(membros.filter((m) => m.numeroEquipe === e.numeroEquipe).map((m) => m.idPmma)));
        const doRecorte = ids
          .map((id) => mapaFicha.get(id))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .filter((f) => quem === "todos" || (quem === "oficiais") === ehOficial(f.postoGrad))
          // ordem de hierarquia: posto, data da promoção, número/barra, nome
          .sort(compararAntiguidade);
        return {
          numero: e.numeroEquipe,
          periodos: periodos.map((p) => ({ rotulo: p.rotulo, inicio: dataBR(p.inicio), fim: dataBR(p.fim), apres: dataBR(p.apres) })),
          membros: doRecorte.map((f) => ({
            id: f.id, postoGrad: postoComQuadro(f.postoGrad, f.quadro), numeroBarra: f.numeroBarra, nome: f.nome,
            nomeGuerra: f.nomeGuerra, matricula: f.matricula,
            oficial: ehOficial(f.postoGrad), antiguidade: antiguidade.get(f.id) ?? 0,
          })),
        };
      });

    const br = lerJson(rowBrasoes?.valor) || {};
    const chefe = lerJson(rowChefe?.valor) || {};
    const buf = await gerarPlanoFeriasXlsx(plano, {
      ano, quem,
      brasoes: {
        pmma: texto(br.pmma) || BRASOES_PADRAO.pmma,
        ma: texto(br.ma) || BRASOES_PADRAO.ma,
        bpm: texto(br.bpm) || BRASOES_PADRAO.bpm,
      },
      cmt: {
        nome: texto(chefe.comandante) || CMT_PADRAO.nome,
        cargo: "Comandante do 18º BPM",
        assinatura: texto(chefe.cmtAssinatura) || CMT_PADRAO.assinatura,
      },
      hoje: hojeBR(),
    });

    const total = plano.reduce((s, e) => s + e.membros.length, 0);
    await registrar({
      acao: "ferias_plano_excel", alvo: ano,
      detalhe: `Baixou o Plano de Férias ${ano} em Excel (${ROTULO[quem]}) com ${total} militar(es).`,
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Plano_Ferias_${ano}_${SUFIXO[quem]}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/ferias/xlsx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Excel do plano." }, { status: 500 });
  }
}
