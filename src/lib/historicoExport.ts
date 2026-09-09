import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, ShadingType,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  SECOES, CAMPOS_PESSOAIS, CAMPOS_FUNCIONAIS, rotulosFormacao,
  valorCampo, valorSecao, type DadosHistorico,
} from "@/lib/historicoPolicial";
import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   HISTÓRICO POLICIAL MILITAR -> Word (.docx) e PDF, no modelo do 18º BPM:
   cabeçalho com os três brasões, título, e as quinze seções, cada uma com a
   faixa cinza de título e o conteúdo por baixo.

   O documento é longo e de tamanho imprevisível (o histórico de um sargento
   com trinta anos de casa passa de dez páginas), então tudo aqui corre em
   fluxo: quem quebra a página é o Word/o contador de linhas do PDF.
   ========================================================================= */

export type EntradaHistorico = {
  dados: DadosHistorico;
  ficha: Record<string, string>;       // valores que saem da ficha do efetivo
  postoGrad: string;                   // para escolher os rótulos de curso
  brasoes: { pmma?: string; ma?: string; bpm?: string };
  chefe: string;                       // quem assina
  cargoChefe: string;
  dataDoc: string;                     // ISO; vazio = hoje
  contato: string;
};

/* Mesmo timbre da Escala de Serviço, de propósito: os brasões vêm da MESMA
   configuração (trocar na escala troca aqui) e o nome do órgão sai com o
   mesmo destaque na última linha. Assim os documentos do Batalhão saem todos
   com a mesma cara. */
const ORG = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
];
const DESTAQUE = ORG.length - 1;   // a linha do Batalhão sai maior e em negrito

/* Caixa MÁXIMA de cada brasão, em mm — exatamente as mesmas da tela (o
   <Cabecalho> do histórico usa estes valores com "object-fit: contain").

   A imagem é encaixada DENTRO da caixa mantendo a proporção dela. Isto não é
   capricho: o Word e o pdf-lib ESTICAM a figura para o tamanho que a gente
   pede, e as três logos têm proporções diferentes entre si (o 190 anos é
   quadrado, o brasão do Batalhão é mais alto que largo). Com tamanho fixo,
   todas saíam deformadas no arquivo baixado enquanto na tela ficavam certas —
   que foi exatamente o que o P/1 viu. Usando a mesma caixa e o mesmo encaixe
   da tela, o que se vê é o que sai. */
const CAIXA: Record<"pmma" | "ma" | "bpm", [number, number]> = {
  pmma: [26, 22],
  ma: [30, 16],
  bpm: [22, 22],
};

/* Largura e altura reais da imagem, lidas do próprio arquivo: PNG traz no
   IHDR, JPEG no marcador de início de quadro (SOF). Sem isso não dá para
   respeitar a proporção. */
function tamanhoDaImagem(dados: Buffer): { w: number; h: number } | null {
  try {
    // PNG: assinatura + IHDR com largura e altura em 32 bits
    if (dados.length > 24 && dados[0] === 0x89 && dados[1] === 0x50) {
      return { w: dados.readUInt32BE(16), h: dados.readUInt32BE(20) };
    }
    // JPEG: percorre os marcadores até um SOF (0xC0-0xCF, menos C4/C8/CC)
    if (dados.length > 4 && dados[0] === 0xff && dados[1] === 0xd8) {
      let i = 2;
      while (i + 9 < dados.length) {
        if (dados[i] !== 0xff) { i++; continue; }
        const marca = dados[i + 1];
        if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
          return { h: dados.readUInt16BE(i + 5), w: dados.readUInt16BE(i + 7) };
        }
        i += 2 + dados.readUInt16BE(i + 2);
      }
    }
  } catch { /* imagem estranha: cai para a caixa inteira */ }
  return null;
}

/* Encaixa a imagem na caixa sem esticar (contain). */
function encaixar(dados: Buffer, caixa: [number, number]): [number, number] {
  const t = tamanhoDaImagem(dados);
  if (!t || !t.w || !t.h) return caixa;
  const escala = Math.min(caixa[0] / t.w, caixa[1] / t.h);
  return [t.w * escala, t.h * escala];
}

const ENDERECO = "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const t = (v?: string | null) => String(v ?? "").trim();
const linhasDe = (v: string) => t(v).split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l !== "" || (i > 0 && i < a.length - 1));

function dataExtenso(iso: string): string {
  const m = t(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function resolverImagem(valor?: string | null): { data: Buffer; kind: "png" | "jpg" } | null {
  if (!valor) return null;
  try {
    if (valor.startsWith("data:")) {
      const m = valor.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!m) return null;
      return { data: Buffer.from(m[2], "base64"), kind: m[1].toLowerCase().startsWith("jp") ? "jpg" : "png" };
    }
    const rel = valor.replace(/^\//, "");
    return { data: fs.readFileSync(path.join(process.cwd(), "public", rel)), kind: /\.jpe?g$/i.test(rel) ? "jpg" : "png" };
  } catch { return null; }
}

/* ------------------------------------------------------------------
   Monta o CONTEÚDO do documento uma vez só, em blocos simples, e cada
   formato (Word, PDF) só sabe desenhar esses blocos. Assim os dois não
   podem divergir. */
type Bloco =
  | { t: "faixa"; texto: string }                                   // título de seção
  | { t: "campo"; rotulo: string; valor: string }                   // "NOME: Fulano"
  | { t: "alinea"; rotulo: string; valor: string }                  // "a) FÉRIAS:" + linhas
  | { t: "texto"; valor: string }
  | { t: "espaco" };

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

export function montarBlocos(e: EntradaHistorico): Bloco[] {
  const b: Bloco[] = [];
  const oficial = classificarPatente(e.postoGrad || "").ordem <= 7;
  const formacao = rotulosFormacao(e.postoGrad || "");

  for (const sec of SECOES) {
    b.push({ t: "faixa", texto: `${sec.num} – ${sec.titulo}` });

    if (sec.num === "I" || sec.num === "II") {
      const campos = (sec.num === "I" ? CAMPOS_PESSOAIS : CAMPOS_FUNCIONAIS)
        .filter((c) => !(c.seOficial && !oficial) && !(c.sePraca && oficial));
      for (const c of campos) {
        const v = valorCampo(e.dados, e.ficha, c.chave);
        // A filiação vem com pai e mãe em linhas separadas, como no modelo.
        if (c.chave === "filiacao") {
          b.push({ t: "campo", rotulo: c.rotulo, valor: "" });
          for (const l of linhasDe(v)) b.push({ t: "texto", valor: l });
        } else {
          b.push({ t: "campo", rotulo: c.rotulo, valor: v });
        }
      }
      b.push({ t: "espaco" });
      continue;
    }

    if (sec.itens) {
      sec.itens.forEach((it, i) => {
        const rotulo = sec.num === "III" && i < 3 ? formacao[i] : it.rotulo;
        const valor = valorSecao(e.dados, `${sec.num}.${it.chave}`, it.padrao || "");
        b.push({ t: "alinea", rotulo: `${LETRAS[i]}) ${rotulo}`, valor });
      });
      b.push({ t: "espaco" });
      continue;
    }

    b.push({ t: "texto", valor: valorSecao(e.dados, sec.num, "Sem alterações.") });
    b.push({ t: "espaco" });
  }

  b.push({ t: "espaco" });
  b.push({ t: "texto", valor: `__CENTRO__Quartel do 18º BPM, em Presidente Dutra-MA, ${dataExtenso(e.dataDoc)}.` });
  // espaço para a assinatura à mão, como no modelo
  for (let i = 0; i < 5; i++) b.push({ t: "espaco" });
  b.push({ t: "texto", valor: `__CENTRO__${t(e.chefe)}` });
  b.push({ t: "texto", valor: `__CENTRO__${t(e.cargoChefe)}` });
  return b;
}

const ehCentro = (v: string) => v.startsWith("__CENTRO__");
const semMarca = (v: string) => v.replace(/^__CENTRO__/, "");

/* ============================== DOCX ============================== */

const FONTE = "Times New Roman";
const NADA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const FIO = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const SEM_BORDA = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };
const MOLDURA = { top: FIO, bottom: FIO, left: FIO, right: FIO };

const mm = (v: number) => Math.round(v * 56.7);
const pxImg = (v: number) => Math.round((v / 25.4) * 96);

function run(texto: string, o: { b?: boolean; i?: boolean; size?: number; u?: boolean } = {}) {
  return new TextRun({ text: texto, bold: o.b, italics: o.i, underline: o.u ? {} : undefined, size: Math.round((o.size ?? 12) * 2), font: FONTE });
}
function par(filhos: TextRun[], o: { centro?: boolean; justificado?: boolean; antes?: number; depois?: number } = {}) {
  return new Paragraph({
    alignment: o.justificado ? AlignmentType.JUSTIFIED : o.centro ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: o.antes, after: o.depois ?? 20, line: 260 },
    children: filhos,
  });
}
function imgDocx(valor?: string | null, wMm = 20, hMm = 20) {
  const img = resolverImagem(valor);
  if (!img) return null;
  return new ImageRun({ type: img.kind, data: img.data, transformation: { width: pxImg(wMm), height: pxImg(hMm) } } as any);
}

function faixaDocx(texto: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: MOLDURA,
    rows: [new TableRow({ children: [new TableCell({
      borders: MOLDURA,
      shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
      margins: { top: 20, bottom: 20, left: mm(2), right: mm(2) },
      verticalAlign: VerticalAlign.CENTER,
      children: [par([run(texto, { b: true, size: 11 })], { centro: true, depois: 0 })],
    })] })],
  });
}

export async function gerarHistoricoDocx(e: EntradaHistorico): Promise<Buffer> {
  const corpo: (Paragraph | Table)[] = [];

  // cabeçalho: 3 brasões + órgão
  const brasao = (valor: string | undefined, qual: "pmma" | "ma" | "bpm") => {
    const img = resolverImagem(valor);
    if (!img) return null;
    const [w, h] = encaixar(img.data, CAIXA[qual]);
    return imgDocx(valor, w, h);
  };
  const iPmma = brasao(e.brasoes.pmma, "pmma");
  const iMa = brasao(e.brasoes.ma, "ma");
  const iBpm = brasao(e.brasoes.bpm, "bpm");
  const cel = (larguraMm: number, filhos: Paragraph[]) =>
    new TableCell({ width: { size: mm(larguraMm), type: WidthType.DXA }, borders: SEM_BORDA, verticalAlign: VerticalAlign.TOP, children: filhos });
  corpo.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA,
    /* Larguras em twips, não em porcentagem: com porcentagem o Word aperta a
       coluna do meio pelo conteúdo e o nome do órgão quebra em duas linhas. */
    columnWidths: [mm(28), mm(114), mm(28)],
    rows: [new TableRow({ children: [
      cel(28, [new Paragraph({ alignment: AlignmentType.CENTER, children: iPmma ? [iPmma] : [] })]),
      cel(114, [
        new Paragraph({ alignment: AlignmentType.CENTER, children: iMa ? [iMa] : [] }),
        ...ORG.map((l, i) => par([run(l, { size: i === DESTAQUE ? 12 : 10.5, b: i === DESTAQUE })], { centro: true, depois: 0 })),
        par([run(ENDERECO, { size: 8 })], { centro: true, depois: 0 }),
        par([run(e.contato, { size: 8, b: true })], { centro: true, depois: 0 }),
      ]),
      cel(28, [new Paragraph({ alignment: AlignmentType.CENTER, children: iBpm ? [iBpm] : [] })]),
    ] })],
  }));
  corpo.push(par([run("HISTÓRICO POLICIAL MILITAR", { b: true, size: 16, u: true })], { centro: true, antes: 160, depois: 160 }));

  for (const bl of montarBlocos(e)) {
    if (bl.t === "faixa") { corpo.push(faixaDocx(bl.texto)); continue; }
    if (bl.t === "espaco") { corpo.push(par([run(" ", { size: 6 })], { depois: 0 })); continue; }
    if (bl.t === "campo") {
      corpo.push(par([run(`${bl.rotulo}: `, { b: true }), run(bl.valor)]));
      continue;
    }
    if (bl.t === "alinea") {
      const linhas = linhasDe(bl.valor);
      corpo.push(par([run(`${bl.rotulo}: `, { b: true }), run(linhas.length <= 1 ? (linhas[0] || "") : "")]));
      if (linhas.length > 1) for (const l of linhas) corpo.push(par([run(l)], { justificado: true }));
      continue;
    }
    for (const l of linhasDe(bl.valor)) {
      corpo.push(par([run(semMarca(l))], ehCentro(l) ? { centro: true } : { justificado: true }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONTE, size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: mm(14), bottom: mm(14), left: mm(20), right: mm(20) } } },
      children: corpo,
    }],
  });
  return Packer.toBuffer(doc);
}

/* ============================== PDF ============================== */

const PT = (v: number) => v * 2.834645;
const LARG = 595, ALT = 842;

function seguro(s: string): string {
  return (s || "")
    /* As fontes padrão do PDF são Latin-1: o travessão e as aspas curvas não
       cabem e SOMEM se não forem trocados antes ("11.107 – PMMA" virava
       "11.107 PMMA"). No Word o travessão sai inteiro, como no modelo. */
    .replace(/[·•]/g, "-").replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export async function gerarHistoricoPdf(e: EntradaHistorico): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.TimesRoman);
  const negrito = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const esq = PT(20), dir = LARG - PT(20);
  const TOPO = ALT - PT(14), BASE = PT(14);

  let page: PDFPage = pdf.addPage([LARG, ALT]);
  let y = TOPO;
  const novaPagina = () => { page = pdf.addPage([LARG, ALT]); y = TOPO; };
  const cabe = (h: number) => { if (y - h < BASE) novaPagina(); };

  const largura = (f: PDFFont, s: string, size: number) => f.widthOfTextAtSize(seguro(s), size);
  const escrever = (s: string, x: number, size: number, f: PDFFont) =>
    page.drawText(seguro(s), { x, y: y - size, size, font: f, color: rgb(0, 0, 0) });

  const quebrar = (f: PDFFont, s: string, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const bruta of seguro(s).split("\n")) {
      const palavras = bruta.split(/\s+/).filter(Boolean);
      if (!palavras.length) { out.push(""); continue; }
      let atual = "";
      for (const w of palavras) {
        const tentativa = atual ? `${atual} ${w}` : w;
        if (f.widthOfTextAtSize(tentativa, size) > maxW && atual) { out.push(atual); atual = w; }
        else atual = tentativa;
      }
      if (atual) out.push(atual);
    }
    return out;
  };

  const centrado = (s: string, size: number, f: PDFFont, gap = 3) => {
    cabe(size + gap);
    escrever(s, (LARG - largura(f, s, size)) / 2, size, f);
    y -= size + gap;
  };

  // ---- cabeçalho ----
  const embed = async (v?: string | null) => {
    const img = resolverImagem(v); if (!img) return null;
    try { return img.kind === "jpg" ? await pdf.embedJpg(img.data) : await pdf.embedPng(img.data); } catch { return null; }
  };
  const [iPmma, iMa, iBpm] = await Promise.all([embed(e.brasoes.pmma), embed(e.brasoes.ma), embed(e.brasoes.bpm)]);
  const topo = y;
  /* O pdf-lib já entrega a largura e a altura reais da imagem embutida, então
     aqui o contain sai direto delas. */
  const caberBrasao = (img: { width: number; height: number }, qual: "pmma" | "ma" | "bpm"): [number, number] => {
    const [cw, ch] = CAIXA[qual];
    const escala = Math.min(PT(cw) / img.width, PT(ch) / img.height);
    return [img.width * escala, img.height * escala];
  };
  const altoTopo = PT(Math.max(CAIXA.pmma[1], CAIXA.ma[1], CAIXA.bpm[1]));
  if (iPmma) {
    const [w, h] = caberBrasao(iPmma, "pmma");
    page.drawImage(iPmma, { x: esq, y: topo - h, width: w, height: h });
  }
  if (iBpm) {
    const [w, h] = caberBrasao(iBpm, "bpm");
    page.drawImage(iBpm, { x: dir - w, y: topo - h, width: w, height: h });
  }
  if (iMa) {
    const [w, h] = caberBrasao(iMa, "ma");
    page.drawImage(iMa, { x: (LARG - w) / 2, y: topo - h, width: w, height: h });
  }
  y = topo - altoTopo - 2;
  ORG.forEach((l, i) => centrado(l, i === DESTAQUE ? 12 : 10.5, i === DESTAQUE ? negrito : normal, 1.5));
  centrado(ENDERECO, 8, normal, 1);
  centrado(e.contato, 8, negrito, 1);
  y -= PT(4);
  const tit = "HISTÓRICO POLICIAL MILITAR";
  const wTit = largura(negrito, tit, 15);
  escrever(tit, (LARG - wTit) / 2, 15, negrito);
  page.drawLine({ start: { x: (LARG - wTit) / 2, y: y - 16.5 }, end: { x: (LARG + wTit) / 2, y: y - 16.5 }, thickness: 0.9, color: rgb(0, 0, 0) });
  y -= 22;

  const SIZE = 11, LH = 14;
  const paragrafo = (s: string, f: PDFFont, x = esq, centro = false) => {
    for (const l of quebrar(f, s, SIZE, dir - x)) {
      cabe(LH);
      escrever(l, centro ? (LARG - largura(f, l, SIZE)) / 2 : x, SIZE, f);
      y -= LH;
    }
  };

  for (const bl of montarBlocos(e)) {
    if (bl.t === "faixa") {
      const h = 16;
      cabe(h + 4);
      page.drawRectangle({ x: esq, y: y - h, width: dir - esq, height: h, color: rgb(0.85, 0.85, 0.85), borderColor: rgb(0, 0, 0), borderWidth: 0.7 });
      const w = largura(negrito, bl.texto, 10.5);
      page.drawText(seguro(bl.texto), { x: (LARG - w) / 2, y: y - h + 4.5, size: 10.5, font: negrito, color: rgb(0, 0, 0) });
      y -= h + 4;
      continue;
    }
    if (bl.t === "espaco") { y -= 6; continue; }
    if (bl.t === "campo" || bl.t === "alinea") {
      const rot = `${bl.rotulo}:`;
      const linhas = linhasDe(bl.valor);
      const primeira = linhas.length <= 1 ? (linhas[0] || "") : "";
      cabe(LH);
      escrever(rot, esq, SIZE, negrito);
      if (primeira) {
        const x0 = esq + largura(negrito, rot, SIZE) + largura(normal, "  ", SIZE);
        const cabeNaLinha = quebrar(normal, primeira, SIZE, dir - x0);
        escrever(cabeNaLinha[0], x0, SIZE, normal);
        y -= LH;
        for (const l of cabeNaLinha.slice(1)) { cabe(LH); escrever(l, esq, SIZE, normal); y -= LH; }
      } else y -= LH;
      if (linhas.length > 1) for (const l of linhas) paragrafo(l, normal);
      continue;
    }
    for (const l of linhasDe(bl.valor)) paragrafo(semMarca(l), normal, esq, ehCentro(l));
  }

  return pdf.save();
}
