import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";

/* Gera a PORTARIA DE INSTAURAÇÃO (Sindicância / IPS / IPM) em .docx, mesmo
   modelo da tela: cabeçalho oficial + preâmbulo + artigos, preenchido pelo
   registro do mapa de controle. */

export type PortariaReg = {
  tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
};

const INFO: Record<string, { titulo: string; instaurar: string; enc: string; base: string; prazoPadrao: string }> = {
  sindicancia: { titulo: "SINDICÂNCIA", instaurar: "Sindicância", enc: "Encarregado(a) da Sindicância", base: "no Regulamento Disciplinar da PMMA e na Lei de Organização Básica da Corporação", prazoPadrao: "30 (trinta)" },
  ips: { titulo: "INVESTIGAÇÃO PRELIMINAR SUMÁRIA — IPS", instaurar: "Investigação Preliminar Sumária (IPS)", enc: "Encarregado(a) da IPS", base: "nas normas administrativas disciplinares em vigor na Corporação", prazoPadrao: "15 (quinze)" },
  ipm: { titulo: "INQUÉRITO POLICIAL MILITAR — IPM", instaurar: "Inquérito Policial Militar (IPM)", enc: "Encarregado(a) do IPM", base: "no Código de Processo Penal Militar (art. 9º e seguintes)", prazoPadrao: "40 (quarenta)" },
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
function pCenter(text: string, opt: { bold?: boolean; size?: number } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 24 })] });
}
function b(text: string) { return new TextRun({ text, bold: true, size: 24 }); }
function t(text: string) { return new TextRun({ text, size: 24 }); }
function art(children: TextRun[]) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children });
}
const BR = "____________________";

export async function gerarPortariaDocx(reg: PortariaReg, chefes: { comandante?: string } = {}): Promise<Buffer> {
  const comandante = (chefes.comandante || "").trim();
  const info = INFO[reg.tipo] || INFO.sindicancia;
  const numPortaria = (reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || (reg.numero || "").trim() || `______/${ANO}`;

  const imgPmma = imagem("brasoes/pmma-190.jpg", 26, 22);
  const imgMa = imagem("brasoes/armas-ma.png", 16, 16);
  const imgBpm = imagem("brasoes/brasao-18bpm.png", 22, 22);
  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA I/2",
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

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 1130, right: 1130 } } },
      children: [
        cabecalho,
        pCenter("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000", { size: 16 }),
        pCenter("TELEFAX: (99) 98497-1918 (Permanência) — 18batalhaopmma@gmail.com", { size: 16 }),
        new Paragraph({ text: "" }),
        pCenter(`PORTARIA Nº ${numPortaria}`, { bold: true, size: 26 }),
        pCenter(`Instauração de ${info.titulo}`, { bold: true, size: 22 }),
        new Paragraph({ text: "" }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 700 }, spacing: { after: 200 },
          children: [
            t("O "), b("Comandante do 18º Batalhão de Polícia Militar"),
            t(", no uso das atribuições legais que lhe são conferidas e com fundamento "), t(info.base),
            t(", e "), b("considerando"), t(" os fatos que ensejam apuração no âmbito desta Unidade,"),
          ],
        }),
        new Paragraph({ spacing: { after: 160 }, children: [b("RESOLVE:")] }),
        art([b("Art. 1º"), t(" — Instaurar "), b(info.instaurar), t(" destinada a apurar "), t(reg.objeto?.trim() || BR + BR),
          ...(reg.envolvido?.trim() ? [t(", tendo como envolvido(a) "), b(reg.envolvido)] : []), t(".")]),
        art([b("Art. 2º"), t(" — Designar "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR + BR)),
          t(" para, na condição de "), b(info.enc), t(", presidir e conduzir os respectivos trabalhos, ficando autorizado a praticar todos os atos necessários à elucidação dos fatos.")]),
        art([b("Art. 3º"), t(" — Fixar o prazo de "), b(info.prazoPadrao), t(" dias para a conclusão dos trabalhos, a contar do recebimento desta Portaria, admitida prorrogação na forma regulamentar"),
          ...(reg.prazo?.trim() ? [t(" (previsão de conclusão em "), b(dBR(reg.prazo)), t(")")] : []), t(".")]),
        art([b("Art. 4º"), t(" — Esta Portaria entra em vigor na data de sua publicação.")]),
        new Paragraph({ spacing: { after: 300 }, children: [t("Publique-se, registre-se e cumpra-se.")] }),
        pCenter(reg.dataInstauracao?.trim() ? `Presidente Dutra-MA, ${dBR(reg.dataInstauracao)}.` : `Presidente Dutra-MA, ______ de ____________________ de ${ANO}.`, { size: 24 }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        pCenter("__________________________________________", { size: 24 }),
        pCenter(comandante || "Autoridade instauradora", { bold: true, size: 24 }),
        pCenter("Comandante do 18º BPM", { size: 24 }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
