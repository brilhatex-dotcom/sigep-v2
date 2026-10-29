import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import {
  paragrafosCertidaoMedalha, marca, UPM, type DadosCertidaoMedalha,
} from "@/lib/certidaoMedalha";

/* A Certidão para Medalha em Word (.docx): o P/1 confere, assina e sobe ao
   SEI. Layout do ANEXO I (o modelo da 5ª Seção do EMG), com o cabeçalho do
   18º BPM: brasão da PMMA, armas do Maranhão com o texto do órgão no centro
   e o brasão do batalhão; VISTO do Cmt à esquerda; título espaçado e
   sublinhado; corpo em Times 12 justificado. */

const FONTE = "Times New Roman";
const T = 24;             // 12 pt (o docx mede em meios-pontos)
const RECUO = 1418;       // 2,5 cm de recuo na 1ª linha (twips)
const MARGEM = { top: 851, right: 1134, bottom: 851, left: 1418 };
const LARGURA_UTIL = 11906 - MARGEM.left - MARGEM.right;
const px = (mm: number) => Math.round((mm / 25.4) * 96);

function imagem(arquivo: string, larguraMm: number, alturaMm: number): ImageRun | null {
  try {
    const data = fs.readFileSync(path.join(process.cwd(), "public", arquivo));
    return new ImageRun({ type: "png", data, transformation: { width: px(larguraMm), height: px(alturaMm) } });
  } catch {
    return null;
  }
}

const NADA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SEM_BORDA = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };

const texto = (t: string, o: { b?: boolean; tam?: number; sub?: boolean } = {}) =>
  new TextRun({ text: t, bold: o.b, size: o.tam ?? T, font: FONTE, underline: o.sub ? {} : undefined });

const linha = (t: string, o: { b?: boolean; tam?: number; alinhar?: (typeof AlignmentType)[keyof typeof AlignmentType]; depois?: number; antes?: number } = {}) =>
  new Paragraph({
    alignment: o.alinhar ?? AlignmentType.CENTER,
    spacing: { before: o.antes ?? 0, after: o.depois ?? 0 },
    children: [texto(t, { b: o.b, tam: o.tam })],
  });

function cabecalho(): Table {
  const pmma = imagem("brasao-pmma.png", 20, 20);
  const ma = imagem("brasao-estado-ma.png", 20, 16);
  const bpm = imagem("brasao-18bpm.png", 20, 20);
  const centro = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: ma ? [ma] : [] }),
    linha("ESTADO DO MARANHÃO", { tam: 22 }),
    linha("SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA", { tam: 22 }),
    linha("POLÍCIA MILITAR DO MARANHÃO", { tam: 22 }),
    linha("COMANDO DO POLICIAMENTO DE ÁREA I/2", { tam: 22 }),
    linha("18º BATALHÃO DE POLÍCIA MILITAR", { b: true, tam: 22 }),
    linha("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000 / 18batalhaopmma@gmail.com / (99) 98509-5005", { tam: 16 }),
  ];
  const lado = (img: ImageRun | null) => [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: img ? [img] : [] })];
  // larguras em twips (a % não é respeitada pelo LibreOffice): 1.500 + 6.354 + 1.500 = a largura útil
  const L = [1500, LARGURA_UTIL - 3000, 1500];
  const celula = (i: number, filhos: Paragraph[]) => new TableCell({
    width: { size: L[i], type: WidthType.DXA }, borders: SEM_BORDA, verticalAlign: VerticalAlign.TOP, children: filhos,
  });
  return new Table({
    width: { size: LARGURA_UTIL, type: WidthType.DXA },
    columnWidths: L,
    borders: SEM_BORDA,
    rows: [new TableRow({ children: [celula(0, lado(pmma)), celula(1, centro), celula(2, lado(bpm))] })],
  });
}

export async function gerarCertidaoMedalhaDocx(d: DadosCertidaoMedalha): Promise<Buffer> {
  const corpo: (Paragraph | Table)[] = [
    cabecalho(),
    // o traço embaixo do endereço, como no modelo
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }, children: [] }),
    linha("ANEXO I", { tam: 22, depois: 60 }),

    // VISTO do Cmt (assinado à mão ou no SEI)
    linha("V I S T O", { alinhar: AlignmentType.LEFT, antes: 80 }),
    linha("Em ____/____/________", { alinhar: AlignmentType.LEFT }),
    linha("", { antes: 200 }),
    linha("______________________________", { alinhar: AlignmentType.LEFT }),
    linha(`Comandante do ${UPM}`, { alinhar: AlignmentType.LEFT, depois: 200 }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [texto("C E R T I D Ã O", { b: true, sub: true })],
    }),
  ];

  for (const p of paragrafosCertidaoMedalha(d)) {
    if (p.tipo === "item") {
      corpo.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 300, after: 40 },
        children: [texto(`${marca(p.marcado)} `, { b: p.marcado }), texto(p.texto)],
      }));
    } else {
      corpo.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: RECUO },
        spacing: { line: 300, after: 100 },
        children: p.trechos.map((tr) => texto(tr.t, { b: tr.b })),
      }));
    }
  }

  // assinatura de quem digitou (o Chefe do P/1)
  corpo.push(
    linha("", { antes: 480 }),
    linha("______________________________________________"),
    linha((d.chefe || "").toUpperCase(), { b: true }),
    linha(d.chefeFuncao || `Chefe do P/1 do ${UPM}`, { b: true }),
  );

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: MARGEM } },
      children: corpo,
    }],
  });
  return Packer.toBuffer(doc);
}
