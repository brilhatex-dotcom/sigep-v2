import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/* =========================================================================
   Ofício de apresentação à JMS e Guia de Encaminhamento Médico -> Word
   (.docx) e PDF, do mesmo jeito que a Escala de Serviço: o navegador manda
   os campos da folha, o servidor monta o arquivo e devolve para download.

   Por que não gerar o PDF pelo "Imprimir para PDF" do navegador: cada
   computador do Batalhão imprime com uma margem, um cabeçalho de página e um
   rodapé diferentes. O arquivo montado aqui sai igual em todo lugar e serve
   para anexar em processo/e-mail.
   ========================================================================= */

/* ------------------------------------------------------------------ comum */

const ORG = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLICIA MILITAR",
];
const ENDERECO = "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000";
const CONTATO_PADRAO = "TELEFONE: (99) 98509-5005 (Permanência) – 18batalhaopmma@gmail.com";

export type Brasoes = { pmma?: string; ma?: string; bpm?: string };
/* Como o Comandante assina: os mesmos modos da tela. */
export type ModoAss = "imagem" | "sigep" | "gov" | "branco";

export type OficioJmsInput = {
  numero?: string; ano?: string;
  dataDoc?: string; setor?: string;
  de?: string; para?: string; assunto?: string;
  corpo?: string;
  comandante?: string; cargo?: string;
  modoAss?: ModoAss;
  brasoes?: Brasoes;
  assinaturaCmt?: string;
};

export type GuiaJmsInput = {
  numero?: string; ano?: string;
  dataVisita?: string;   // "dd/mm/aaaa" já formatada pela tela
  nome?: string; grad?: string; matricula?: string; idPm?: string;
  informacao?: string; cidadeParecer?: string;
  comandante?: string; cargo?: string;
  modoAss?: ModoAss;
  brasoes?: Brasoes;
  assinaturaCmt?: string;
};

function limpa(s?: string | null): string {
  return String(s ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/* Resolve imagem: data URL (base64) ou arquivo em public/. */
function resolverImagem(valor?: string | null): { data: Buffer; kind: "png" | "jpg" } | null {
  if (!valor) return null;
  try {
    if (valor.startsWith("data:")) {
      const m = valor.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!m) return null;
      return { data: Buffer.from(m[2], "base64"), kind: m[1].toLowerCase().startsWith("jp") ? "jpg" : "png" };
    }
    const rel = valor.replace(/^\//, "");
    const data = fs.readFileSync(path.join(process.cwd(), "public", rel));
    return { data, kind: /\.jpe?g$/i.test(rel) ? "jpg" : "png" };
  } catch { return null; }
}

/* As fontes padrão do PDF são Latin-1: tira o que não couber (·, travessão,
   aspas curvas) em vez de estourar na hora de gravar. Acento português
   (á, ç, ã, º) cabe e passa direto. */
function safe(s: string): string {
  return (s || "")
    .replace(/[·•]/g, "-").replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

/* Mesmo código de autenticação que o carimbo da tela (CarimboSigep) mostra —
   o arquivo baixado tem que bater com o que foi impresso. */
function codigoDe(txt: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < txt.length; i++) {
    const c = txt.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0; h2 = Math.imul(h2, 0x85ebca77) >>> 0;
  }
  const s = (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const p = (s + "00000000").slice(0, 8);
  return `${p.slice(0, 4)}-${p.slice(4, 8)}`;
}
function hojeBr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/* ============================== DOCX ============================== */

const FONTE = "Times New Roman";
const SEM = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SEM_BORDAS = { top: SEM, bottom: SEM, left: SEM, right: SEM };
const FINA = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const MOLDURA = { top: FINA, bottom: FINA, left: FINA, right: FINA };

// docx mede em MEIOS-PONTOS: 12pt -> 24.
function r(text: string, o: { b?: boolean; size?: number; i?: boolean } = {}) {
  return new TextRun({ text, bold: o.b, italics: o.i, size: Math.round((o.size ?? 12) * 2), font: FONTE });
}
function p(
  texto: string,
  o: { b?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; depois?: number; esquerda?: number; primeiraLinha?: number } = {},
) {
  return new Paragraph({
    alignment: o.align ?? AlignmentType.LEFT,
    spacing: { before: o.antes, after: o.depois, line: 276 },
    indent: { left: o.esquerda, firstLine: o.primeiraLinha },
    children: [r(texto, { b: o.b, size: o.size })],
  });
}
const vazio = (altura = 0) => new Paragraph({ spacing: { after: altura }, children: [r(" ")] });

// 1mm = 56,7 twips (1440 twips por polegada).
const mm = (v: number) => Math.round(v * 56.7);

function imgDocx(valor?: string | null, w = 80, h = 80) {
  const img = resolverImagem(valor);
  if (!img) return null;
  return new ImageRun({ type: img.kind, data: img.data, transformation: { width: w, height: h } } as any);
}

function cabecalhoDocx(br: Brasoes, contato: string): (Paragraph | Table)[] {
  const orgPars = ORG.map((l) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 220 }, children: [r(l, { size: 11 })] }));
  const iPmma = imgDocx(br.pmma, 62, 55);
  const iMa = imgDocx(br.ma, 44, 48);
  const iBpm = imgDocx(br.bpm, 58, 55);
  const cel = (largura: number, filhos: Paragraph[]) =>
    new TableCell({ width: { size: largura, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.CENTER, children: filhos });
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: SEM, bottom: SEM, left: SEM, right: SEM, insideHorizontal: SEM, insideVertical: SEM },
      rows: [new TableRow({ children: [
        cel(18, [new Paragraph({ alignment: AlignmentType.CENTER, children: iPmma ? [iPmma] : [] })]),
        cel(64, [new Paragraph({ alignment: AlignmentType.CENTER, children: iMa ? [iMa] : [] }), ...orgPars]),
        cel(18, [new Paragraph({ alignment: AlignmentType.CENTER, children: iBpm ? [iBpm] : [] })]),
      ] })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 200 }, children: [r(ENDERECO, { size: 8 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 200 }, children: [r(contato, { size: 8, b: true })] }),
  ];
}

/* Bloco de assinatura no Word: imagem digitalizada, carimbo SIGEP (mesmo
   texto da tela) ou espaço em branco para assinar depois. */
function assinaturaDocx(modo: ModoAss, assinatura: string | undefined, nome: string, cargo: string): (Paragraph | Table)[] {
  const saida: (Paragraph | Table)[] = [];
  if (modo === "imagem") {
    const img = imgDocx(assinatura, 150, 50);
    saida.push(new Paragraph({ alignment: AlignmentType.CENTER, children: img ? [img] : [r(" ")] }));
  } else if (modo === "sigep") {
    const quando = hojeBr();
    saida.push(new Table({
      width: { size: 62, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [new TableRow({ children: [new TableCell({
        borders: MOLDURA,
        children: [
          new Paragraph({ spacing: { line: 200 }, children: [new TextRun({ text: "Assinado eletronicamente - SIGEP · 18º BPM", bold: true, size: 15, font: "Arial", color: "1351B4" })] }),
          new Paragraph({ spacing: { line: 200 }, children: [new TextRun({ text: nome.toUpperCase(), bold: true, size: 15, font: "Arial" })] }),
          new Paragraph({ spacing: { line: 200 }, children: [new TextRun({ text: `${cargo} · ${quando}`, size: 15, font: "Arial" })] }),
          new Paragraph({ spacing: { line: 200 }, children: [new TextRun({ text: `Autenticação: ${codigoDe(`${nome}|${cargo}|${quando}`)}`, size: 15, font: "Arial", color: "555555" })] }),
        ],
      })] })],
    }));
    saida.push(vazio(60));
  } else {
    // "gov" reserva mais espaço: a assinatura entra depois, no PDF.
    saida.push(vazio(modo === "gov" ? 460 : 320));
  }
  saida.push(p(nome, { b: true, align: AlignmentType.CENTER }));
  saida.push(p(cargo, { b: true, align: AlignmentType.CENTER }));
  return saida;
}

export async function gerarOficioJmsDocx(i: OficioJmsInput): Promise<Buffer> {
  const nomeCmt = limpa(i.comandante) || "COMANDANTE DO 18º BPM";
  const cargo = limpa(i.cargo) || "CMT DO 18º BPM";
  const corpo: (Paragraph | Table)[] = [
    ...cabecalhoDocx(i.brasoes || {}, CONTATO_PADRAO),
    p(limpa(i.dataDoc), { b: true, align: AlignmentType.CENTER, antes: mm(12) }),
    p(`Ofício n° ${limpa(i.numero) || "____"}/${limpa(i.ano)} – ${limpa(i.setor)}`, { b: true, antes: mm(7) }),
    // Do/Ao/Assunto ficam recuados para perto da metade da folha, como no papel.
    new Paragraph({ spacing: { before: mm(9), line: 240 }, indent: { left: mm(70) }, children: [r("Do: ", { b: true }), r(limpa(i.de))] }),
    new Paragraph({ spacing: { line: 240 }, indent: { left: mm(70) }, children: [r("Ao: ", { b: true }), r(limpa(i.para))] }),
    new Paragraph({ spacing: { line: 240 }, indent: { left: mm(70) }, children: [r("Assunto: ", { b: true }), r(limpa(i.assunto))] }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: mm(10), line: 340 },
      indent: { firstLine: mm(14) },
      children: [r(limpa(i.corpo))],
    }),
    p("Atenciosamente,", { antes: mm(16), esquerda: mm(12) }),
    vazio(mm(10)),
    ...assinaturaDocx(i.modoAss || "imagem", i.assinaturaCmt, nomeCmt, cargo),
  ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: mm(14), bottom: mm(14), left: mm(20), right: mm(20) } } },
      children: corpo,
    }],
  });
  return Packer.toBuffer(doc);
}

export async function gerarGuiaJmsDocx(i: GuiaJmsInput): Promise<Buffer> {
  const nomeCmt = limpa(i.comandante) || "COMANDANTE DO 18º BPM";
  const cargo = limpa(i.cargo) || "CMT DO 18º BPM";

  // Quadro da identificação + informação do Cmt (moldura, como no papel).
  const quadroId = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      borders: MOLDURA,
      children: [
        p(`Visita Médica do dia   ${limpa(i.dataVisita) || "___/___/_____"}.`, { align: AlignmentType.CENTER, depois: 160 }),
        p(`Nome: ${limpa(i.nome)}`),
        p(`Graduação: ${limpa(i.grad)}          Matrícula: ${limpa(i.matricula)}`),
        p(`ID: ${limpa(i.idPm)}`, { depois: 160 }),
        p("Informação do Cmt", { align: AlignmentType.CENTER, depois: 120 }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED, spacing: { line: 300, after: mm(16) },
          indent: { firstLine: mm(12) }, children: [r(limpa(i.informacao))],
        }),
        ...(assinaturaDocx(i.modoAss || "imagem", i.assinaturaCmt, nomeCmt, cargo) as Paragraph[] as any),
      ],
    })] })],
  });

  // Quadro do parecer, preenchido à mão pelo médico.
  const quadroParecer = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      borders: MOLDURA,
      children: [
        p("PARECER MÉDICO", { align: AlignmentType.CENTER, depois: mm(22) }),
        p(limpa(i.cidadeParecer) || "São Luis - MA, ___ / ___/ ___", { align: AlignmentType.CENTER, depois: mm(14) }),
        p("_________________________________________", { align: AlignmentType.CENTER }),
        p("MÉDICO", { align: AlignmentType.CENTER }),
      ],
    })] })],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: mm(12), bottom: mm(12), left: mm(14), right: mm(14) } } },
      children: [
        ...cabecalhoDocx(i.brasoes || {}, CONTATO_PADRAO),
        p(`Guia de Encaminhamento Médico nº ${limpa(i.numero) || "____"}/${limpa(i.ano)}.`, { b: true, align: AlignmentType.CENTER, antes: mm(8), depois: mm(5) }),
        quadroId,
        vazio(mm(5)),
        quadroParecer,
        // O Word não gosta de terminar a seção numa tabela.
        new Paragraph({ children: [] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/* ============================== PDF ============================== */

/* A folha na tela é A4 com margem de 20mm e Times 12pt — aqui é a mesma
   coisa em pontos (1mm = 2,8346pt). */
const PT = (v: number) => v * 2.834645;
const LARG = 595, ALT = 842;

type Caneta = {
  pdf: PDFDocument; page: PDFPage;
  normal: PDFFont; negrito: PDFFont;
  y: number; esq: number; dir: number;
};

function textoLargura(f: PDFFont, t: string, size: number) { return f.widthOfTextAtSize(safe(t), size); }

function escrever(c: Caneta, t: string, x: number, size: number, f: PDFFont) {
  c.page.drawText(safe(t), { x, y: c.y - size, size, font: f, color: rgb(0, 0, 0) });
}
function centrado(c: Caneta, t: string, size: number, f: PDFFont, gap = 3) {
  const w = textoLargura(f, t, size);
  escrever(c, t, (LARG - w) / 2, size, f);
  c.y -= size + gap;
}

function quebrar(f: PDFFont, t: string, size: number, maxW: number, recuo = 0): string[] {
  const palavras = safe(t).split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  let limite = maxW - recuo; // a 1ª linha é mais curta por causa do recuo
  for (const w of palavras) {
    const tentativa = atual ? `${atual} ${w}` : w;
    if (f.widthOfTextAtSize(tentativa, size) > limite && atual) {
      linhas.push(atual); atual = w; limite = maxW;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/* Parágrafo justificado: as linhas do meio esticam os espaços até a margem,
   a última fica solta — é como o documento sai no papel. */
function paragrafo(c: Caneta, t: string, size: number, f: PDFFont, entreLinhas: number, recuo = 0) {
  const maxW = c.dir - c.esq;
  const linhas = quebrar(f, t, size, maxW, recuo);
  linhas.forEach((linha, idx) => {
    const x0 = c.esq + (idx === 0 ? recuo : 0);
    const ultima = idx === linhas.length - 1;
    const disponivel = c.dir - x0;
    const palavras = linha.split(" ");
    if (ultima || palavras.length < 2) {
      escrever(c, linha, x0, size, f);
    } else {
      const larguraPalavras = palavras.reduce((s, w) => s + textoLargura(f, w, size), 0);
      const espaco = (disponivel - larguraPalavras) / (palavras.length - 1);
      let x = x0;
      for (const w of palavras) { escrever(c, w, x, size, f); x += textoLargura(f, w, size) + espaco; }
    }
    c.y -= entreLinhas;
  });
}

async function cabecalhoPdf(c: Caneta, br: Brasoes, contato: string) {
  const embed = async (v?: string | null) => {
    const img = resolverImagem(v); if (!img) return null;
    try { return img.kind === "jpg" ? await c.pdf.embedJpg(img.data) : await c.pdf.embedPng(img.data); } catch { return null; }
  };
  const [iPmma, iMa, iBpm] = await Promise.all([embed(br.pmma), embed(br.ma), embed(br.bpm)]);
  const topo = c.y;
  const lg = PT(17), al = PT(15);
  if (iPmma) c.page.drawImage(iPmma, { x: c.esq, y: topo - al, width: lg, height: al });
  if (iBpm) c.page.drawImage(iBpm, { x: c.dir - lg, y: topo - al, width: lg, height: al });
  if (iMa) c.page.drawImage(iMa, { x: (LARG - PT(11)) / 2, y: topo - PT(13), width: PT(11), height: PT(13) });
  c.y = topo - PT(14);
  for (const l of ORG) centrado(c, l, 11, c.normal, 1.5);
  c.y -= 2;
  centrado(c, ENDERECO, 8, c.normal, 1);
  centrado(c, contato, 8, c.negrito, 1);
}

function carimboPdf(c: Caneta, nome: string, cargo: string, larguraMinima: number) {
  const quando = hojeBr();
  const linhas: { t: string; f: PDFFont; cor: [number, number, number] }[] = [
    { t: "Assinado eletronicamente - SIGEP - 18º BPM", f: c.negrito, cor: [0.07, 0.32, 0.71] },
    { t: nome.toUpperCase(), f: c.negrito, cor: [0.07, 0.07, 0.07] },
    { t: `${cargo} - ${quando}`, f: c.normal, cor: [0.07, 0.07, 0.07] },
    { t: `Autenticação: ${codigoDe(`${nome}|${cargo}|${quando}`)}`, f: c.normal, cor: [0.33, 0.33, 0.33] },
  ];
  const size = 7.2, lh = 9;
  const altura = linhas.length * lh + 8;
  // A moldura acompanha a linha mais comprida (o nome do Cmt varia) — com
  // largura fixa o nome encostava na borda.
  const largura = Math.min(
    c.dir - c.esq,
    Math.max(larguraMinima, ...linhas.map((l) => textoLargura(l.f, l.t, size))) + 14,
  );
  const x = (LARG - largura) / 2;
  const topo = c.y;
  c.page.drawRectangle({ x, y: topo - altura, width: largura, height: altura, borderColor: rgb(0.07, 0.32, 0.71), borderWidth: 0.8 });
  let ly = topo - 4 - size;
  for (const l of linhas) {
    c.page.drawText(safe(l.t), { x: x + 6, y: ly, size, font: l.f, color: rgb(l.cor[0], l.cor[1], l.cor[2]) });
    ly -= lh;
  }
  c.y = topo - altura;
}

async function assinaturaPdf(c: Caneta, modo: ModoAss, assinatura: string | undefined, nome: string, cargo: string) {
  if (modo === "imagem") {
    const img = resolverImagem(assinatura);
    let ok = null as any;
    if (img) { try { ok = img.kind === "jpg" ? await c.pdf.embedJpg(img.data) : await c.pdf.embedPng(img.data); } catch { ok = null; } }
    if (ok) {
      const h = PT(18), w = (ok.width / ok.height) * h;
      c.page.drawImage(ok, { x: (LARG - w) / 2, y: c.y - h, width: w, height: h });
      c.y -= h + 2;
    } else c.y -= PT(16);
  } else if (modo === "sigep") {
    carimboPdf(c, nome, cargo, PT(62));
    c.y -= 4;
  } else {
    c.y -= modo === "gov" ? PT(22) : PT(16);
  }
  centrado(c, nome, 11, c.negrito, 2);
  centrado(c, cargo, 11, c.negrito, 2);
}

async function novaCaneta(esqMm: number, dirMm: number, topoMm: number): Promise<Caneta> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([LARG, ALT]);
  return {
    pdf, page,
    normal: await pdf.embedFont(StandardFonts.TimesRoman),
    negrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
    y: ALT - PT(topoMm),
    esq: PT(esqMm),
    dir: LARG - PT(dirMm),
  };
}

export async function gerarOficioJmsPdf(i: OficioJmsInput): Promise<Uint8Array> {
  const c = await novaCaneta(20, 20, 14);
  const nomeCmt = limpa(i.comandante) || "COMANDANTE DO 18º BPM";
  const cargo = limpa(i.cargo) || "CMT DO 18º BPM";

  await cabecalhoPdf(c, i.brasoes || {}, CONTATO_PADRAO);

  c.y -= PT(12);
  centrado(c, limpa(i.dataDoc), 12, c.negrito, 2);

  c.y -= PT(7);
  escrever(c, `Ofício n° ${limpa(i.numero) || "____"}/${limpa(i.ano)} - ${limpa(i.setor)}`, c.esq, 12, c.negrito);
  c.y -= 14;

  // Do/Ao/Assunto: recuados para perto da metade da folha, como no papel.
  c.y -= PT(9);
  const xBloco = PT(94);
  const rotulado = (rot: string, valor: string) => {
    escrever(c, rot, xBloco, 12, c.negrito);
    escrever(c, limpa(valor), xBloco + textoLargura(c.negrito, rot + " ", 12), 12, c.normal);
    c.y -= 16;
  };
  rotulado("Do:", i.de || "");
  rotulado("Ao:", i.para || "");
  rotulado("Assunto:", i.assunto || "");

  c.y -= PT(10);
  paragrafo(c, limpa(i.corpo), 12, c.normal, 18, PT(14));

  c.y -= PT(16);
  escrever(c, "Atenciosamente,", c.esq + PT(12), 12, c.normal);
  c.y -= PT(20);

  await assinaturaPdf(c, i.modoAss || "imagem", i.assinaturaCmt, nomeCmt, cargo);
  return c.pdf.save();
}

export async function gerarGuiaJmsPdf(i: GuiaJmsInput): Promise<Uint8Array> {
  const c = await novaCaneta(14, 14, 12);
  const nomeCmt = limpa(i.comandante) || "COMANDANTE DO 18º BPM";
  const cargo = limpa(i.cargo) || "CMT DO 18º BPM";

  // moldura de fora, como no documento original
  const foraTopo = c.y;
  c.esq += PT(6); c.dir -= PT(6); c.y -= PT(5);

  await cabecalhoPdf(c, i.brasoes || {}, CONTATO_PADRAO);

  c.y -= PT(8);
  centrado(c, `Guia de Encaminhamento Médico nº ${limpa(i.numero) || "____"}/${limpa(i.ano)}.`, 12, c.negrito, 2);
  c.y -= PT(5);

  // ---- quadro da identificação ----
  const idTopo = c.y;
  const esqQuadro = c.esq, dirQuadro = c.dir;
  c.esq += PT(5); c.dir -= PT(5); c.y -= PT(4);

  centrado(c, `Visita Médica do dia   ${limpa(i.dataVisita) || "___/___/_____"}.`, 12, c.normal, 2);
  c.y -= PT(4);
  const linha = (t: string) => { escrever(c, t, c.esq, 12, c.normal); c.y -= 16; };
  linha(`Nome: ${limpa(i.nome)}`);
  linha(`Graduação: ${limpa(i.grad)}          Matrícula: ${limpa(i.matricula)}`);
  linha(`ID: ${limpa(i.idPm)}`);
  c.y -= PT(4);
  centrado(c, "Informação do Cmt", 12, c.normal, 3);
  c.y -= PT(3);
  paragrafo(c, limpa(i.informacao), 12, c.normal, 18, PT(12));
  c.y -= PT(18);
  await assinaturaPdf(c, i.modoAss || "imagem", i.assinaturaCmt, nomeCmt, cargo);
  c.y -= PT(4);

  c.page.drawRectangle({
    x: esqQuadro, y: c.y, width: dirQuadro - esqQuadro, height: idTopo - c.y,
    borderColor: rgb(0, 0, 0), borderWidth: 0.8,
  });
  c.esq = esqQuadro; c.dir = dirQuadro;

  // ---- quadro do parecer médico (preenchido à mão) ----
  c.y -= PT(5);
  const parTopo = c.y;
  c.y -= PT(5);
  centrado(c, "PARECER MÉDICO", 12, c.normal, 2);
  c.y -= PT(22);
  centrado(c, limpa(i.cidadeParecer) || "São Luis - MA, ___ / ___/ ___", 12, c.normal, 2);
  c.y -= PT(14);
  centrado(c, "_________________________________________", 12, c.normal, 2);
  centrado(c, "MÉDICO", 12, c.normal, 2);
  c.y -= PT(4);
  const parAltura = Math.max(parTopo - c.y, PT(52));
  c.page.drawRectangle({
    x: c.esq, y: parTopo - parAltura, width: c.dir - c.esq, height: parAltura,
    borderColor: rgb(0, 0, 0), borderWidth: 0.8,
  });
  c.y = parTopo - parAltura;

  c.page.drawRectangle({
    x: PT(14), y: c.y - PT(5), width: LARG - PT(28), height: foraTopo - c.y + PT(5),
    borderColor: rgb(0, 0, 0), borderWidth: 0.8,
  });

  return c.pdf.save();
}
