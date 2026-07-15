import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";

/* Gera o FATD (Formulário de Apuração de Transgressão Disciplinar) em .docx,
   mesmo modelo da tela: cabeçalho oficial + seções I a V, preenchido pelo
   registro do mapa de controle. Espaços não preenchidos saem como linha. */

export type FatdReg = {
  numero: string; encarregado: string; portaria: string; dataInstauracao: string;
  envolvido: string; objeto: string; prazo: string;
};

const ANO = new Date().getFullYear();
function pxFromMm(mm: number): number { return Math.round((mm / 25.4) * 96); }
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "____/____/______";
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

function pCenter(text: string, opt: { bold?: boolean; size?: number } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 22 })] });
}
function p(children: (TextRun | string)[], opt: { after?: number } = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: opt.after ?? 60 },
    children: children.map((c) => (typeof c === "string" ? new TextRun({ text: c, size: 22 }) : c)),
  });
}
function b(text: string) { return new TextRun({ text, bold: true, size: 22 }); }
function t(text: string) { return new TextRun({ text, size: 22 }); }
function secao(titulo: string) {
  return new Paragraph({
    spacing: { before: 200, after: 100 }, shading: { fill: "E9EDF3" } as any,
    children: [new TextRun({ text: titulo, bold: true, size: 22 })],
  });
}
function linha() { return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "_".repeat(95), size: 22 })] }); }
const BR = "____________________";

export async function gerarFatdDocx(reg: FatdReg): Promise<Buffer> {
  const imgPmma = imagem("brasoes/pmma-190.jpg", 26, 22);
  const imgMa = imagem("brasoes/armas-ma.png", 16, 16);
  const imgBpm = imagem("brasoes/brasao-18bpm.png", 22, 22);

  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2",
    "18º BATALHÃO DE POLÍCIA MILITAR",
  ].map((x) => pCenter(x, { bold: true, size: 22 }));

  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgPmma ? [imgPmma] : [] })] }),
      new TableCell({ width: { size: 52, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }), ...org] }),
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgBpm ? [imgBpm] : [] })] }),
    ] })],
  });

  const numero = (reg.numero || "").trim() || `______/${ANO}`;

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 700, bottom: 700, left: 1000, right: 1000 } } },
      children: [
        cabecalho,
        new Paragraph({ text: "" }),
        pCenter("FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR — FATD", { bold: true, size: 24 }),
        pCenter(`Nº ${numero}`, { bold: true, size: 22 }),

        secao("I — IDENTIFICAÇÃO DO(A) ACUSADO(A)"),
        p([b("Posto/Graduação e Nome: "), t(reg.envolvido?.trim() || BR)]),
        p([b("Matrícula: "), t(BR), t("     "), b("Lotação/OPM: "), t("18º BPM"), t("     "), b("Comportamento: "), t(BR)]),

        secao("II — DA TRANSGRESSÃO APURADA"),
        p([b("Descrição do fato (data, hora e local): "), t(reg.objeto?.trim() || "")]),
        ...(reg.objeto?.trim() ? [] : [linha(), linha()]),
        p([b("Enquadramento: "), t("transgressão prevista no art. ______, inciso ______ do RDPM (Dec. Estadual nº ______).")]),
        p([b("Natureza: "), t("[  ] Leve     [  ] Média     [  ] Grave")]),
        p([b("Testemunhas: "), t(BR + BR)]),

        secao("III — DA INSTAURAÇÃO"),
        p([b("Portaria: "), t(reg.portaria?.trim() || BR), t("     "), b("Instaurado em: "), t(dBR(reg.dataInstauracao)), t("     "), b("Prazo: "), t(reg.prazo?.trim() ? dBR(reg.prazo) : BR)]),
        p([b("Encarregado / Autoridade instauradora: "), t(reg.encarregado?.trim() || BR)]),

        secao("IV — DA NOTIFICAÇÃO E DEFESA (a preencher pelo acusado)"),
        p([t("Declaro ciência da presente acusação em "), t(BR), t(", dispondo do prazo regulamentar para apresentar minhas razões de defesa e indicar testemunhas.")]),
        p([b("Razões de defesa:")]),
        linha(), linha(), linha(),
        new Paragraph({ text: "" }),
        pCenter("__________________________________________", { size: 22 }),
        pCenter("Assinatura do(a) acusado(a)", { size: 22 }),

        secao("V — DA DECISÃO DA AUTORIDADE COMPETENTE"),
        p([b("Do mérito: "), t("[  ] Transgressão procedente     [  ] Improcedente")]),
        p([b("Circunstâncias: "), t("atenuantes " + BR + "  /  agravantes " + BR)]),
        p([b("Punição aplicada:")]),
        p([t("[  ] Advertência     [  ] Repreensão     [  ] Detenção de ______ dias     [  ] Prisão de ______ dias")]),
        p([t("[  ] Licenciamento a bem da disciplina     [  ] Exclusão a bem da disciplina")]),
        p([b("Fundamentação: "), t("art. ______ do RDPM. Comportamento reclassificado para " + BR + ".")]),
        new Paragraph({ text: "" }),
        pCenter(`São Luís/MA, ______ de ____________________ de ${ANO}.`, { size: 22 }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        pCenter("__________________________________________", { size: 22 }),
        pCenter("Autoridade competente", { bold: true, size: 22 }),
        pCenter("Comandante do 18º BPM", { size: 22 }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
