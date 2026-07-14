import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import type { Permuta } from "@/lib/permutaPedidos";

/* Gera a SOLICITAÇÃO DE PERMUTA em .docx, no mesmo layout do documento da tela
   (cabeçalho no padrão da escala: 190 anos PMMA · armas PMMA · 18º BPM). */

function pxFromMm(mm: number): number { return Math.round((mm / 25.4) * 96); }
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function imagem(nome: string, wMm: number, hMm: number): ImageRun | null {
  try {
    const dados = fs.readFileSync(path.join(process.cwd(), "public", nome));
    const kind: "png" | "jpg" = /\.jpe?g$/i.test(nome) ? "jpg" : "png";
    return new ImageRun({ type: kind, data: dados, transformation: { width: pxFromMm(wMm), height: pxFromMm(hMm) } } as any);
  } catch { return null; }
}

const SEM_BORDA = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const COM_BORDA = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" }, right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

function pCenter(text: string, opt: { bold?: boolean; size?: number; italics?: boolean } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, italics: opt.italics, size: opt.size ?? 22 })] });
}

function boxAssinatura(titulo: string, linha: string, nome: string, em: string | null): Paragraph[] {
  const out: Paragraph[] = [pCenter(titulo, { bold: true, size: 22 })];
  if (em) {
    out.push(pCenter("Documento assinado digitalmente", { size: 16 }));
    out.push(pCenter(`SIGEP · ${(nome || linha).toUpperCase()}`, { size: 15, bold: true }));
    out.push(pCenter(`Assinado em ${dataHora(em)} · 18º BPM (login individual)`, { size: 14 }));
  } else {
    out.push(pCenter("aguardando assinatura", { italics: true, size: 18 }));
  }
  out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000" } }, children: [new TextRun({ text: linha, bold: true, size: 22 })] }));
  return out;
}

export async function gerarPermutaDocx(p: Permuta): Promise<Buffer> {
  const imgPmma = imagem("brasoes/pmma-190.jpg", 30, 24);
  const imgMa = imagem("brasoes/armas-ma.png", 17, 17);
  const imgBpm = imagem("brasoes/brasao-18bpm.png", 22, 22);

  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2",
    "18º BATALHÃO DE POLÍCIA MILITAR",
  ].map((t) => pCenter(t, { bold: true, size: 22 }));

  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgPmma ? [imgPmma] : [] })] }),
      new TableCell({ width: { size: 52, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }), ...org] }),
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgBpm ? [imgBpm] : [] })] }),
    ] })],
  });

  const corpoRuns: TextRun[] = [
    new TextRun("Eu, "), new TextRun({ text: p.solicitante.linha, bold: true }),
    new TextRun(", integrante do 18º BPM, venho solicitar que seja autorizado permuta de serviço com o policial militar "),
    new TextRun({ text: p.solicitado?.linha || p.solicitadoNome, bold: true }),
    new TextRun(", para a data de "), new TextRun({ text: dBR(p.dataPermuta), bold: true }),
    new TextRun(", com retorno para a data "), new TextRun({ text: dBR(p.dataRetorno), bold: true }),
    ...(p.motivo ? [new TextRun(" por motivos "), new TextRun({ text: p.motivo, bold: true })] : []),
    new TextRun("."),
  ];

  const assinaturas = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: COM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: COM_BORDA, children: boxAssinatura("SOLICITANTE", p.solicitante.linha, p.solicitante.nome, p.solicitante.em) }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: COM_BORDA, children: boxAssinatura("SOLICITADO", p.solicitado?.linha || p.solicitadoNome, p.solicitado?.nome || "", p.solicitado?.em || null) }),
    ] })],
  });

  const parecerCel: Paragraph[] = [pCenter("Parecer do Chefe do P1", { size: 22 })];
  if (p.parecerP1) parecerCel.push(new Paragraph({ children: [new TextRun({ text: p.parecerP1, size: 20 })] }));
  else { parecerCel.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "_______________________________", size: 20 })] })); parecerCel.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "_______________________________", size: 20 })] })); }
  if (p.p1Nome) parecerCel.push(pCenter(`${p.p1Cargo ? p.p1Cargo + " " : ""}${p.p1Nome} · ${dataHora(p.p1Em)}`, { size: 15 }));

  const vistoCel: Paragraph[] = [
    pCenter("Visto do Subcomandante do 18ºBPM", { size: 22 }),
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: `${p.visto === "autorizado" ? "[X]" : "[  ]"}  Autorizado`, size: 22 })] }),
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: `${p.visto === "nao_autorizado" ? "[X]" : "[  ]"}  Não Autorizado`, size: 22 })] }),
  ];

  const parecer = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: COM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: COM_BORDA, children: parecerCel }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: COM_BORDA, children: vistoCel }),
    ] })],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 1130, right: 1130 } } },
      children: [
        cabecalho,
        new Paragraph({ text: "" }),
        pCenter("SOLICITAÇÃO DE PERMUTA", { bold: true, size: 26 }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 700 }, spacing: { after: 300 }, children: corpoRuns }),
        assinaturas,
        new Paragraph({ spacing: { before: 120, after: 300 }, children: [new TextRun({ text: "(Obs: A solicitação deve ser assinada digitalmente e entregue COM 48H ANTES DO DIA DA PERMUTA PRETENDIDA)", italics: true, bold: true, size: 18 })] }),
        parecer,
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
