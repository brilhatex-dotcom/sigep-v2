import { prisma } from "@/lib/prisma";
import { classificarPatente } from "@/lib/patentes";
import { abrevPosto } from "@/lib/refMilitar";
import { compararAntiguidade } from "@/lib/antiguidade";
import { dataBR, hojeBR } from "@/lib/ferias";
import type { EquipePlano, OpcoesPlanoXlsx, QuemPlano } from "@/lib/planoFeriasXlsx";

/* =========================================================================
   Os dados do Plano de Férias no papel — os MESMOS para o Excel
   (/api/ferias/xlsx) e para a impressão/PDF (/api/ferias/impressao):
   equipes com os períodos, militares do recorte (oficiais, praças ou
   todos) em ordem de hierarquia, brasões da escala e quem assina (aba
   "Chefe do P1" da escala: Cmt e Chefe do P/1).
   ========================================================================= */

const BRASOES_PADRAO = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};
const P1_PADRAO = {
  nome: "1º TEN QOEM PAULO SILAS BARROS DE BRITO JUNIOR",
  funcao: "CHEFE DO P/1 DO 18º BPM",
};
const CMT_PADRAO = {
  nome: "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS",
  assinatura: "/brasoes/assinatura-cmt.png",
};
export const QUEM: QuemPlano[] = ["oficiais", "pracas", "todos"];
export const SUFIXO: Record<QuemPlano, string> = { oficiais: "Oficiais", pracas: "Pracas", todos: "Oficiais_e_Pracas" };
export const ROTULO: Record<QuemPlano, string> = { oficiais: "oficiais", pracas: "praças", todos: "oficiais e praças" };

const ehOficial = (postoGrad: string | null) => classificarPatente(postoGrad).ordem <= 7;

/* O posto COM o quadro, como nos modelos: "TEN CEL QOEM", "CAP QOMUS".
   Praça é sempre "PM" depois da graduação ("SD PM", "1º SGT PM" — pedido do
   P/1); oficial sem quadro na ficha fica só o posto. */
function postoComQuadro(postoGrad: string | null, quadro: string | null): string {
  const posto = abrevPosto(postoGrad || "");
  const q = ehOficial(postoGrad) ? (quadro || "").trim().toUpperCase() : "PM";
  if (!posto) return q;
  return q && !posto.split(/\s+/).includes(q) ? `${posto} ${q}` : posto;
}

function lerJson(valor: string | null | undefined): any {
  try { return valor ? JSON.parse(valor) : null; } catch { return null; }
}
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : "");

export async function dadosDoPlano(ano: string, quem: QuemPlano): Promise<{ plano: EquipePlano[]; opcoes: OpcoesPlanoXlsx } | null> {
  const [equipes, membros, rowBrasoes, rowChefe] = await Promise.all([
    prisma.equipeFerias.findMany({ where: { anoGozo: ano } }),
    prisma.membroFerias.findMany({ where: { anoGozo: ano } }),
    prisma.config.findUnique({ where: { chave: "escala_brasoes" } }).catch(() => null),
    prisma.config.findUnique({ where: { chave: "escala_chefe_p1" } }).catch(() => null),
  ]);
if (!equipes.length) return null;

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
  const opcoes: OpcoesPlanoXlsx = {
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
    p1: {
      nome: texto(chefe.nome) || P1_PADRAO.nome,
      funcao: texto(chefe.funcao) || P1_PADRAO.funcao,
      // assinando pelo gov.br, o espaço da assinatura fica em branco (como na escala)
      assinatura: chefe.assinarGov === true ? "" : texto(chefe.assinatura),
    },
    hoje: hojeBR(),
  };
  return { plano, opcoes };
}
