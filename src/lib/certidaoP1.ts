import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { classificarPatente } from "@/lib/patentes";
import { ehCpopm } from "@/lib/certidoes";

/* =========================================================================
   DECLARAÇÃO INDIVIDUAL — promoção (Of. Circular nº 003/2026-CAE)

   Antes era a "CERTIDÃO Nº 002/2026 – P/1", em que o P/1 certificava. O
   modelo mudou: agora é o PRÓPRIO MILITAR quem declara, em primeira pessoa,
   que protocolou no P/1 as certidões negativas, que não é réu nem cumpre
   pena, e assina como "Declarante". Por isso não há mais número nem portaria
   no texto. (Os nomes certidaoP1/CertidaoP1 no código ficaram da versão
   anterior; o que sai é a declaração.)

   A Justiça Federal muda conforme o posto: oficial e subtenente (os que
   concorrem pela CPOPM) declaram da 1ª à 6ª Região; praça, da 1ª à 5ª.

   Os dados saem da ficha, mas tudo o que identifica o militar pode ser
   ajustado antes de gerar (nome, posto por extenso, quadro, matrícula, Id,
   regiões, local e data) — ver os "ajustes" em certidaoP1Db. O que ele
   declara (não é réu, não cumpre pena, SITUAÇÃO REGULAR) é texto fixo.

   Sai em dois formatos a partir do MESMO conteúdo (montarDeclaracao):
     · Word (.docx) — para conferir/ajustar antes de assinar;
     · PDF — o que vai, junto com as certidões das regiões, no arquivo único
       que sobe para o SEI.
   O PDF é desenhado aqui com o pdf-lib (a Vercel não tem Word/LibreOffice
   para converter), copiando a diagramação do modelo: brasão, cabeçalho sem
   serifa, corpo em Times 11, entrelinha 1,2 e recuo de primeira linha.
   ========================================================================= */

export const CIDADE_PADRAO = "Presidente Dutra";
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type DadosCertidaoP1 = {
  nome: string;
  nomeGuerra?: string | null;
  postoGrad?: string | null;
  matricula?: string | null;
  idPmma?: string | null;
  quadro?: string | null;
  data: string;                      // aaaa-mm-dd
  // ajustes feitos na tela (vazio = o que sai da ficha)
  postoExtenso?: string | null;      // "Major" (no lugar do calculado do posto)
  quadroDescricao?: string | null;   // "Quadro de Oficiais do Estado Maior"
  seisRegioes?: boolean | null;      // Justiça Federal da 1ª à 6ª (true) ou à 5ª
  local?: string | null;             // "Presidente Dutra"
};

type Trecho = { t: string; b?: boolean };
type Par = {
  trechos: Trecho[];
  tam: number;                       // pt
  alinhar: "centro" | "just" | "esq";
  recuo1?: number;                   // recuo da 1ª linha, em pt
  recuoEsq?: number;                 // recuo à esquerda, em pt
  entre?: number;                    // entrelinha (1 = simples, 1.2 = 1,2...)
  depois?: number;                   // espaço depois do parágrafo, em pt
  sans?: boolean;                    // sem serifa (o cabeçalho do modelo)
  sublinhado?: boolean;              // o título "DECLARAÇÃO"
};

// ---------------------------------------------------------------- textos

// "2026-07-13" -> "13 de julho de 2026"
function dataExtenso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

// "MAJ QOEM" -> "Major"; o que a régua não conhece sai como está na ficha
export function postoPorExtenso(postoGrad: string | null | undefined): string {
  const p = classificarPatente(postoGrad ?? null);
  return p.ordem === 99 ? (postoGrad ?? "").trim() : p.rotulo;
}

const QUADROS: Record<string, string> = {
  QOEM: "Quadro de Oficiais do Estado Maior",
  QOPM: "Quadro de Oficiais Policiais Militares",
  QOE: "Quadro de Oficiais Especialistas",
  QOA: "Quadro de Oficiais de Administração",
  QOAPM: "Quadro de Oficiais de Administração",
  QOS: "Quadro de Oficiais de Saúde",
  QOSPM: "Quadro de Oficiais de Saúde",
  QOC: "Quadro de Oficiais Capelães",
  QPPM: "Quadro de Praças Policiais Militares",
  QPE: "Quadro de Praças Especialistas",
};

// descrição do quadro pela sigla ("QOEM" -> "Quadro de Oficiais do Estado Maior")
export function descricaoQuadro(sigla: string | null | undefined): string {
  return QUADROS[(sigla ?? "").trim().toUpperCase()] ?? "";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function capitalizar(palavra: string): string {
  if (PARTICULAS.has(semAcento(palavra))) return palavra.toLocaleLowerCase("pt-BR");
  const min = palavra.toLocaleLowerCase("pt-BR");
  return min.charAt(0).toLocaleUpperCase("pt-BR") + min.slice(1);
}

/* "FRANS MICHEL SANTOS ALMEIDA" + guerra "FRANS" ->
   **FRANS** Michel Santos Almeida — o nome de guerra em caixa alta e negrito,
   o resto com só a inicial maiúscula, como no modelo. */
function trechosDoNome(nome: string, guerra: string | null | undefined): Trecho[] {
  const deGuerra = new Set(semAcento(guerra ?? "").split(/\s+/).filter(Boolean));
  const out: Trecho[] = [];
  const juntar = (t: string, b: boolean) => {
    const ultimo = out[out.length - 1];
    if (ultimo && !!ultimo.b === b) ultimo.t += t;
    else out.push({ t, b });
  };
  nome.trim().split(/\s+/).filter(Boolean).forEach((palavra, i) => {
    if (i > 0) juntar(" ", false);
    const b = deGuerra.has(semAcento(palavra));
    juntar(b ? palavra.toLocaleUpperCase("pt-BR") : capitalizar(palavra), b);
  });
  return out;
}

// matrícula (quem tem) + ID; quadro com a sigla em negrito
function trechosIdentidade(d: DadosCertidaoP1): Trecho[] {
  const mat = (d.matricula ?? "").trim();
  const id = (d.idPmma ?? "").trim();
  const ident = [mat ? `matrícula nº ${mat}` : "", id ? `Id nº ${id}` : ""].filter(Boolean).join(", ");
  const out: Trecho[] = ident ? [{ t: `, ${ident}` }] : [];
  const sigla = (d.quadro ?? "").trim().toUpperCase();
  if (sigla) {
    const desc = (d.quadroDescricao ?? "").trim() || QUADROS[sigla];
    out.push({ t: desc ? `, pertencente ao ${desc} (` : ", pertencente ao Quadro " });
    out.push({ t: sigla, b: true });
    if (desc) out.push({ t: ")" });
  }
  return out;
}

function montarDeclaracao(d: DadosCertidaoP1): Par[] {
  // espaçamentos do modelo: parágrafo comum com 1,15 e 10 pt depois; o corpo
  // com 1,2; o cabeçalho colado (sem espaço depois)
  const cab = (t: string): Par => ({ trechos: [{ t, b: true }], tam: 11, alinhar: "centro", sans: true, depois: 0 });
  const vazio = (): Par => ({ trechos: [], tam: 11, alinhar: "centro", entre: 1.15, depois: 10 });
  const corpo = { tam: 11, alinhar: "just" as const, recuo1: 35.45, entre: 1.2, depois: 10 };
  const seis = d.seisRegioes ?? ehCpopm(d.postoGrad);
  const regioes = seis ? "1ª, 2ª, 3ª, 4ª, 5ª e 6ª" : "1ª, 2ª, 3ª, 4ª e 5ª";
  const local = (d.local ?? "").trim() || CIDADE_PADRAO;

  return [
    cab("ESTADO DO MARANHÃO"),
    cab("SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA"),
    cab("POLÍCIA MILITAR DO MARANHÃO"),
    cab("18° BATALHÃO DE POLÍCIA MILITAR"),
    vazio(),
    { trechos: [{ t: "DECLARAÇÃO", b: true }], tam: 11, alinhar: "centro", entre: 1.15, depois: 10, sublinhado: true },
    {
      ...corpo,
      trechos: [
        { t: "Declaro para os devidos fins que eu, " },
        ...trechosDoNome(d.nome, d.nomeGuerra),
        { t: ", " },
        { t: (d.postoExtenso ?? "").trim() || postoPorExtenso(d.postoGrad), b: true },
        ...trechosIdentidade(d),
        { t: ", atualmente servindo no 18° BPM, protocolei no P/1 da minha UPM as " },
        { t: "CERTIDÕES NEGATIVAS", b: true },
        { t: " para fins de comprovação da regularidade da situação jurídica, referentes aos seguintes órgãos do Poder Judiciário:" },
      ],
    },
    { ...corpo, trechos: [{ t: "I – Justiça Estadual do Maranhão (1º e 2º graus);", b: true }] },
    { ...corpo, trechos: [{ t: "II – Justiça Militar Estadual (1º grau);", b: true }] },
    { ...corpo, trechos: [{ t: `III – Justiça Federal – Tribunais Regionais Federais da ${regioes} Regiões.`, b: true }] },
    {
      ...corpo,
      trechos: [
        { t: "Outrossim, declaro, sob as penas da lei, que não sou réu, denunciado ou parte passiva em qualquer processo criminal, inexistindo contra mim " },
        { t: "ação penal", b: true },
        { t: " em curso em qualquer juízo ou instância (Estadual, Federal ou Militar) e não estar submetido a Conselho de Justificação ou de Disciplina." },
      ],
    },
    {
      ...corpo,
      trechos: [
        { t: "Declaro, ainda, não estar cumprindo de pena ou sofrendo efeitos de condenação criminal, encontrando-me, portanto, em " },
        { t: "SITUAÇÃO REGULAR", b: true },
        { t: " perante os órgãos judiciais competentes para fins de promoção junto à PMMA, nos termos da legislação vigente." },
      ],
    },
    { ...corpo, trechos: [] },
    { trechos: [{ t: `${local}, ${dataExtenso(d.data)}.`, b: true }], tam: 11, alinhar: "centro", entre: 1.15, depois: 10 },
    vazio(), vazio(), vazio(),
    { trechos: [{ t: "________________________________", b: true }], tam: 11, alinhar: "centro", entre: 1.15, depois: 10 },
    { trechos: [{ t: "Assinatura do Declarante" }], tam: 11, alinhar: "centro", entre: 1.15, depois: 10 },
  ];
}

function brasao(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "brasoes", "brasao-ma-certidao.png"));
  } catch {
    return null;
  }
}

// Nome do arquivo: "Major FRANS MICHEL SANTOS ALMEIDA" (sem caractere proibido)
export function nomeArquivoDoMilitar(postoGrad: string | null | undefined, nome: string): string {
  const base = [postoPorExtenso(postoGrad), nome.trim().toLocaleUpperCase("pt-BR")].filter(Boolean).join(" ");
  return base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "militar";
}

// ---------------------------------------------------------------- Word

const TWIP = 20; // 1 pt = 20 twips
// brasão do modelo: 57 x 47,25 pt (em px a 96 dpi, que é o que o docx usa)
const BRASAO_PT = { w: 57, h: 47.25 };
/* No modelo o brasão é FLUTUANTE: preso ao 1º parágrafo (vazio, Calibri 11
   com entrelinha 1,5), 176,7 pt da coluna e 31,85 pt ACIMA da margem de cima.
   O cabeçalho escrito começa logo abaixo dele. */
const BRASAO_POS = { x: 176.7, y: -31.85 };
const EMU = 12700; // 1 pt = 12.700 EMU
const PAR_BRASAO = 11 * 1.22 * 1.5; // altura do parágrafo vazio do brasão

export async function gerarCertidaoP1Docx(d: DadosCertidaoP1): Promise<Buffer> {
  const img = brasao();
  const fonte = (p: Par) => (p.sans ? "Calibri" : "Times New Roman");

  const paragrafos: Paragraph[] = [];
  // 1º parágrafo vazio com o brasão flutuante, como no modelo
  paragrafos.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: 360, after: 0 },
    children: [
      ...(img ? [new ImageRun({
        type: "png",
        data: img,
        transformation: { width: Math.round(BRASAO_PT.w * 96 / 72), height: Math.round(BRASAO_PT.h * 96 / 72) },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: Math.round(BRASAO_POS.x * EMU) },
          verticalPosition: { relative: VerticalPositionRelativeFrom.MARGIN, offset: Math.round(BRASAO_POS.y * EMU) },
          wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
          allowOverlap: true,
          layoutInCell: true,
        },
      })] : []),
      new TextRun({ text: "", size: 22, font: "Calibri" }),
    ],
  }));
  for (const p of montarDeclaracao(d)) {
    const runs = p.trechos.length
      ? p.trechos.map((tr) => new TextRun({
          text: tr.t, bold: tr.b, size: p.tam * 2, font: fonte(p), underline: p.sublinhado ? {} : undefined,
        }))
      : [new TextRun({ text: "", size: p.tam * 2, font: fonte(p) })];
    paragrafos.push(new Paragraph({
      alignment: p.alinhar === "centro" ? AlignmentType.CENTER : p.alinhar === "just" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      indent: {
        firstLine: p.recuo1 ? Math.round(p.recuo1 * TWIP) : undefined,
        left: p.recuoEsq ? Math.round(p.recuoEsq * TWIP) : undefined,
      },
      spacing: { line: Math.round(240 * (p.entre ?? 1)), after: Math.round((p.depois ?? 0) * TWIP) },
      children: runs,
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1417, right: 1701, bottom: 1417, left: 1701 },
        },
      },
      children: paragrafos,
    }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- PDF

type Peca = { t: string; f: PDFFont };
type Palavra = Peca[];

// a fonte padrão do PDF só conhece o alfabeto WinAnsi: o resto vira "?"
function seguro(f: PDFFont, s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "\n" || ch === " ") { out += ch; continue; }
    try { f.encodeText(ch); out += ch; } catch { out += "?"; }
  }
  return out;
}

/* Largura SEM kerning. O widthOfTextAtSize do pdf-lib desconta os pares de
   kerning ("CERTIDÃO" sai 1,5 pt mais curto), mas o drawText desenha sem eles
   — medindo do jeito dele, cada palavra invadia o espaço seguinte e o texto
   saía grudado ("CERTIDÃONº"). Somando letra a letra, a conta bate com o que
   é desenhado. */
function larguraTexto(f: PDFFont, t: string, tam: number): number {
  let w = 0;
  for (const ch of t) w += f.widthOfTextAtSize(ch, tam);
  return w;
}

function larguraPalavra(p: Palavra, tam: number): number {
  return p.reduce((w, pc) => w + larguraTexto(pc.f, pc.t, tam), 0);
}

export async function gerarCertidaoP1Pdf(d: DadosCertidaoP1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Declaração");
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesNegrito = await pdf.embedFont(StandardFonts.TimesRomanBold);
  // o cabeçalho do modelo é sem serifa (Calibri): a Helvetica é a padrão do PDF
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89;
  const ME = 85.05, MD = 85.05, MT = 70.85, MB = 70.85;
  const largura = W - ME - MD;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - MT;

  // brasão no mesmo lugar do modelo (um pouco acima da margem) e, depois, o
  // parágrafo vazio em que ele está preso
  const img = brasao();
  if (img) {
    try {
      const png = await pdf.embedPng(img);
      const topo = H - MT - BRASAO_POS.y;
      page.drawImage(png, { x: ME + BRASAO_POS.x, y: topo - BRASAO_PT.h, width: BRASAO_PT.w, height: BRASAO_PT.h });
    } catch { /* sem brasão, segue o texto */ }
  }
  y -= PAR_BRASAO;

  for (const p of montarDeclaracao(d)) {
    const tam = p.tam;
    const normal = p.sans ? sans : times;
    const negrito = p.sans ? sansNegrito : timesNegrito;
    const alturaLinha = tam * 1.15 * (p.entre ?? 1);
    const esq = ME + (p.recuoEsq ?? 0);
    const util = largura - (p.recuoEsq ?? 0);

    // palavras (uma palavra pode misturar negrito e normal, ex.: "(QOEM),")
    // e as quebras de linha forçadas
    const tokens: (Palavra | "\n")[] = [];
    let atual: Palavra = [];
    const fecha = () => { if (atual.length) { tokens.push(atual); atual = []; } };
    for (const tr of p.trechos) {
      const f = tr.b ? negrito : normal;
      for (const ch of seguro(f, tr.t)) {
        if (ch === "\n") { fecha(); tokens.push("\n"); }
        else if (ch === " ") fecha();
        else {
          const ult = atual[atual.length - 1];
          if (ult && ult.f === f) ult.t += ch; else atual.push({ t: ch, f });
        }
      }
    }
    fecha();

    // monta as linhas
    type Linha = { palavras: Palavra[]; forcada: boolean };
    const linhas: Linha[] = [];
    let linha: Palavra[] = [];
    let usado = 0;
    const espaco = larguraTexto(normal, " ", tam);
    for (const tk of tokens) {
      if (tk === "\n") { linhas.push({ palavras: linha, forcada: true }); linha = []; usado = 0; continue; }
      const w = larguraPalavra(tk, tam);
      // o recuo de primeira linha só vale para a primeira linha do parágrafo
      const recuo = linhas.length === 0 ? (p.recuo1 ?? 0) : 0;
      const cabe = usado + (linha.length ? espaco : 0) + w <= util - recuo;
      if (!cabe && linha.length) { linhas.push({ palavras: linha, forcada: false }); linha = []; usado = 0; }
      usado += (linha.length ? espaco : 0) + w;
      linha.push(tk);
    }
    linhas.push({ palavras: linha, forcada: true });

    // desenha
    linhas.forEach((l, i) => {
      if (y - alturaLinha < MB) { page = pdf.addPage([W, H]); y = H - MT; }
      const base = y - tam * 0.89 - (alturaLinha - tam * 1.15);
      const recuo = i === 0 ? (p.recuo1 ?? 0) : 0;
      const larguras = l.palavras.map((pl) => larguraPalavra(pl, tam));
      const texto = larguras.reduce((a, b) => a + b, 0);
      const vaos = Math.max(0, l.palavras.length - 1);
      let gap = espaco;
      let x = esq + recuo;
      if (p.alinhar === "centro") {
        x = esq + (util - (texto + vaos * espaco)) / 2;
      } else if (p.alinhar === "just" && !l.forcada && vaos > 0) {
        gap = (util - recuo - texto) / vaos;
      }
      const inicio = x;
      l.palavras.forEach((pl, k) => {
        for (const pc of pl) {
          page.drawText(pc.t, { x, y: base, size: tam, font: pc.f, color: rgb(0, 0, 0) });
          x += larguraTexto(pc.f, pc.t, tam);
        }
        if (k < l.palavras.length - 1) x += gap;
      });
      // o PDF não tem "sublinhado": é uma linha fina logo abaixo do texto
      if (p.sublinhado && l.palavras.length) {
        page.drawLine({ start: { x: inicio, y: base - 1.6 }, end: { x, y: base - 1.6 }, thickness: 0.7, color: rgb(0, 0, 0) });
      }
      y -= alturaLinha;
    });
    y -= p.depois ?? 0;
  }

  return pdf.save();
}
