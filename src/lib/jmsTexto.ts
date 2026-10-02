import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   TEXTOS DO OFÍCIO E DA GUIA DA JMS — num lugar só

   A tela (OficioJms / GuiaEncaminhamento) usa estes textos para montar a
   folha, e o servidor usa os MESMOS para refazer um documento antigo na aba
   Emitidos (os emitidos antes de o sistema guardar a cópia de cada um).
   ========================================================================= */

export const COMANDANTE_PADRAO = "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS";
export const CARGO_CMT = "CMT DO 18º BPM";

export const OFICIO_PADRAO = {
  setor: "P/1-18º BPM",
  de: "Ten. Cel QOPM Cmt. do 18º BPM.",
  para: "Ten Cel QOSPM da JMS.",
  assunto: "Apresentação de Praça PM.",
};

export const GUIA_PADRAO = {
  informacao: "O citado policial militar encontra-se com problemas de saúde, necessitando homologar atestado médico, em anexo.",
  cidadeParecer: "São Luis - MA, ___ / ___/ ___",
};

/* "Cb PM nº 369/10" — como o militar aparece no corpo do ofício e na linha
   "Graduação:" da guia. Oficial leva o quadro e não tem numeração; praça leva
   "PM" e o nº da barra. */
export function identificacaoMilitar(m: { postoGrad?: string | null; numeroBarra?: string | null; quadro?: string | null }): string {
  const p = classificarPatente(m.postoGrad ?? "");
  const abrev = (m.postoGrad || "").trim();
  const ehOficial = p.ordem <= 7;
  const quadro = (m.quadro || "").trim().toUpperCase();
  const barra = (m.numeroBarra || "").trim();
  const base = ehOficial ? `${abrev} ${quadro || "PM"}` : `${abrev} PM`;
  return (ehOficial || !/\d/.test(barra) ? base : `${base} nº ${barra}`).replace(/\s+/g, " ").trim();
}

// Corpo do ofício, igual ao original; a data da JMS vai por extenso.
export function corpoOficioJms(ident: string, nome: string, id: string, diaPorExtenso: string): string {
  return `Apresento a Vossa Senhoria o ${ident}- ${nome}, ID n° ${id}, do 18º BPM, ` +
    `para ser avaliado por Junta Médica de Saúde, no dia ${diaPorExtenso || "___________"}.`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// "2026-05-11" -> "11 de maio de 2026" ("" se não for data)
export function isoPorExtenso(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

// "2026-05-11" -> "11/05/2026"
export function isoParaBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
}
