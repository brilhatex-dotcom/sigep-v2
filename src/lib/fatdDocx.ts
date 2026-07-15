import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";

/* Gera o FATD (.docx) FIELMENTE no modelo oficial do 18º BPM (Presidente
   Dutra-MA), preenchido pelo registro do mapa de controle. */

export type FatdReg = {
  numero: string; encarregado: string; portaria: string; dataInstauracao: string;
  envolvido: string; objeto: string; prazo: string;
};

const ANO = new Date().getFullYear();
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function pxFromMm(mm: number): number { return Math.round((mm / 25.4) * 96); }
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "____/____/______";
}
function dataExtenso(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `______ de ____________________ de ${ANO}`;
  return `${m[3]} de ${MESES[Number(m[2]) - 1] || "____"} de ${m[1]}`;
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

function pC(text: string, opt: { bold?: boolean; size?: number } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 22 })] });
}
function b(text: string) { return new TextRun({ text, bold: true, size: 22 }); }
function t(text: string) { return new TextRun({ text, size: 22 }); }
const BR = "____________________";

// Seção no formato do formulário: barra de título sombreada + caixa com conteúdo.
function secao(titulo: string, conteudo: Paragraph[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: COM_BORDA,
    rows: [
      new TableRow({ children: [new TableCell({ shading: { fill: "E4E4E4" } as any, borders: COM_BORDA, children: [pC(titulo, { bold: true, size: 22 })] })] }),
      new TableRow({ children: [new TableCell({ borders: COM_BORDA, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: conteudo })] }),
    ],
  });
}
function assinaturaCentral(linha1: string, linha2?: string): Paragraph[] {
  const out = [
    new Paragraph({ text: "" }), new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "________________________________________", size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: linha1, bold: true, size: 22 })] }),
  ];
  if (linha2) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: linha2, bold: true, size: 22 })] }));
  return out;
}
function esp() { return new Paragraph({ spacing: { after: 120 }, children: [] }); }

export async function gerarFatdDocx(reg: FatdReg, chefes: { chefeP1?: string; comandante?: string } = {}): Promise<Buffer> {
  const numero = (reg.numero || "").trim() || `______/${ANO}`;
  const enc = (reg.encarregado || "").trim() || (chefes.chefeP1 || "").trim();
  const comandante = (chefes.comandante || "").trim();
  const mil = (reg.envolvido || "").trim();

  const imgPmma = imagem("brasoes/pmma-190.jpg", 24, 20);
  const imgMa = imagem("brasoes/armas-ma.png", 15, 15);
  const imgBpm = imagem("brasoes/brasao-18bpm.png", 20, 20);
  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA I/2",
    "18º BATALHÃO DE POLÍCIA MILITAR",
  ].map((x) => pC(x, { bold: true, size: 20 }));

  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgPmma ? [imgPmma] : [] })] }),
      new TableCell({ width: { size: 56, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }), ...org] }),
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgBpm ? [imgBpm] : [] })] }),
    ] })],
  });

  // caixa PROCESSO / DATA
  const procData = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: COM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, borders: COM_BORDA, margins: { top: 40, bottom: 40, left: 100, right: 100 }, children: [new Paragraph({ children: [b("PROCESSO Nº "), t(`${numero} — 18º BPM`)] })] }),
      new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, borders: COM_BORDA, margins: { top: 40, bottom: 40, left: 100, right: 100 }, children: [new Paragraph({ children: [b("DATA: "), t(dBR(reg.dataInstauracao))] })] }),
    ] })],
  });

  const relato = new Paragraph({
    alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 500 }, spacing: { after: 120 },
    children: [t("Deveis justificar o motivo pelo qual, na data de " + (reg.objeto?.trim() ? "" : BR + ", ") + (reg.objeto?.trim() || BR + BR + BR) + ".")],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 600, bottom: 600, left: 1000, right: 1000 } } },
      children: [
        cabecalho,
        pC("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000", { size: 16 }),
        pC("TELEFAX: (99) 3663-3892 — 18batalhaopmma@gmail.com", { size: 16 }),
        new Paragraph({ text: "" }),
        pC("FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR", { bold: true, size: 24 }),
        new Paragraph({ text: "" }),
        procData,
        esp(),
        secao("IDENTIFICAÇÃO DO MILITAR", [
          new Paragraph({ children: [b("Grau de Hierárquico: "), t(BR + "   "), b("Nº Identidade: "), t(BR + " PMMA.")] }),
          new Paragraph({ children: [b("Nome Completo: "), t(mil || BR + BR + BR)] }),
          new Paragraph({ children: [b("Unidade: "), t("18º Batalhão de Polícia Militar")] }),
        ]),
        esp(),
        secao("IDENTIFICAÇÃO DO PARTICIPANTE", [
          new Paragraph({ children: [b("Grau Hierárquico: "), t((enc || BR) + "   "), b("Nº Identidade: "), t(BR + " PMMA.")] }),
          new Paragraph({ children: [b("Nome Completo: "), t(BR + BR + BR)] }),
          new Paragraph({ children: [b("Unidade: "), t("18º Batalhão de Polícia Militar")] }),
        ]),
        esp(),
        secao("RELATO DO FATO", [
          relato,
          new Paragraph({ text: "" }),
          pC(`Presidente Dutra - MA, ${dataExtenso(reg.dataInstauracao)}.`, { size: 22 }),
          ...assinaturaCentral(enc ? enc.toUpperCase() : "________________________", "CHEFE P/1 18º BPM"),
        ]),
        esp(),
        secao("CIENTE DO MILITAR ARROLADO", [
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 500 }, children: [t("Declaro que tenho conhecimento de que me está sendo imputada a autoria dos atos acima e me foi concedido o prazo de três dias úteis, para, querendo, apresentar, por escrito, as minhas justificativas ou razões de defesa.")] }),
          new Paragraph({ text: "" }),
          pC(`Presidente Dutra - MA, ____ /_________/ ${ANO}.`, { size: 22 }),
          ...assinaturaCentral(mil ? mil.toUpperCase() : "________________________"),
        ]),
        esp(),
        secao("JUSTIFICATIVAS / RAZÕES DE DEFESA", [
          new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
          pC(`Presidente Dutra - MA, ______/ __________/ ${ANO}.`, { size: 22 }),
          ...assinaturaCentral(mil ? mil.toUpperCase() : "________________________"),
        ]),
        esp(),
        secao("(DECISÃO DA AUTORIDADE COMPETENTE PARA APLICAR A PUNIÇÃO DISCIPLINAR)", [
          new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
          pC(`Presidente Dutra - MA, _______/ __________/ ${ANO}.`, { size: 22 }),
          new Paragraph({ text: "" }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "____________________________________", size: 22 })] }),
          pC(comandante || "________________________", { bold: true, size: 22 }),
          pC("Autoridade Competente — CMT DO 18º BPM", { size: 20 }),
        ]),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
