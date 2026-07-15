import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";

/* Termos do procedimento apuratório em .docx: autuacao / declaracoes / relatorio.
   Mesmo cabeçalho e conteúdo da tela, preenchidos pelo registro. */

export type TermoModelo = "autuacao" | "declaracoes" | "relatorio";
export type TermoReg = {
  tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
};

const NOME_PROC: Record<string, string> = {
  sindicancia: "Sindicância", ips: "Investigação Preliminar Sumária (IPS)", ipm: "Inquérito Policial Militar (IPM)",
};
export const TERMO_LABEL: Record<TermoModelo, string> = {
  autuacao: "Termo de Autuação", declaracoes: "Termo de Declarações", relatorio: "Relatório Final",
};

const ANO = new Date().getFullYear();
function pxFromMm(mm: number): number { return Math.round((mm / 25.4) * 96); }
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
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
function pCenter(text: string, opt: { bold?: boolean; size?: number; underline?: boolean } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 24, underline: opt.underline ? {} : undefined })] });
}
function b(text: string) { return new TextRun({ text, bold: true, size: 24 }); }
function t(text: string) { return new TextRun({ text, size: 24 }); }
function just(children: TextRun[], indent = false) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, indent: indent ? { firstLine: 700 } : undefined, children });
}
function sub(text: string) { return new Paragraph({ spacing: { before: 120, after: 60 }, children: [b(text)] }); }
function linha() { return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "_".repeat(95), size: 24 })] }); }
function linhas(n: number) { return Array.from({ length: n }).map(() => linha()); }
function assinatura(papel: string, nome?: string) {
  const out = [new Paragraph({ text: "" }), new Paragraph({ text: "" }), pCenter("__________________________________________", { size: 24 })];
  if (nome && nome.trim()) out.push(pCenter(nome, { bold: true, size: 24 }));
  out.push(pCenter(papel, { size: 24 }));
  return out;
}
const BR = "____________________";

export async function gerarTermoDocx(reg: TermoReg, modelo: TermoModelo): Promise<Buffer> {
  const proc = NOME_PROC[reg.tipo] || "procedimento apuratório";
  const numRef = (reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || (reg.numero || "").trim() || `______/${ANO}`;
  const dataExt = `Aos ______ dias do mês de ____________________ do ano de ${ANO}, nesta cidade de São Luís, Estado do Maranhão, na sede do 18º Batalhão de Polícia Militar,`;

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

  const epigrafe = pCenter(`${proc} · Portaria nº ${numRef}${reg.objeto?.trim() ? ` — apuração de: ${reg.objeto}` : ""}`, { size: 18 });

  let corpo: Paragraph[] = [];
  if (modelo === "autuacao") {
    corpo = [
      pCenter("TERMO DE AUTUAÇÃO", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t(dataExt + " eu, "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(", Encarregado(a) designado(a) pela Portaria nº "), b(numRef),
        t(", AUTUO a referida Portaria e os documentos que a acompanham, dando início aos autos do presente procedimento. Do que, para constar, lavrei o presente termo, que vai por mim assinado."),
      ], true),
      ...assinatura("Encarregado(a) do procedimento"),
    ];
  } else if (modelo === "declaracoes") {
    corpo = [
      pCenter("TERMO DE DECLARAÇÕES", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t(dataExt + " perante mim, "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(", Encarregado(a) do procedimento em epígrafe, presente o(a) declarante abaixo qualificado(a), que aos costumes disse nada e, inquirido(a) sobre os fatos objeto de apuração, RESPONDEU:"),
      ], true),
      sub("Qualificação:"),
      new Paragraph({ spacing: { after: 40 }, children: [t("Nome: " + BR + BR + "  Posto/Grad: " + BR)] }),
      new Paragraph({ spacing: { after: 40 }, children: [t("Matrícula: " + BR + "  Lotação: " + BR + BR)] }),
      new Paragraph({ spacing: { after: 120 }, children: [t("Condição: [  ] Testemunha   [  ] Declarante   [  ] Acusado(a)   [  ] Vítima")] }),
      sub("ÀS PERGUNTAS RESPONDEU QUE:"),
      ...linhas(12),
      just([t("Nada mais havendo, encerra-se o presente termo que, lido e achado conforme, vai devidamente assinado.")]),
      ...assinatura("Declarante"),
      ...assinatura("Encarregado(a)"),
    ];
  } else {
    corpo = [
      pCenter("RELATÓRIO FINAL", { bold: true, size: 26, underline: true }),
      new Paragraph({ spacing: { after: 120 }, children: [t("Senhor Comandante,")] }),
      just([
        t("Em cumprimento à Portaria nº "), b(numRef), t(", que instaurou " + proc),
        ...(reg.dataInstauracao?.trim() ? [t(" em "), b(dBR(reg.dataInstauracao))] : []),
        t(" para apurar "), (reg.objeto?.trim() ? b(reg.objeto) : t(BR + BR)),
        t(", venho, na condição de Encarregado(a), apresentar o relatório dos trabalhos realizados."),
      ], true),
      sub("I — DOS FATOS"), ...linhas(4),
      sub("II — DAS DILIGÊNCIAS REALIZADAS"), ...linhas(4),
      sub("III — DA ANÁLISE"), ...linhas(4),
      sub("IV — DA CONCLUSÃO"), ...linhas(3),
      just([t("É o relatório, que submeto à apreciação e deliberação de Vossa Senhoria.")]),
      new Paragraph({ text: "" }),
      pCenter(`São Luís/MA, ______ de ____________________ de ${ANO}.`, { size: 24 }),
      ...assinatura("Encarregado(a) do procedimento", reg.encarregado?.trim() || undefined),
    ];
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 1130, right: 1130 } } },
      children: [cabecalho, epigrafe, new Paragraph({ text: "" }), ...corpo],
    }],
  });

  return Packer.toBuffer(doc);
}
