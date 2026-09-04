import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import { assinanteFatd, type DadosPessoa } from "@/lib/refMilitar";

/* Gera o FATD (.docx) no modelo oficial do 18º BPM (FATD nº 006/26): uma
   tabela de 1 coluna por página, brasão do Estado sozinho no alto, títulos de
   seção centralizados em negrito SEM faixa cinza, relato em itálico e, na 2ª
   página, as linhas em branco para escrever à mão (13 na justificativa, 12 na
   decisão). Mesmas medidas da tela (FatdDoc.tsx). */

export type FatdReg = {
  numero: string; encarregado: string; portaria: string; dataInstauracao: string;
  envolvido: string; objeto: string; prazo: string;
};

const ANO = new Date().getFullYear();
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// 1mm = 56,7 twips; o Word mede imagem em px (96dpi) e fonte em meios-pontos.
const mm = (v: number) => Math.round(v * 56.7);
const px = (v: number) => Math.round((v / 25.4) * 96);

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
    return new ImageRun({ type: kind, data: dados, transformation: { width: px(wMm), height: px(hMm) } } as any);
  } catch { return null; }
}

const NADA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const FIO = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const MOLDURA = { top: FIO, bottom: FIO, left: FIO, right: FIO, insideHorizontal: FIO, insideVertical: FIO };
const SEM_BORDA = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };

function run(text: string, o: { b?: boolean; i?: boolean; size?: number } = {}) {
  return new TextRun({ text, bold: o.b, italics: o.i, size: Math.round((o.size ?? 12) * 2), font: "Times New Roman" });
}
function par(filhos: TextRun[], o: { centro?: boolean; justificado?: boolean; antes?: number; depois?: number; recuo?: number; entre?: number } = {}) {
  return new Paragraph({
    alignment: o.justificado ? AlignmentType.JUSTIFIED : o.centro ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: o.antes, after: o.depois, line: o.entre ?? 260 },
    indent: { firstLine: o.recuo },
    children: filhos,
  });
}
const linha = (t: string, o: Parameters<typeof par>[1] & { b?: boolean; i?: boolean; size?: number } = {}) =>
  par([run(t, o)], o);
const vazio = (depois = 0) => new Paragraph({ spacing: { after: depois }, children: [run(" ")] });
const tituloSecao = (t: string) => linha(t, { centro: true, b: true });

/* Uma faixa do formulário: linha da tabela de 1 coluna.

   `meio` centraliza o texto na altura da faixa — é o que o modelo faz nos
   títulos altos da 2ª página. Nas demais o conteúdo começa no topo; com tudo
   centralizado, o RELATO DO FATO descia para o meio do quadro e abria um
   buraco embaixo do participante. */
function faixa(filhos: (Paragraph | Table)[], o: { alturaMm?: number; meio?: boolean } = {}): TableRow {
  return new TableRow({
    height: o.alturaMm ? { value: mm(o.alturaMm), rule: "atLeast" as any } : undefined,
    children: [new TableCell({
      borders: MOLDURA,
      margins: { top: 40, bottom: 40, left: mm(3), right: mm(3) },
      verticalAlign: o.meio ? VerticalAlign.CENTER : VerticalAlign.TOP,
      children: filhos,
    })],
  });
}
/* Linha em branco para escrever à mão (5mm, como no modelo). */
function regua(n: number): TableRow[] {
  return Array.from({ length: n }).map(() => new TableRow({
    height: { value: mm(5), rule: "atLeast" as any },
    children: [new TableCell({ borders: MOLDURA, margins: { left: mm(3), right: mm(3) }, children: [new Paragraph({ children: [] })] })],
  }));
}
/* Régua de assinatura: 153mm no militar/participante, 77mm na autoridade. */
function rubrica(nome: string, cargo?: string, larguraMm = 153): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Table({
    width: { size: mm(larguraMm), type: WidthType.DXA },
    alignment: AlignmentType.CENTER,
    borders: { ...SEM_BORDA, top: FIO },
    rows: [new TableRow({ children: [new TableCell({
      borders: { ...SEM_BORDA, top: FIO },
      children: [linha(nome || "________________________", { centro: true })],
    })] })],
  })];
  if (cargo) out.push(linha(cargo, { centro: true }));
  return out;
}

export async function gerarFatdDocx(
  reg: FatdReg,
  chefes: { chefeP1?: string; comandante?: string } = {},
  pessoas: { mil?: DadosPessoa | null; enc?: DadosPessoa | null } = {},
): Promise<Buffer> {
  const numero = (reg.numero || "").trim() || `______/${ANO}`;
  const enc = (reg.encarregado || "").trim() || (chefes.chefeP1 || "").trim();
  const mil = (reg.envolvido || "").trim();
  const milD = pessoas.mil, encD = pessoas.enc;
  const assMil = assinanteFatd(milD, mil);
  const assEnc = assinanteFatd(encD, enc);
  const BR = "____________________";

  // Brasão do Estado do Maranhão, sozinho no alto — é o único do modelo.
  const imgMa = imagem("brasao-estado-ma.png", 14, 13);
  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA I/2",
    "18º BATALHÃO DE POLÍCIA MILITAR",
  ].map((x) => linha(x, { centro: true, entre: 240 }));

  const identificacao = (titulo: string, d: DadosPessoa | null | undefined, livre: string): Paragraph[] => [
    tituloSecao(titulo),
    par([
      run("Grau Hierárquico: ", { b: true }), run(d?.grau || BR, { i: !!d?.grau }),
      run("        "), run("Nº Identidade: ", { b: true }), run(`${d?.rg || BR} – PMMA.`),
    ]),
    par([run("Nome Completo: ", { b: true }), run(d?.nome || livre || BR)]),
    par([run("Unidade: ", { b: true }), run("18º Batalhão de Polícia Militar", { i: true })]),
  ];

  // Relato: no modelo sai em itálico, justificado, com recuo e entrelinha larga.
  const relato = par(
    [run(`Deveis justificar o motivo pelo qual, na data de ${reg.objeto?.trim() ? reg.objeto.trim().replace(/\.*$/, "") : `${BR}, ${BR}${BR}`}.`, { i: true })],
    { justificado: true, recuo: mm(10), entre: 360 },
  );

  const pagina1 = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: MOLDURA,
    rows: [
      faixa([
        new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }),
        ...org,
        linha("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000", { centro: true, size: 9, entre: 200 }),
        linha("TELEFAX: (99) 3663-3892 – 18batalhaopmma@gmail.com", { centro: true, size: 9, b: true, entre: 200 }),
        linha("FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR", { centro: true, b: true, antes: 120 }),
      ]),
      // PROCESSO à esquerda e DATA à direita, na mesma linha (tabulação à direita).
      faixa([new Paragraph({
        tabStops: [{ type: "right" as any, position: mm(180) }],
        children: [run(`PROCESSO Nº ${numero} – 18º BPM`, { b: true }), run("\t"), run(`DATA: ${dBR(reg.dataInstauracao)}`, { b: true })],
      })]),
      faixa(identificacao("IDENTIFICAÇÃO DO MILITAR", milD, mil)),
      faixa(identificacao("IDENTIFICAÇÃO DO PARTICIPANTE", encD, enc)),
      // Relato e ciente ficam no MESMO quadro — o modelo não separa os dois.
      faixa([
        tituloSecao("RELATO DO FATO"),
        relato,
        linha(`Presidente Dutra - MA, ${dataExtenso(reg.dataInstauracao)}.`, { centro: true, antes: 300 }),
        vazio(mm(12)),
        ...rubrica(assEnc, "CHEFE P/1 18º BPM"),
        vazio(mm(3)),
        tituloSecao("CIENTE DO MILITAR ARROLADO"),
        linha(
          "Declaro que tenho conhecimento de que me está sendo imputada à autoria dos atos acima e me foi " +
          "concedido o prazo de três dias úteis, para, querendo, apresentar, por escrito, as minhas " +
          "justificativas ou razões de defesa.",
          { justificado: true, recuo: mm(10) },
        ),
        linha(`Presidente Dutra- MA, ____ /_________/ ${ANO}.`, { centro: true, antes: 260 }),
        vazio(mm(16)),
        ...rubrica(assMil),
      ], { alturaMm: 150 }),
    ],
  });

  const pagina2 = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: MOLDURA,
    rows: [
      faixa([tituloSecao("JUSTIFICATIVAS / RAZÕES DE DEFESA")], { alturaMm: 15, meio: true }),
      ...regua(13),
      faixa([
        linha(`Presidente Dutra- MA, ______/ __________/ ${ANO}.`, { centro: true }),
        vazio(mm(12)),
        ...rubrica(assMil),
      ], { alturaMm: 44 }),
      faixa([tituloSecao("(DECISÃO DA AUTORIDADE COMPETENTE PARA APLICAR A PUNIÇÃO DISCIPLINAR)")], { alturaMm: 20, meio: true }),
      ...regua(12),
      // No modelo esta linha não leva o nome do Comandante: fica só
      // "Autoridade Competente", para quem assinar preencher.
      faixa([
        linha(`Presidente Dutra-MA, _______/ __________/ ${ANO}.`, { centro: true }),
        vazio(mm(10)),
        ...rubrica("Autoridade Competente", undefined, 77),
      ], { alturaMm: 34 }),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: mm(12), bottom: mm(12), left: mm(12), right: mm(12) } } },
      children: [
        pagina1,
        new Paragraph({ pageBreakBefore: true, children: [] }),
        pagina2,
        new Paragraph({ children: [] }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
