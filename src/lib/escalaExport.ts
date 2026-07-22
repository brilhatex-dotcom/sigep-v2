import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { compararAntiguidade } from "@/lib/patentes";

/* =========================================================================
   Escala de Servico diaria -> Word (.docx) e PDF, IGUAL ao modelo impresso:
   cabecalho com 3 brasoes + texto do orgao, bloco VISTO (assinatura do Cmt),
   titulo, subtitulo, tabela de Expediente (4 col), servicos 24h, rodape e
   assinatura do Chefe do P/1. Pensado para arquivo oficial.
   ========================================================================= */

type Slot = { titular?: string; permuta?: string | null };
type Expediente = {
  horario?: string; cmt?: string; subcmt?: string; cmtFt?: string;
  p4?: Slot[]; p1?: Slot[]; rondaEscolar?: Slot[]; p3?: Slot[]; patrulha?: Slot[];
};
export type EscalaDia = {
  data?: string; tipo?: string; feriadoLabel?: string;
  apresentacao?: string; servicoHoras?: string; dataConfeccao?: string;
  expediente?: Expediente;
  cpuDeDia?: Slot; guardaPermanente?: Slot[];
  rpAdjunto?: Slot; rpMotorista?: Slot; rpPatrulheiro?: Slot[];
  inteligencia?: Slot[];
  ftGraduado?: Slot; ftMotorista?: Slot; ftPatrulheiro?: Slot;
  rotemHorarios?: string[]; rotemMilitares?: Slot[];
  extraOperacao?: string; extraLocal?: string; extraHorario?: string; extraUniforme?: string;
  extraReforco?: { postoGrad?: string; nome?: string }[];
  observacao?: string;
};
type Brasoes = { pmma?: string; ma?: string; bpm?: string };
type Chefe = { nome?: string; funcao?: string; assinatura?: string; assinarGov?: boolean; cmtAssinatura?: string };
export type EscalaExportInput = { escala: EscalaDia; brasoes?: Brasoes; chefe?: Chefe };

const CIDADE = "Presidente Dutra-MA";
const ORG = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];
const DIAS = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseISO(iso?: string): Date { const [y, m, d] = String(iso || "").split("-").map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); }
function diaSemana(iso?: string): string { return DIAS[parseISO(iso).getDay()]; }
function fimDeSemana(iso?: string): boolean { const g = parseISO(iso).getDay(); return g === 0 || g === 6; }
function extensoUpper(iso?: string): string { const dt = parseISO(iso); return `${String(dt.getDate()).padStart(2, "0")} DE ${MESES[dt.getMonth()].toUpperCase()} DE ${dt.getFullYear()}`; }
function extensoLow(iso?: string): string { const dt = parseISO(iso); return `${String(dt.getDate()).padStart(2, "0")} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()}`; }

function limpa(s?: string | null): string { return String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(); }
function nomeSlot(sl?: Slot | null): string {
  const base = limpa(sl?.titular); if (!base) return "";
  const perm = limpa(sl?.permuta);
  return perm ? `${base}  (PERMUTA- ${perm})` : base;
}
function lista(arr?: Slot[]): string { return (arr || []).map(nomeSlot).filter(Boolean).join("\n"); }

// Resolve imagem: data URL (base64) ou arquivo em public/.
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

/* ============================== DOCX ============================== */

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
const SEM = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SEM_BORDAS = { top: SEM, bottom: SEM, left: SEM, right: SEM };

// docx: `size` é em MEIOS-PONTOS. Os valores originais saíam pequenos (15 = 7,5pt).
// Escala ~1,5× para casar com a IMPRESSÃO (corpo ~11pt, título ~19pt).
const ESCALA_DOCX = 1.5;
function run(text: string, opt: { bold?: boolean; size?: number; italics?: boolean; underline?: boolean } = {}) {
  return new TextRun({ text, bold: opt.bold, italics: opt.italics, size: Math.round((opt.size ?? 15) * ESCALA_DOCX), underline: opt.underline ? {} : undefined });
}
function par(children: TextRun[], align = AlignmentType.CENTER) { return new Paragraph({ alignment: align, children }); }
function linhaP(text: string, opt: { bold?: boolean; size?: number; italics?: boolean; underline?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({ alignment: opt.align ?? AlignmentType.CENTER, children: [run(text, opt)] });
}
function imgDocx(valor?: string | null, w = 80, h = 80) {
  const img = resolverImagem(valor);
  if (!img) return null;
  return new ImageRun({ type: img.kind, data: img.data, transformation: { width: w, height: h } } as any);
}
function celValor(txt: string, w: number, center = false) {
  const linhas = (txt ? txt.split("\n") : [""]);
  return new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE }, borders: BORDAS, verticalAlign: VerticalAlign.CENTER,
    children: linhas.map((l) => new Paragraph({ alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(l, { italics: true })] })),
  });
}
function celRotulo(txt: string, w: number) {
  return new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE }, borders: BORDAS, shading: { fill: "F2F2F2" }, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(txt, { bold: true })] })],
  });
}
function celFaixa(txt: string, span: number) {
  return new TableRow({ children: [new TableCell({ columnSpan: span, shading: { fill: "DDDDDD" }, borders: BORDAS, verticalAlign: VerticalAlign.CENTER, children: [linhaP(txt, { bold: true, size: 16 })] })] });
}

function expedienteDocx(e: EscalaDia): Table | null {
  if (fimDeSemana(e.data) || e.tipo === "extraordinaria" || e.tipo === "joe") return null;
  const ex = e.expediente || {};
  const feriado = (e.tipo && e.tipo !== "normal");
  const ft = e.tipo === "facultativo" ? `PONTO FACULTATIVO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}` : `FERIADO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`;
  const val = (v: string, lst?: Slot[]) => feriado ? ft : (lst ? lista(lst) : limpa(v));
  const rowsExp: TableRow[] = [
    celFaixa(`EXPEDIENTE ${limpa(ex.horario)}`.trim(), 4),
    new TableRow({ children: [celRotulo("CMT", 16), celValor(val(ex.cmt || ""), 34, true), celRotulo("SUBCMT", 16), celValor(val(ex.subcmt || ""), 34, true)] }),
    new TableRow({ children: [celRotulo("CMT FT", 16), celValor(val(ex.cmtFt || ""), 34, true), celRotulo("P4", 16), celValor(val("", ex.p4), 34, true)] }),
    new TableRow({ children: [celRotulo("P1", 16), celValor(val("", ex.p1), 34, true), celRotulo("RONDA ESCOLAR", 16), celValor(val("", ex.rondaEscolar), 34, true)] }),
    new TableRow({ children: [celRotulo("P3", 16), celValor(val("", ex.p3), 34, true), celRotulo("PATRULHA MARIA DA PENHA", 16), celValor(val("", ex.patrulha), 34, true)] }),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rowsExp });
}

// Ordena o REFORÇO por antiguidade (posto -> barra -> nome). Sem data de
// promoção aqui (o export só tem POST/GRAD + nome); a barra do POST/GRAD basta.
function reforcoOrdenado(linhas?: { postoGrad?: string; nome?: string }[]) {
  const barraDe = (s?: string) => (String(s || "").match(/\d+\s*\/\s*\d+/) || [])[0] || "";
  return (linhas || [])
    .filter((l) => limpa(l.postoGrad) || limpa(l.nome))
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const c = compararAntiguidade(
        { postoGrad: a.l.postoGrad || "", numeroBarra: barraDe(a.l.postoGrad), nome: a.l.nome || "" },
        { postoGrad: b.l.postoGrad || "", numeroBarra: barraDe(b.l.postoGrad), nome: b.l.nome || "" },
      );
      return c !== 0 ? c : a.i - b.i;
    })
    .map((x) => x.l);
}

function reforcoDocx(e: EscalaDia): Table {
  const rows: TableRow[] = [
    celFaixa("REFORÇO SEDE", 3),
    new TableRow({ children: [celRotulo("ORD", 12), celRotulo("POST/GRAD", 44), celRotulo("NOME", 44)] }),
  ];
  reforcoOrdenado(e.extraReforco).forEach((l, i) => {
    rows.push(new TableRow({ children: [
      celValor(String(i + 1).padStart(2, "0"), 12, true),
      celValor(limpa(l.postoGrad), 44, true),
      celValor(limpa(l.nome), 44, true),
    ] }));
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function servicosDocx(e: EscalaDia): Table {
  const L = 30, V = 70;
  const rowDado = (lbl: string, valor: string) => new TableRow({ children: [celRotulo(lbl, L), celValor(valor, V)] });
  const rows: TableRow[] = [
    rowDado("CPU DE DIA", nomeSlot(e.cpuDeDia)),
    celFaixa("GUARDA DO QUARTEL", 2),
    rowDado("PERMANENTE", lista(e.guardaPermanente)),
    celFaixa("RÁDIO PATRULHA", 2),
    rowDado("ADJUNTO DE DIA", nomeSlot(e.rpAdjunto)),
    rowDado("MOTORISTA", nomeSlot(e.rpMotorista)),
    rowDado("PATRULHEIRO", lista(e.rpPatrulheiro)),
    celFaixa("SERVIÇO DE INTELIGÊNCIA 24 HRS", 2),
    new TableRow({ children: [new TableCell({ columnSpan: 2, borders: BORDAS, verticalAlign: VerticalAlign.CENTER, children: (lista(e.inteligencia) || " ").split("\n").map((l) => linhaP(l)) })] }),
    celFaixa("FORÇA TÁTICA", 2),
    rowDado("GRADUADO", nomeSlot(e.ftGraduado)),
    rowDado("MOTORISTA", nomeSlot(e.ftMotorista)),
    rowDado("PATRULHEIRO", nomeSlot(e.ftPatrulheiro)),
    celFaixa("ROTEM", 2),
    new TableRow({ children: [celValor((e.rotemHorarios || []).filter(Boolean).join("\n"), L, true), celValor(lista(e.rotemMilitares), V)] }),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

export async function gerarEscalaDocx(input: EscalaExportInput): Promise<Buffer> {
  const e = input.escala || {};
  const br = input.brasoes || {};
  const ch = input.chefe || {};
  const extra = e.tipo === "extraordinaria" || e.tipo === "joe";

  // cabecalho: 3 colunas sem borda
  const orgPars = ORG.map((l, i) => linhaP(l, { size: i === 4 ? 15 : 13, bold: i === 4 }));
  const imgPmma = imgDocx(br.pmma, 66, 54);
  const imgMa = imgDocx(br.ma, 48, 54);
  const imgBpm = imgDocx(br.bpm, 54, 58);
  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: SEM, bottom: SEM, left: SEM, right: SEM, insideHorizontal: SEM, insideVertical: SEM },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgPmma ? [imgPmma] : [] })] }),
      new TableCell({ width: { size: 56, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }), ...orgPars] }),
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgBpm ? [imgBpm] : [] })] }),
    ] })],
  });

  // VISTO + titulo
  const imgVisto = imgDocx(ch.cmtAssinatura, 90, 34);
  const vistoTitulo = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: SEM, bottom: SEM, left: SEM, right: SEM, insideHorizontal: SEM, insideVertical: SEM },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.BOTTOM, children: [
        linhaP("VISTO", { bold: true, size: 16 }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: imgVisto ? [imgVisto] : [] }),
        linhaP("Cmt. do 18º BPM", { size: 15 }),
      ] }),
      new TableCell({ width: { size: 74, type: WidthType.PERCENTAGE }, borders: SEM_BORDAS, verticalAlign: VerticalAlign.CENTER, children: [
        linhaP(extra ? "ESCALA DE SERVIÇO EXTRAORDINÁRIA" : "ESCALA DE SERVIÇO", { bold: true, size: 26, underline: true }),
      ] }),
    ] })],
  });

  const ehExtraord = e.tipo === "extraordinaria";
  const corpo: (Paragraph | Table)[] = [
    cabecalho,
    vistoTitulo,
    linhaP(`PARA O DIA ${extensoUpper(e.data)} (${diaSemana(e.data)})`, { bold: true, size: 18, underline: true }),
  ];
  // A extraordinária não é serviço de 24h — não sai a linha "SERVIÇO - 24 HORAS".
  if (!ehExtraord) {
    corpo.push(linhaP(`SERVIÇO - ${limpa(e.servicoHoras) || "24 HORAS"} (APRESENTAÇÃO ÀS ${limpa(e.apresentacao) || "08H"})`, { bold: true, size: 15, underline: true }));
  }
  corpo.push(new Paragraph({ text: "", spacing: { after: 40 } }));

  let temQuartel = false;
  if (extra) {
    const linhaCampo = (lbl: string, v?: string) => new Paragraph({ children: [run(lbl + " ", { bold: true }), run(limpa(v))] });
    corpo.push(linhaCampo("OPERAÇÃO:", e.extraOperacao), linhaCampo("LOCAL:", e.extraLocal), linhaCampo("HORÁRIO:", e.extraHorario), linhaCampo("UNIFORME:", e.extraUniforme));
    corpo.push(new Paragraph({ text: "", spacing: { after: 30 } }));
    if (ehExtraord) { corpo.push(reforcoDocx(e)); temQuartel = true; } // REFORÇO SEDE (nomes) — faltava no export
  } else {
    const exp = expedienteDocx(e);
    if (exp) { corpo.push(exp, new Paragraph({ text: "", spacing: { after: 30 } })); }
    corpo.push(servicosDocx(e));
    temQuartel = true;
  }

  // Ordem pedida: ...escala/ROTEM -> OBSERVAÇÃO -> "Quartel local + data".
  if (limpa(e.observacao)) {
    corpo.push(new Paragraph({ spacing: { before: 80 }, children: [run("OBSERVAÇÃO: ", { bold: true, size: 14 }), run(limpa(e.observacao), { size: 14, italics: true })] }));
  }
  if (temQuartel) {
    corpo.push(linhaP(`Quartel do 18º BPM, em ${CIDADE}, ${extensoLow(e.dataConfeccao || e.data)}.`, { size: 14, align: AlignmentType.RIGHT }));
  }

  // assinatura do chefe
  const imgAss = (!ch.assinarGov && ch.assinatura) ? imgDocx(ch.assinatura, 150, 48) : null;
  corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: imgAss ? [imgAss] : [run(" ")] }));
  corpo.push(linhaP(ch.nome || "", { bold: true, size: 15 }));
  corpo.push(linhaP(ch.funcao || "", { size: 14 }));

  const doc = new Document({ sections: [{ properties: {}, children: corpo }] });
  return Packer.toBuffer(doc);
}

/* ============================== PDF ============================== */

function safe(s: string): string {
  return (s || "").replace(/[·•]/g, "-").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export async function gerarEscalaPdf(input: EscalaExportInput): Promise<Uint8Array> {
  const e = input.escala || {};
  const br = input.brasoes || {};
  const ch = input.chefe || {};
  const extra = e.tipo === "extraordinaria" || e.tipo === "joe";

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 595, H = 842, MX = 42;
  const usable = W - MX * 2;
  let page = pdf.addPage([W, H]);
  let y = H - 34;

  const novaPagina = () => { page = pdf.addPage([W, H]); y = H - 34; };
  const garante = (h: number) => { if (y - h < 44) novaPagina(); };

  const embed = async (valor?: string | null) => {
    const img = resolverImagem(valor); if (!img) return null;
    try { return img.kind === "jpg" ? await pdf.embedJpg(img.data) : await pdf.embedPng(img.data); } catch { return null; }
  };
  const centro = (txt: string, size: number, f = bold, gap = 3, sublinhado = false) => {
    const t = safe(txt); const w = f.widthOfTextAtSize(t, size);
    garante(size + gap);
    const yy = y - size;
    page.drawText(t, { x: (W - w) / 2, y: yy, size, font: f, color: rgb(0, 0, 0) });
    if (sublinhado) page.drawLine({ start: { x: (W - w) / 2, y: yy - 1.5 }, end: { x: (W + w) / 2, y: yy - 1.5 }, thickness: 0.8, color: rgb(0, 0, 0) });
    y -= size + gap;
  };
  const quebra = (txt: string, size: number, f: any, maxW: number): string[] => {
    const out: string[] = [];
    for (const bruta of safe(txt).split("\n")) {
      if (bruta === "") { out.push(""); continue; }
      let ln = "";
      for (const p of bruta.split(" ")) { const t = ln ? ln + " " + p : p; if (f.widthOfTextAtSize(t, size) > maxW && ln) { out.push(ln); ln = p; } else ln = t; }
      if (ln) out.push(ln);
    }
    return out.length ? out : [""];
  };

  // ---- cabecalho: 3 brasoes + texto do orgao ----
  const [iPmma, iMa, iBpm] = await Promise.all([embed(br.pmma), embed(br.ma), embed(br.bpm)]);
  const topo = y;
  if (iPmma) page.drawImage(iPmma, { x: MX + 6, y: topo - 52, width: 64, height: 52 });
  if (iBpm) page.drawImage(iBpm, { x: W - MX - 60, y: topo - 56, width: 56, height: 56 });
  if (iMa) page.drawImage(iMa, { x: (W - 48) / 2, y: topo - 54, width: 48, height: 54 });
  y = topo - 58;
  for (let i = 0; i < ORG.length; i++) centro(ORG[i], i === 4 ? 10 : 8, i === 4 ? bold : font, 1.5);
  y -= 4;

  // ---- VISTO (esquerda) + titulo ----
  const tituloY = y;
  const iVisto = await embed(ch.cmtAssinatura);
  page.drawText("VISTO", { x: MX + 10, y: tituloY - 11, size: 10, font: bold, color: rgb(0, 0, 0) });
  if (iVisto) page.drawImage(iVisto, { x: MX + 6, y: tituloY - 44, width: 78, height: 26 });
  page.drawText("Cmt. do 18º BPM", { x: MX + 2, y: tituloY - 56, size: 8, font, color: rgb(0, 0, 0) });
  const tit = safe(extra ? "ESCALA DE SERVIÇO EXTRAORDINÁRIA" : "ESCALA DE SERVIÇO");
  const titW = bold.widthOfTextAtSize(tit, 15);
  page.drawText(tit, { x: (W - titW) / 2, y: tituloY - 30, size: 15, font: bold, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: (W - titW) / 2, y: tituloY - 33 }, end: { x: (W + titW) / 2, y: tituloY - 33 }, thickness: 0.9, color: rgb(0, 0, 0) });
  y = tituloY - 52;
  centro(`PARA O DIA ${extensoUpper(e.data)} (${diaSemana(e.data)})`, 10, bold, 2, true);
  // A extraordinária não é serviço de 24h — não sai a linha "SERVIÇO - 24 HORAS".
  if (e.tipo !== "extraordinaria") {
    centro(`SERVIÇO - ${limpa(e.servicoHoras) || "24 HORAS"} (APRESENTAÇÃO ÀS ${limpa(e.apresentacao) || "08H"})`, 9, bold, 4, true);
  }

  // ---- desenho de tabela generico ----
  type Cel = { text: string; w: number; bold?: boolean; center?: boolean; fill?: boolean };
  const drawLinha = (cels: Cel[], titulo = false) => {
    const size = 9, lh = 11, padY = 2.5;
    const fontDe = (c: Cel) => (c.bold ? bold : c.fill ? font : italic); // valores em italico
    // calcula altura
    let maxLinhas = 1;
    const conteudo = cels.map((c) => {
      const larguraTxt = usable * c.w - 10;
      const linhas = titulo ? [c.text] : quebra(c.text, size, fontDe(c), larguraTxt);
      maxLinhas = Math.max(maxLinhas, linhas.length);
      return linhas;
    });
    const altura = maxLinhas * lh + padY * 2;
    garante(altura);
    const topoL = y;
    let x = MX;
    cels.forEach((c, idx) => {
      const cw = usable * c.w;
      // Espelha a IMPRESSÃO (limpa): rótulos/cabeçalhos são só negrito + borda
      // preta, SEM preenchimento cinza. Mantém apenas a moldura da célula.
      page.drawRectangle({ x, y: topoL - altura, width: cw, height: altura, borderColor: rgb(0, 0, 0), borderWidth: 0.7 });
      const linhas = conteudo[idx];
      const f = fontDe(c);
      const blocoH = linhas.length * lh;
      let ly = topoL - (altura - blocoH) / 2 - lh + 3;
      for (const l of linhas) {
        const t = safe(l);
        const tx = c.center ? x + (cw - f.widthOfTextAtSize(t, size)) / 2 : x + 5;
        page.drawText(t, { x: tx, y: ly, size, font: f, color: rgb(0, 0, 0) });
        ly -= lh;
      }
      x += cw;
    });
    y = topoL - altura;
  };
  const faixa = (txt: string) => drawLinha([{ text: txt, w: 1, bold: true, center: true, fill: true }], true);

  let temQuartel = false;
  if (extra) {
    const campo = (lbl: string, v?: string) => { garante(16); page.drawText(safe(lbl + " ") + safe(limpa(v)), { x: MX, y: y - 12, size: 11, font, color: rgb(0, 0, 0) }); y -= 18; };
    y -= 4;
    campo("OPERACAO:", e.extraOperacao); campo("LOCAL:", e.extraLocal); campo("HORARIO:", e.extraHorario); campo("UNIFORME:", e.extraUniforme);
    if (e.tipo === "extraordinaria") {
      y -= 6;
      faixa("REFORÇO SEDE"); // faltava no export — agora sai com os nomes
      drawLinha([{ text: "ORD", w: 0.12, bold: true, center: true, fill: true }, { text: "POST/GRAD", w: 0.44, bold: true, center: true, fill: true }, { text: "NOME", w: 0.44, bold: true, center: true, fill: true }], true);
      reforcoOrdenado(e.extraReforco).forEach((l, i) => {
        drawLinha([{ text: String(i + 1).padStart(2, "0"), w: 0.12, center: true }, { text: limpa(l.postoGrad), w: 0.44, center: true }, { text: limpa(l.nome), w: 0.44, center: true }]);
      });
      temQuartel = true;
    }
  } else {
    // Expediente
    if (!fimDeSemana(e.data) && e.tipo !== "extraordinaria" && e.tipo !== "joe") {
      const ex = e.expediente || {};
      const feriado = (e.tipo && e.tipo !== "normal");
      const ft = e.tipo === "facultativo" ? `PONTO FACULTATIVO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}` : `FERIADO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`;
      const v = (s: string, lst?: Slot[]) => feriado ? ft : (lst ? lista(lst) : limpa(s));
      faixa(`EXPEDIENTE ${limpa(ex.horario)}`.trim());
      const r4 = (l1: string, v1: string, l2: string, v2: string) => drawLinha([
        { text: l1, w: 0.16, bold: true, center: true, fill: true }, { text: v1, w: 0.34, center: true },
        { text: l2, w: 0.16, bold: true, center: true, fill: true }, { text: v2, w: 0.34, center: true },
      ]);
      r4("CMT", v(ex.cmt || ""), "SUBCMT", v(ex.subcmt || ""));
      r4("CMT FT", v(ex.cmtFt || ""), "P4", v("", ex.p4));
      r4("P1", v("", ex.p1), "RONDA ESCOLAR", v("", ex.rondaEscolar));
      r4("P3", v("", ex.p3), "PATRULHA M. DA PENHA", v("", ex.patrulha));
      y -= 6;
    }
    // Servicos
    const d2 = (lbl: string, valor: string, center = false) => drawLinha([{ text: lbl, w: 0.3, bold: true, center: true, fill: true }, { text: valor, w: 0.7, center }]);
    d2("CPU DE DIA", nomeSlot(e.cpuDeDia));
    faixa("GUARDA DO QUARTEL");
    d2("PERMANENTE", lista(e.guardaPermanente));
    faixa("RÁDIO PATRULHA");
    d2("ADJUNTO DE DIA", nomeSlot(e.rpAdjunto));
    d2("MOTORISTA", nomeSlot(e.rpMotorista));
    d2("PATRULHEIRO", lista(e.rpPatrulheiro));
    faixa("SERVIÇO DE INTELIGÊNCIA 24 HRS");
    drawLinha([{ text: lista(e.inteligencia), w: 1, center: true }]);
    faixa("FORÇA TÁTICA");
    d2("GRADUADO", nomeSlot(e.ftGraduado));
    d2("MOTORISTA", nomeSlot(e.ftMotorista));
    d2("PATRULHEIRO", nomeSlot(e.ftPatrulheiro));
    faixa("ROTEM");
    drawLinha([{ text: (e.rotemHorarios || []).filter(Boolean).join("\n"), w: 0.3, bold: true, center: true, fill: true }, { text: lista(e.rotemMilitares), w: 0.7 }]);
    temQuartel = true;
  }

  // Ordem pedida: ...escala/ROTEM -> OBSERVAÇÃO -> "Quartel local + data".
  if (limpa(e.observacao)) {
    y -= 8;
    const linhas = quebra("OBSERVAÇÃO: " + limpa(e.observacao), 9, font, usable - 10);
    for (const l of linhas) { garante(12); page.drawText(safe(l), { x: MX, y: y - 10, size: 9, font, color: rgb(0, 0, 0) }); y -= 12; }
  }
  if (temQuartel) {
    y -= 12;
    centro(`Quartel do 18º BPM, em ${CIDADE}, ${extensoLow(e.dataConfeccao || e.data)}.`, 9.5, font, 4);
  }

  // assinatura
  y -= 16;
  if (!ch.assinarGov && ch.assinatura) {
    const iAss = await embed(ch.assinatura);
    if (iAss) { garante(46); page.drawImage(iAss, { x: (W - 150) / 2, y: y - 40, width: 150, height: 40 }); y -= 44; }
  } else { y -= 34; }
  centro(safe(ch.nome || ""), 10, bold, 3);
  centro(safe(ch.funcao || ""), 9, font, 3);

  return pdf.save();
}
