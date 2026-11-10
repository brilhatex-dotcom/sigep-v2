import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { dataExtensoISO, hojeISO } from "@/lib/gerarParecerArma";
import { toISO, type Afastamento } from "@/lib/afastamentosPlano";
import { trechosComGuerra } from "@/lib/planoFeriasXlsx";
import { ehOficial } from "@/lib/comportamento";

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
  // da ficha/requerimento: nome de guerra (negrito), número/barra e ID PMMA
  nomeGuerra?: string | null;
  numeroBarra?: string | null;
  idPmma?: string | null;
  inicio?: string | null;   // aaaa-mm-dd (primeiro dia de férias)
  fim?: string | null;      // aaaa-mm-dd (último dia de férias)
  data?: string | null;     // aaaa-mm-dd do documento; vazio = hoje
  /* Assinado no SIGEP pelo requerente: o carimbo (com o QR da verificação
     pública) entra no lugar da linha de assinatura. */
  carimbo?: CarimboDocx | null;
};

export type CarimboDocx = {
  id: string;        // "AS-2026-000123"
  nome: string;      // quem assinou
  cargo: string;     // "Militar interessado"
  quando: string;    // ISO da assinatura
  qrPng: Buffer;     // QR que aponta para /verificar/assinatura/<id>?t=<token>
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
  const mat = matriculaEId(d);
  doc.render({
    militar: MARCA_MILITAR,
    matriculaTexto: mat.texto,
    matriculaAssinatura: mat.assinatura,
    inicio: dataBR(toISO(d.inicio)),
    fim: dataBR(toISO(d.fim)),
    data: dataExtensoISO(s(d.data) || hojeISO()),
  });
  const zip = doc.getZip();
  // o militar entra por trechos: graduação/número/barra (ou posto) e nome de guerra em negrito
  zip.file("word/document.xml", trocarMarcaPorTrechos(zip.file("word/document.xml")!.asText(), MARCA_MILITAR, trechosDoMilitar(d)));
  if (d.carimbo) inserirCarimbo(zip, d.carimbo);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/* ---------------------------------------------------------------------------
   O MILITAR, COM NEGRITO — como o P/1 escreve:
     praça:   **3º Sargento nº 123/07** José Carlos Vieira **Moraes** dos Santos
     oficial: **Capitão** José Carlos Vieira **Moraes** dos Santos
   (oficial não leva número/barra). O nome de guerra é marcado dentro do nome
   completo pela mesma regra do Plano de Férias.
   --------------------------------------------------------------------------- */
const MARCA_MILITAR = "§§MILITAR§§";
export type Trecho = { t: string; b: boolean };

export function trechosDoMilitar(d: DadosExposicao): Trecho[] {
  const posto = s(d.postoGrad);
  const barra = s(d.numeroBarra);
  const nome = s(d.nomeCompleto);
  const cabeca = ehOficial(posto) ? posto : [posto, barra ? `nº ${barra}` : ""].filter(Boolean).join(" ");
  const out: Trecho[] = [];
  if (cabeca) out.push({ t: cabeca, b: true });
  if (nome) {
    if (out.length) out.push({ t: " ", b: false });
    out.push(...trechosComGuerra(nome, s(d.nomeGuerra) || null));
  }
  return out.length ? out : [{ t: "______________________________", b: false }];
}

/* Matrícula e ID: os dois quando diferentes; um só ("Matrícula") quando são
   o mesmo número ou não há ID. */
export function matriculaEId(d: DadosExposicao): { texto: string; assinatura: string } {
  const mat = s(d.matricula);
  const id = s(d.idPmma);
  const so = (v: string) => v.replace(/\D/g, "");
  const iguais = !id || (!!mat && so(mat) === so(id));
  const m = mat || "____________";
  return iguais
    ? { texto: `matrícula nº ${m}`, assinatura: `Matrícula nº ${m}` }
    : { texto: `matrícula nº ${m} e ID nº ${id}`, assinatura: `Matrícula nº ${m} / ID nº ${id}` };
}

/* Troca a marca, dentro do run onde ela caiu, por vários runs com a mesma
   formatação do texto em volta — os do trecho em negrito ganham <w:b/>. */
export function trocarMarcaPorTrechos(xml: string, marca: string, trechos: Trecho[]): string {
  let pos = xml.indexOf(marca);
  while (pos >= 0) {
    const iniRun = Math.max(xml.lastIndexOf("<w:r>", pos), xml.lastIndexOf("<w:r ", pos));
    const iniT = xml.lastIndexOf("<w:t", pos);
    if (iniRun < 0 || iniT < iniRun) break;
    const abreT = xml.indexOf(">", iniT) + 1;
    const rPr = (xml.slice(iniRun, iniT).match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const comNegrito = rPr ? rPr.replace("<w:rPr>", "<w:rPr><w:b/><w:bCs/>") : "<w:rPr><w:b/><w:bCs/></w:rPr>";
    const runs = trechos.map((x) => `<w:r>${x.b ? comNegrito : rPr}<w:t xml:space="preserve">${esc(x.t)}</w:t></w:r>`).join("");
    xml = xml.slice(0, iniT) + '<w:t xml:space="preserve">' + xml.slice(abreT, pos) + "</w:t></w:r>" + runs +
      `<w:r>${rPr}<w:t xml:space="preserve">` + xml.slice(pos + marca.length);
    pos = xml.indexOf(marca);
  }
  return xml;
}

/* ---------------------------------------------------------------------------
   CARIMBO SIGEP NO WORD — o mesmo desenho do carimbo das telas (borda azul,
   QR à esquerda, "Assinado eletronicamente — SIGEP · 18º BPM", nome, cargo e
   data, código de autenticação). Entra no lugar da linha "______" de
   assinatura; o nome, a matrícula e o "18° BPM" do modelo continuam embaixo.
   --------------------------------------------------------------------------- */
const LINHA_ASSINATURA = "________________________________________";
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function run(texto: string, o: { negrito?: boolean; cor?: string; tam?: number } = {}): string {
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.negrito ? "<w:b/>" : ""}` +
    `${o.cor ? `<w:color w:val="${o.cor}"/>` : ""}<w:sz w:val="${o.tam ?? 15}"/><w:szCs w:val="${o.tam ?? 15}"/></w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}
const par = (conteudo: string) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${conteudo}</w:p>`;

export function xmlCarimbo(c: Omit<CarimboDocx, "qrPng">, relId: string): string {
  const lado = 720000; // 2 cm em EMU
  const quando = /^\d{4}-\d{2}-\d{2}/.test(c.quando)
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(c.quando))
    : c.quando;
  const desenho =
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${lado}" cy="${lado}"/>` +
    `<wp:docPr id="9001" name="QR SIGEP"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="9001" name="qr_sigep.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${lado}" cy="${lado}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const borda = (lado: string) => `<w:${lado} w:val="single" w:sz="6" w:space="0" w:color="1351B4"/>`;
  return `<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:w="5600" w:type="dxa"/>` +
    `<w:tblBorders>${borda("top")}${borda("left")}${borda("bottom")}${borda("right")}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="1450"/><w:gridCol w:w="4150"/></w:tblGrid><w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="1450" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${desenho}</w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="4150" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>` +
    par(run("✔ Assinado eletronicamente — SIGEP · 18º BPM", { negrito: true, cor: "1351B4", tam: 15 })) +
    par(run(c.nome.toUpperCase(), { negrito: true })) +
    par(run(`${c.cargo} · ${quando}`)) +
    par(run(`Autenticação (aponte o QR): ${c.id}`, { cor: "555555", tam: 14 })) +
    `</w:tc></w:tr></w:tbl>`;
}

function inserirCarimbo(zip: PizZip, c: CarimboDocx) {
  const relId = "rIdQrSigep";
  let xml = zip.file("word/document.xml")!.asText();
  const pos = xml.indexOf(LINHA_ASSINATURA);
  if (pos < 0) return;
  const ini = Math.max(xml.lastIndexOf("<w:p>", pos), xml.lastIndexOf("<w:p ", pos));
  const fim = xml.indexOf("</w:p>", pos) + "</w:p>".length;
  if (ini < 0 || fim < pos) return;
  xml = xml.slice(0, ini) + xmlCarimbo(c, relId) + xml.slice(fim);
  zip.file("word/document.xml", xml);

  const rels = zip.file("word/_rels/document.xml.rels")!.asText();
  if (!rels.includes(relId)) {
    zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>",
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/qr_sigep.png"/></Relationships>`));
  }
  const tipos = zip.file("[Content_Types].xml")!.asText();
  if (!/Extension="png"/i.test(tipos)) {
    zip.file("[Content_Types].xml", tipos.replace("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/>`));
  }
  zip.file("word/media/qr_sigep.png", c.qrPng);
}
