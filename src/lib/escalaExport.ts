import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* =========================================================================
   Geracao da Escala de Servico diaria para download em Word (.docx) e PDF.
   Recebe o objeto do dia (o mesmo "e" da tela), achata em secoes e desenha.
   ========================================================================= */

type Slot = { titular?: string; permuta?: string | null };
export type EscalaExport = {
  data?: string;
  apresentacao?: string;
  servicoHoras?: string;
  cpuDeDia?: Slot;
  guardaPermanente?: Slot[];
  rpAdjunto?: Slot;
  rpMotorista?: Slot;
  rpPatrulheiro?: Slot[];
  inteligencia?: Slot[];
  ftGraduado?: Slot;
  ftMotorista?: Slot;
  ftPatrulheiro?: Slot;
  rotemHorarios?: string[];
  rotemMilitares?: Slot[];
};

const BATALHAO = "18º BATALHÃO DE POLÍCIA MILITAR";
const CIDADE = "Presidente Dutra-MA";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function limpa(s?: string | null): string {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}
function nomeSlot(sl?: Slot | null): string {
  const base = limpa(sl?.titular);
  if (!base) return "";
  const perm = limpa(sl?.permuta);
  return perm ? `${base}  (PERMUTA- ${perm})` : base;
}
function nomesLista(arr?: Slot[]): string {
  return (arr || []).map(nomeSlot).filter(Boolean).join("\n");
}
function dataExtenso(iso?: string): string {
  const [a, m, d] = String(iso || "").split("-").map(Number);
  if (!a || !m || !d) return String(iso || "");
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} de ${a}`;
}

type Secao = { titulo: string; linhas: { lbl: string; val: string }[] };

function secoes(e: EscalaExport): Secao[] {
  return [
    { titulo: "CPU DE DIA", linhas: [{ lbl: "", val: nomeSlot(e.cpuDeDia) }] },
    { titulo: "GUARDA DO QUARTEL", linhas: [{ lbl: "PERMANENTE", val: nomesLista(e.guardaPermanente) }] },
    { titulo: "RÁDIO PATRULHA", linhas: [
      { lbl: "ADJUNTO DE DIA", val: nomeSlot(e.rpAdjunto) },
      { lbl: "MOTORISTA", val: nomeSlot(e.rpMotorista) },
      { lbl: "PATRULHEIRO", val: nomesLista(e.rpPatrulheiro) },
    ] },
    { titulo: "SERVIÇO DE INTELIGÊNCIA 24 HRS", linhas: [{ lbl: "", val: nomesLista(e.inteligencia) }] },
    { titulo: "FORÇA TÁTICA", linhas: [
      { lbl: "GRADUADO", val: nomeSlot(e.ftGraduado) },
      { lbl: "MOTORISTA", val: nomeSlot(e.ftMotorista) },
      { lbl: "PATRULHEIRO", val: nomeSlot(e.ftPatrulheiro) },
    ] },
    { titulo: "ROTEM", linhas: [
      { lbl: "HORÁRIOS", val: (e.rotemHorarios || []).filter(Boolean).join("   /   ") },
      { lbl: "EQUIPE", val: nomesLista(e.rotemMilitares) },
    ] },
  ];
}

/* ----------------------------- DOCX ----------------------------- */

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };

function pTitulo(txt: string, size = 20, bold = true, align = AlignmentType.CENTER): Paragraph {
  return new Paragraph({ alignment: align, children: [new TextRun({ text: txt, bold, size })] });
}

export async function gerarEscalaDocx(e: EscalaExport): Promise<Buffer> {
  const rows: TableRow[] = [];

  for (const sec of secoes(e)) {
    // faixa do titulo (celula unica, 2 colunas)
    rows.push(new TableRow({
      children: [new TableCell({
        columnSpan: 2, shading: { fill: "DDDDDD" }, borders: BORDAS, verticalAlign: VerticalAlign.CENTER,
        children: [pTitulo(sec.titulo, 20)],
      })],
    }));
    for (const ln of sec.linhas) {
      rows.push(new TableRow({
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE }, borders: BORDAS, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ln.lbl, bold: true, size: 18 })] })],
          }),
          new TableCell({
            width: { size: 68, type: WidthType.PERCENTAGE }, borders: BORDAS, verticalAlign: VerticalAlign.CENTER,
            children: (ln.val ? ln.val.split("\n") : [""]).map((linha) =>
              new Paragraph({ children: [new TextRun({ text: linha, size: 18 })] })),
          }),
        ],
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        pTitulo("POLÍCIA MILITAR DO MARANHÃO", 20),
        pTitulo(BATALHAO, 22),
        pTitulo("ESCALA DE SERVIÇO", 24),
        pTitulo(dataExtenso(e.data), 20, false),
        pTitulo(`Apresentação: ${limpa(e.apresentacao) || "08H"}   ·   Serviço: ${limpa(e.servicoHoras) || "24 HORAS"}`, 18, false),
        new Paragraph({ text: "" }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        new Paragraph({ text: "" }),
        pTitulo(`Quartel do 18º BPM, em ${CIDADE}, ${dataExtenso(e.data)}.`, 18, false),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

/* ----------------------------- PDF ----------------------------- */

// pdf-lib usa fontes StandardFonts (WinAnsi/Latin-1). Trocamos caracteres
// fora desse conjunto por equivalentes seguros.
function safe(s: string): string {
  return (s || "")
    .replace(/[·•]/g, "-").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export async function gerarEscalaPdf(e: EscalaExport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595, H = 842, MX = 48;
  const usable = W - MX * 2;
  const colL = usable * 0.32;
  let page = pdf.addPage([W, H]);
  let y = H - 54;

  const novaPagina = () => { page = pdf.addPage([W, H]); y = H - 54; };
  const garante = (h: number) => { if (y - h < 48) novaPagina(); };

  const centro = (txt: string, size: number, f = bold) => {
    const t = safe(txt);
    const w = f.widthOfTextAtSize(t, size);
    garante(size + 6);
    page.drawText(t, { x: (W - w) / 2, y: y - size, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 6;
  };

  // Quebra um texto em linhas que cabem em maxW.
  const quebrar = (txt: string, size: number, f: any, maxW: number): string[] => {
    const out: string[] = [];
    for (const bruta of safe(txt).split("\n")) {
      if (bruta === "") { out.push(""); continue; }
      let linha = "";
      for (const p of bruta.split(" ")) {
        const teste = linha ? linha + " " + p : p;
        if (f.widthOfTextAtSize(teste, size) > maxW && linha) { out.push(linha); linha = p; }
        else linha = teste;
      }
      if (linha) out.push(linha);
    }
    return out.length ? out : [""];
  };

  // cabecalho
  centro("POLICIA MILITAR DO MARANHAO", 12);
  centro(BATALHAO, 13);
  centro("ESCALA DE SERVICO", 15);
  centro(dataExtenso(e.data), 11, font);
  centro(`Apresentacao: ${limpa(e.apresentacao) || "08H"}   -   Servico: ${limpa(e.servicoHoras) || "24 HORAS"}`, 10, font);
  y -= 8;

  const linhaTabela = (lbl: string, val: string, titulo = false) => {
    const size = 10;
    const lh = 13;
    const valLinhas = titulo ? [""] : quebrar(val, size, font, usable - colL - 12);
    const altura = Math.max(lh + 6, valLinhas.length * lh + 6);
    garante(altura);
    const topo = y;
    // fundo do titulo
    if (titulo) page.drawRectangle({ x: MX, y: topo - altura, width: usable, height: altura, color: rgb(0.87, 0.87, 0.87) });
    // bordas
    page.drawRectangle({ x: MX, y: topo - altura, width: usable, height: altura, borderColor: rgb(0, 0, 0), borderWidth: 0.7 });
    if (!titulo) page.drawLine({ start: { x: MX + colL, y: topo }, end: { x: MX + colL, y: topo - altura }, thickness: 0.7, color: rgb(0, 0, 0) });

    if (titulo) {
      const t = safe(lbl); const w = bold.widthOfTextAtSize(t, 11);
      page.drawText(t, { x: (W - w) / 2, y: topo - altura / 2 - 4, size: 11, font: bold, color: rgb(0, 0, 0) });
    } else {
      const t = safe(lbl); const w = bold.widthOfTextAtSize(t, size);
      page.drawText(t, { x: MX + (colL - w) / 2, y: topo - altura / 2 - 4, size, font: bold, color: rgb(0, 0, 0) });
      let vy = topo - lh;
      for (const l of valLinhas) { page.drawText(l, { x: MX + colL + 6, y: vy - 2, size, font, color: rgb(0, 0, 0) }); vy -= lh; }
    }
    y = topo - altura;
  };

  for (const sec of secoes(e)) {
    linhaTabela(sec.titulo, "", true);
    for (const ln of sec.linhas) linhaTabela(ln.lbl, ln.val, false);
  }

  y -= 18;
  centro(`Quartel do 18o BPM, em ${CIDADE}, ${dataExtenso(e.data)}.`, 10, font);

  return pdf.save();
}
