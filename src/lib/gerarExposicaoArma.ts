import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { dataExtensoISO, hojeISO } from "@/lib/gerarParecerArma";
import { toISO, type Afastamento } from "@/lib/afastamentosPlano";

/* =========================================================================
   EXPOSIÇÃO DE MOTIVOS — PERMANÊNCIA COM O ARMAMENTO NAS FÉRIAS

   É o "documento em anexo" do requerimento de AUTORIZAÇÃO DE PERMANÊNCIA DE
   ARMAMENTO: toda vez que o policial pede para ficar com a arma cautelada nas
   férias, a exposição de motivos vai junto. Como a declaração de parecer
   favorável da aquisição de arma, ela sai do MESMO requerimento — posto, nome
   e matrícula do que já foi preenchido lá — e o período vem do plano de férias
   do militar (o escalante/policial pode ajustar as datas antes de baixar).

   Quem assina é o próprio requerente.

   Template: /public/templates/exposicao_motivos_arma.docx (o modelo do P/1).
   ========================================================================= */

export type DadosExposicao = {
  postoGrad?: string | null;
  nomeCompleto?: string | null;
  matricula?: string | null;
  inicio?: string | null;   // aaaa-mm-dd (primeiro dia de férias)
  fim?: string | null;      // aaaa-mm-dd (último dia de férias)
  data?: string | null;     // aaaa-mm-dd do documento; vazio = hoje
};

const s = (v: string | null | undefined) => (v == null ? "" : String(v).trim());
const LINHA_DATA = "____/____/______";

// "2026-12-01" -> "01/12/2026"; sem data, a linha para completar à mão
export function dataBR(iso: string | null | undefined): string {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : LINHA_DATA;
}

/* O período de férias que a exposição deve citar: o que está em curso ou o
   próximo a começar (o pedido é feito antes de sair de férias). Entre os
   períodos do plano/avulsos do militar, o primeiro que ainda não acabou. */
export function periodoDaExposicao(
  afastamentos: Afastamento[], idPmma: string, hoje: string,
): { inicio: string; fim: string } | null {
  const meus = afastamentos
    .filter((a) => a.militar === idPmma && a.tipo === "ferias" && a.inicio && a.fim && a.fim >= hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  return meus.length ? { inicio: meus[0].inicio, fim: meus[0].fim } : null;
}

export function gerarExposicaoArmaDocx(d: DadosExposicao): Buffer {
  const caminho = path.join(process.cwd(), "public", "templates", "exposicao_motivos_arma.docx");
  let content: string;
  try {
    content = fs.readFileSync(caminho, "binary");
  } catch (e) {
    throw new Error(`Template DOCX nao encontrado em "${caminho}": ${(e as Error)?.message || e}`);
  }
  const doc = new Docxtemplater(new PizZip(content), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });
  doc.render({
    militar: [s(d.postoGrad), s(d.nomeCompleto)].filter(Boolean).join(" ") || "______________________________",
    matricula: s(d.matricula) || "____________",
    inicio: dataBR(toISO(d.inicio)),
    fim: dataBR(toISO(d.fim)),
    data: dataExtensoISO(s(d.data) || hojeISO()),
  });
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
