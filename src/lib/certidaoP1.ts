import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
  HorizontalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { classificarPatente } from "@/lib/patentes";
import { ehOficial } from "@/lib/certidoes";

/* =========================================================================
   CERTIDÃO DO P/1 — "nada consta" para a promoção (Portaria nº 040/2026-GCG)

   O P/1 certifica que o militar apresentou as certidões judiciais de "nada
   consta" exigidas pela Comissão Administrativa Especial (Of. Circular nº
   003/2026-CAE). É o modelo usado para os OFICIAIS, numerado em sequência
   ("CERTIDÃO Nº 002/2026 – P/1").

   A Justiça Federal muda conforme o posto: oficial apresenta da 1ª à 6ª
   Região; praça, da 1ª à 5ª (a 6ª é exigência só dos oficiais).

   Sai em dois formatos a partir do MESMO conteúdo (montarCertidao):
     · Word (.docx) — para conferir/ajustar antes de assinar;
     · PDF — o que vai, junto com as certidões das regiões, no arquivo único
       que sobe para o SEI.
   O PDF é desenhado aqui com o pdf-lib (a Vercel não tem Word/LibreOffice
   para converter), copiando a diagramação do modelo: brasão, cabeçalho,
   corpo em Times, espaçamento 1,5 e recuo de primeira linha.
   ========================================================================= */

const CIDADE = "Presidente Dutra";
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const PORTARIA_PADRAO = "Portaria nº 040/2026 – GCG";

export type DadosCertidaoP1 = {
  numero: number;
  ano: number;
  portaria: string;
  nome: string;
  nomeGuerra?: string | null;
  postoGrad?: string | null;
  matricula?: string | null;
  idPmma?: string | null;
  quadro?: string | null;
  data: string; // aaaa-mm-dd
};

type Trecho = { t: string; b?: boolean };
type Par = {
  trechos: Trecho[];
  tam: number;                       // pt
  alinhar: "centro" | "just" | "esq";
  recuo1?: number;                   // recuo da 1ª linha, em pt
  recuoEsq?: number;                 // recuo à esquerda, em pt
  entre?: number;                    // entrelinha (1 = simples, 1.5 = 1,5)
};

// ---------------------------------------------------------------- textos

export function numeroCertidao(numero: number, ano: number): string {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

// "2026-07-13" -> "13 de julho de 2026"
function dataExtenso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

// "MAJ QOEM" -> "Major"; o que a régua não conhece sai como está na ficha
function postoPorExtenso(postoGrad: string | null | undefined): string {
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
    const desc = QUADROS[sigla];
    out.push({ t: desc ? `, pertencente ao ${desc} - (` : ", pertencente ao Quadro " });
    out.push({ t: sigla, b: true });
    if (desc) out.push({ t: ")" });
  }
  return out;
}

function montarCertidao(d: DadosCertidaoP1): Par[] {
  const vazio = (tam = 12): Par => ({ trechos: [], tam, alinhar: "centro" });
  const regioes = ehOficial(d.postoGrad) ? "1ª, 2ª, 3ª, 4ª, 5ª e 6ª" : "1ª, 2ª, 3ª, 4ª e 5ª";
  const corpo = { alinhar: "just" as const, recuo1: 56.7, entre: 1.5 };

  return [
    { trechos: [{ t: "ESTADO DO MARANHÃO", b: true }], tam: 12, alinhar: "centro" },
    { trechos: [{ t: "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA", b: true }], tam: 12, alinhar: "centro" },
    { trechos: [{ t: "POLÍCIA MILITAR DO MARANHÃO", b: true }], tam: 12, alinhar: "centro" },
    vazio(), vazio(), vazio(), vazio(), vazio(),
    { trechos: [{ t: `CERTIDÃO Nº ${numeroCertidao(d.numero, d.ano)} – P/1` }], tam: 10, alinhar: "centro" },
    vazio(), vazio(),
    {
      ...corpo, tam: 10,
      trechos: [
        { t: `Certifico, para os devidos fins, em cumprimento ao disposto na ${d.portaria.trim() || PORTARIA_PADRAO}, que o(a) Sr.(a) ` },
        ...trechosDoNome(d.nome, d.nomeGuerra),
        { t: ", " },
        { t: postoPorExtenso(d.postoGrad), b: true },
        ...trechosIdentidade(d),
        { t: ", atualmente servindo nesta Unidade Policial Militar, apresentou as certidões de “nada consta” exigidas para fins de comprovação da regularidade de sua situação jurídica e administrativa, referentes aos seguintes órgãos do Poder Judiciário:" },
      ],
    },
    {
      tam: 12, alinhar: "esq", recuoEsq: 113.4,
      trechos: [{
        t: "I – Justiça Estadual do Maranhão (1º e 2º graus);\nII – Justiça Militar Estadual (1º grau);\n" +
           `III – Justiça Federal – Tribunais Regionais Federais da ${regioes} Regiões.`,
        b: true,
      }],
    },
    vazio(),
    {
      ...corpo, tam: 12,
      trechos: [
        { t: "Após análise da documentação apresentada, verificou-se que o(a) militar " },
        { t: "NÃO POSSUI", b: true },
        { t: " registros impeditivos constantes nas certidões apresentadas, encontrando-se, portanto, em situação regular perante os órgãos judiciais competentes, para fins de inclusão em Quadro de Acesso e concorrência à promoção, nos termos da legislação vigente." },
      ],
    },
    { ...corpo, tam: 12, trechos: [{ t: "Por ser verdade, lavro a presente certidão para que produza os efeitos legais cabíveis." }] },
    vazio(),
    { trechos: [{ t: `${CIDADE}, ${dataExtenso(d.data)}.`, b: true }], tam: 12, alinhar: "centro" },
    vazio(), vazio(), vazio(), vazio(), vazio(), vazio(), vazio(), vazio(),
    { trechos: [{ t: "_____________________________", b: true }], tam: 12, alinhar: "centro" },
    { trechos: [{ t: "Assinatura do declarante" }], tam: 12, alinhar: "centro" },
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
const EMU = 12700; // 1 pt = 12700 EMU

export async function gerarCertidaoP1Docx(d: DadosCertidaoP1): Promise<Buffer> {
  const img = brasao();
  const pars = montarCertidao(d);

  const paragrafos = pars.map((p, i) => {
    const runs: (TextRun | ImageRun)[] = [];
    // brasão flutuando acima do cabeçalho, centralizado, como no modelo
    if (i === 0 && img) {
      runs.push(new ImageRun({
        type: "png",
        data: img,
        transformation: { width: 63, height: 49 },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.CENTER },
          verticalPosition: { relative: VerticalPositionRelativeFrom.MARGIN, offset: Math.round(-53 * EMU) },
          wrap: { type: TextWrappingType.NONE },
        },
      }));
    }
    for (const tr of p.trechos) {
      tr.t.split("\n").forEach((parte, j) => {
        runs.push(new TextRun({
          text: parte, bold: tr.b, size: p.tam * 2, font: "Times New Roman", break: j > 0 ? 1 : undefined,
        }));
      });
    }
    if (!p.trechos.length) runs.push(new TextRun({ text: "", size: p.tam * 2, font: "Times New Roman" }));
    return new Paragraph({
      alignment: p.alinhar === "centro" ? AlignmentType.CENTER : p.alinhar === "just" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      indent: {
        firstLine: p.recuo1 ? Math.round(p.recuo1 * TWIP) : undefined,
        left: p.recuoEsq ? Math.round(p.recuoEsq * TWIP) : undefined,
      },
      spacing: p.entre && p.entre !== 1 ? { line: Math.round(240 * p.entre) } : undefined,
      children: runs,
    });
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },
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
  pdf.setTitle(`Certidão nº ${numeroCertidao(d.numero, d.ano)} – P/1`);
  const normal = await pdf.embedFont(StandardFonts.TimesRoman);
  const negrito = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const W = 595.28, H = 841.89;
  const ME = 85.05, MD = 56.7, MT = 85.05, MB = 56.7;
  const largura = W - ME - MD;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - MT;

  const img = brasao();
  if (img) {
    try {
      const png = await pdf.embedPng(img);
      page.drawImage(png, { x: ME + (largura - 47.55) / 2, y: H - MT + 53 - 37, width: 47.55, height: 37 });
    } catch { /* sem brasão, segue o texto */ }
  }

  for (const p of montarCertidao(d)) {
    const tam = p.tam;
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
      l.palavras.forEach((pl, k) => {
        for (const pc of pl) {
          page.drawText(pc.t, { x, y: base, size: tam, font: pc.f, color: rgb(0, 0, 0) });
          x += larguraTexto(pc.f, pc.t, tam);
        }
        if (k < l.palavras.length - 1) x += gap;
      });
      y -= alturaLinha;
    });
  }

  return pdf.save();
}
