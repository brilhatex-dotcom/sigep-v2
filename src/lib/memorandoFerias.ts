import { prisma } from "@/lib/prisma";
import { paraData, dataBR } from "@/lib/datas";
import { assinaturasDoDoc } from "@/lib/assinaturaSigep";
import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   Memorando de férias / licença-prêmio do MILITAR.

   Monta, no servidor, tudo que a tela do policial precisa: o período, os
   dias, a data de apresentação e quem já assinou. É a mesma referência
   usada na assinatura em lote do Plano de Férias — "<idPmma>:<ano>" —
   para as duas telas falarem do mesmo documento.
   ========================================================================= */

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

export type EstadoMemorando = "pendente" | "assinado_militar" | "concluido";

export type PeriodoMemorando = { rotulo: string; inicioBR: string; fimBR: string; apresBR: string };

export type MemorandoMilitar = {
  ref: string;              // "<idPmma>:<ano>"
  tipo: "memorando_ferias" | "memorando_lp";
  anoGozo: string;
  numeroEquipe: string;
  rotuloPeriodo: string;    // "1º período" / "1º e 2º períodos" / "Licença-Prêmio"
  periodos: PeriodoMemorando[];
  inicioBR: string;
  fimBR: string;
  apresentacaoBR: string;
  inicioExtenso: string;
  apresExtenso: string;
  dias: number;
  // do militar
  efetivoId: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  nomeGuerra: string;
  quadro: string;
  ehOficial: boolean;
  // andamento
  estado: EstadoMemorando;
  assinaturaMilitar: { nome: string; em: string; id: string } | null;
  assinaturaChefe: { nome: string; cargo: string; em: string; id: string } | null;
  diasParaComecar: number | null;  // negativo = já começou
};

function extenso(br: string): string {
  const d = paraData(br);
  if (!d) return br || "";
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function somaDiasBR(br: string, n: number): string {
  const d = paraData(br);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function diasEntre(iniBR: string, fimBR: string): number {
  const a = paraData(iniBR), b = paraData(fimBR);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

/** Memorandos do militar: um por período de férias do plano (e a LP). */
export async function memorandosDoMilitar(efetivoId: string): Promise<MemorandoMilitar[]> {
  if (!efetivoId) return [];

  const ficha = await prisma.efetivo.findUnique({
    where: { id: efetivoId },
    select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, quadro: true },
  });
  if (!ficha) return [];

  const base = {
    efetivoId: ficha.id,
    postoGrad: ficha.postoGrad ?? "",
    numeroBarra: ficha.numeroBarra ?? "",
    nome: ficha.nome ?? "",
    nomeGuerra: ficha.nomeGuerra ?? "",
    quadro: ficha.quadro ?? "",
    ehOficial: classificarPatente(ficha.postoGrad).ordem <= 7,
  };

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const saida: MemorandoMilitar[] = [];

  /* ---------- férias do plano ---------- */
  const membros = await prisma.membroFerias.findMany({ where: { idPmma: efetivoId } });
  for (const m of membros) {
    const eq = await prisma.equipeFerias.findFirst({
      where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo },
    });
    if (!eq) continue;

    /* Um único memorando por ano de gozo — é a mesma granularidade da
       assinatura em lote do Plano de Férias ("<idPmma>:<ano>"). Os dois
       períodos entram como detalhamento dentro do mesmo documento; se
       fossem dois cartões, o militar assinaria um e o outro mudaria
       sozinho, porque a assinatura é a mesma. */
    const periodos: PeriodoMemorando[] = [];
    for (const p of [
      { rot: "1º período", i: eq.periodo1Inicio, f: eq.periodo1Fim, a: eq.periodo1Apres },
      { rot: "2º período", i: eq.periodo2Inicio, f: eq.periodo2Fim, a: eq.periodo2Apres },
    ]) {
      if (!p.i && !p.f) continue;
      const inicioBR = dataBR(p.i);
      if (inicioBR === "—") continue;
      const fimBR = dataBR(p.f);
      const apresBR = p.a && dataBR(p.a) !== "—" ? dataBR(p.a) : somaDiasBR(fimBR, 1);
      periodos.push({ rotulo: p.rot, inicioBR, fimBR: fimBR === "—" ? "" : fimBR, apresBR });
    }
    if (!periodos.length) continue;

    const primeiro = periodos[0];
    const ultimo = periodos[periodos.length - 1];
    const ref = `${efetivoId}:${m.anoGozo}`;
    const assin = await assinaturasDoDoc("memorando_ferias", ref).catch(() => []);
    const doMilitar = assin.find((a) => a.papel === "militar") || null;
    const doChefe = assin.find((a) => a.papel === "chefe_p1" || a.papel === "cmt") || null;

    const ini = paraData(primeiro.inicioBR);
    const dias = periodos.reduce((t, p) => t + (p.fimBR ? diasEntre(p.inicioBR, p.fimBR) : 0), 0);
    saida.push({
      ref, tipo: "memorando_ferias",
      anoGozo: m.anoGozo, numeroEquipe: m.numeroEquipe,
      rotuloPeriodo: periodos.map((p) => p.rotulo).join(" e "),
      periodos,
      inicioBR: primeiro.inicioBR, fimBR: ultimo.fimBR, apresentacaoBR: ultimo.apresBR,
      inicioExtenso: extenso(primeiro.inicioBR), apresExtenso: extenso(ultimo.apresBR),
      dias: dias || 35,
      ...base,
      estado: doChefe ? "concluido" : doMilitar ? "assinado_militar" : "pendente",
      assinaturaMilitar: doMilitar ? { nome: doMilitar.nome, em: doMilitar.em, id: doMilitar.id } : null,
      assinaturaChefe: doChefe ? { nome: doChefe.nome, cargo: doChefe.cargo, em: doChefe.em, id: doChefe.id } : null,
      diasParaComecar: ini ? Math.round((ini.getTime() - hoje.getTime()) / 86400000) : null,
    });
  }

  /* ---------- licença-prêmio ---------- */
  try {
    const mbs = await prisma.membroLicencaPremio.findMany({ where: { idPmma: efetivoId } });
    for (const m of mbs) {
      const eq = await prisma.equipeLicencaPremio.findFirst({
        where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo },
      });
      if (!eq?.periodoInicio) continue;
      const inicioBR = dataBR(eq.periodoInicio);
      const fimBR = dataBR(eq.periodoFim);
      if (inicioBR === "—") continue;
      const apresBR = fimBR !== "—" ? somaDiasBR(fimBR, 1) : "";
      const ref = `${efetivoId}:${m.anoGozo}`;
      const assin = await assinaturasDoDoc("memorando_lp", ref).catch(() => []);
      const doMilitar = assin.find((a) => a.papel === "militar") || null;
      const doChefe = assin.find((a) => a.papel === "chefe_p1" || a.papel === "cmt") || null;
      const ini = paraData(inicioBR);
      saida.push({
        ref, tipo: "memorando_lp",
        anoGozo: m.anoGozo, numeroEquipe: m.numeroEquipe, rotuloPeriodo: "Licença-Prêmio",
        periodos: [{ rotulo: "Licença-Prêmio", inicioBR, fimBR: fimBR === "—" ? "" : fimBR, apresBR }],
        inicioBR, fimBR: fimBR === "—" ? "" : fimBR, apresentacaoBR: apresBR,
        inicioExtenso: extenso(inicioBR), apresExtenso: extenso(apresBR),
        dias: fimBR !== "—" ? diasEntre(inicioBR, fimBR) : 90,
        ...base,
        estado: doChefe ? "concluido" : doMilitar ? "assinado_militar" : "pendente",
        assinaturaMilitar: doMilitar ? { nome: doMilitar.nome, em: doMilitar.em, id: doMilitar.id } : null,
        assinaturaChefe: doChefe ? { nome: doChefe.nome, cargo: doChefe.cargo, em: doChefe.em, id: doChefe.id } : null,
        diasParaComecar: ini ? Math.round((ini.getTime() - hoje.getTime()) / 86400000) : null,
      });
    }
  } catch { /* módulo de LP pode não existir ainda */ }

  saida.sort((a, b) => (paraData(a.inicioBR)?.getTime() ?? 0) - (paraData(b.inicioBR)?.getTime() ?? 0));
  return saida;
}

/** O texto que é assinado — precisa bater nas duas pontas (militar e chefe). */
export function conteudoAssinatura(m: {
  tipo: string; efetivoId: string; anoGozo: string; inicioBR: string; apresentacaoBR: string;
}): string {
  const chave = m.tipo === "memorando_lp" ? "lp" : "ferias";
  return `${chave}|${m.efetivoId}|${m.anoGozo}|${m.inicioBR}|${m.apresentacaoBR}`;
}
