import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ExternalHyperlink,
  AlignmentType, WidthType, VerticalAlign,
} from "docx";
import { GRU_TAXA_PCE, competenciaAtual } from "@/lib/gru";

/* =========================================================================
   INSTRUÇÕES PARA O PREENCHIMENTO DA GRU (taxa de aquisição de PCE)

   Mesma folha de instruções que circula no Batalhão — a GRU Simples
   preenchida, com os números em vermelho ligando cada campo à tabela logo
   abaixo —, só que já com o NOME e o CPF de quem vai pagar e a competência
   do mês. Os códigos vêm de lib/gru.ts.
   ========================================================================= */

export type DadosGru = {
  nome?: string | null;
  cpf?: string | null;
};

const VERMELHO = "C00000";
const G = GRU_TAXA_PCE;

function s(v: string | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

function run(text: string, opt: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, bold: opt.bold, italics: opt.italics, size: opt.size ?? 18, color: opt.color, font: "Arial" });
}

// "(3)" em vermelho, como na folha original
function marca(n: number, size = 18) {
  return run(` (${n})`, { color: VERMELHO, size });
}

function par(children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new Paragraph({ alignment: align, children });
}

function celula(
  paragrafos: Paragraph[],
  opt: { w: number; rowSpan?: number; columnSpan?: number; center?: boolean } = { w: 0 },
) {
  return new TableCell({
    children: paragrafos,
    width: { size: opt.w, type: WidthType.PERCENTAGE },
    rowSpan: opt.rowSpan,
    columnSpan: opt.columnSpan,
    verticalAlign: opt.center ? VerticalAlign.CENTER : VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

/* A GRU Simples como sai do site: à esquerda os blocos (cabeçalho, nome do
   contribuinte, unidade favorecida, instruções, rodapé); à direita os
   campos com rótulo e valor. */
function quadroGru(nome: string, cpf: string, competencia: string): Table {
  const esq = 50, rot = 32, val = 18;

  // linhas da direita: [rótulo, marca vermelha, valor]
  const direita: [string, number | null, string][] = [
    ["Código de Recolhimento", 2, G.codigoRecolhimento],
    ["Número de Referência", 3, G.referencia],
    ["Competência", 4, competencia],
    ["Vencimento", null, ""],
    ["CNPJ ou CPF do Contribuinte", null, cpf],
    ["UG / Gestão", 1, `${G.ug} / ${G.gestao}`],
    ["(=) Valor do Principal", 5, G.valor],
    ["(-) Desconto/Abatimento", null, ""],
    ["(-) Outras deduções", null, ""],
    ["(+) Mora / Multa", null, ""],
    ["(+) Juros / Encargos", null, ""],
    ["(+) Outros Acréscimos", null, ""],
    ["(=) Valor Total", 5, G.valor],
  ];

  // blocos da esquerda: começam na linha indicada e ocupam `span` linhas
  const blocos: Record<number, { span: number; conteudo: Paragraph[]; center?: boolean }> = {
    0: {
      span: 4, center: true,
      conteudo: [
        par([run("MINISTÉRIO DA ECONOMIA", { size: 16 })], AlignmentType.CENTER),
        par([run("SECRETARIA DO TESOURO NACIONAL", { size: 16 })], AlignmentType.CENTER),
        par([run("Guia de Recolhimento da União - GRU", { size: 16 })], AlignmentType.CENTER),
      ],
    },
    4: {
      span: 1,
      conteudo: [
        par([run("Nome do Contribuinte / Recolhedor:", { size: 16 })]),
        par([run(nome || " ", { bold: true, size: 18 })]),
      ],
    },
    5: {
      span: 1,
      conteudo: [
        par([run("Nome da Unidade Favorecida:", { size: 16 }), marca(1, 16)]),
        par([run(G.ugNomeGuia, { bold: true, size: 18 })]),
      ],
    },
    6: {
      span: 4, center: true,
      conteudo: [
        par([run(
          "Instruções: As informações inseridas nessa guia são de exclusiva responsabilidade do " +
          "contribuinte, que deverá, em caso de dúvidas, consultar a Unidade Favorecida dos recursos.",
          { size: 16 },
        )]),
      ],
    },
    10: {
      span: 3, center: true,
      conteudo: [
        par([run("GRU SIMPLES", { size: 18 })], AlignmentType.CENTER),
        par([run("Pagamento exclusivo no Banco do Brasil S.A.", { size: 18 })], AlignmentType.CENTER),
      ],
    },
  };

  const linhas = direita.map(([rotulo, n, valor], i) => {
    const celulas: TableCell[] = [];
    const bloco = blocos[i];
    if (bloco) celulas.push(celula(bloco.conteudo, { w: esq, rowSpan: bloco.span, center: bloco.center }));
    celulas.push(celula([par([run(rotulo, { size: 16 }), ...(n ? [marca(n, 16)] : [])])], { w: rot }));
    celulas.push(celula([par([run(valor || " ", { bold: true, size: 18 })], AlignmentType.RIGHT)], { w: val }));
    return new TableRow({ children: celulas });
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: linhas });
}

// "(1) Unid. Gestora Arrecadadora | Fundo do exército | 167086"
function tabelaCampos(competencia: string): Table {
  const larg = [10, 34, 38, 18];
  const cab = ["Ord.", "Campo", "Nome", "Código"];
  const linhas: [number, string, string, string][] = [
    [1, "Unid. Gestora Arrecadadora", G.ugNome, G.ug],
    [2, "Código de Recolhimento", G.codigoNome, G.codigoRecolhimento],
    [3, "Número de Referência", G.referenciaNome, G.referencia],
    [4, "Competência", `Mês / Ano (${competencia})`, ""],
    [5, "Valor correspondente (R$)", G.valor, ""],
  ];
  const c = (text: string, w: number, opt: { bold?: boolean; color?: string; center?: boolean } = {}) =>
    celula([par([run(text || " ", { bold: opt.bold, color: opt.color, size: 22 })],
      opt.center ? AlignmentType.CENTER : AlignmentType.LEFT)], { w });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: cab.map((t, i) => c(t, larg[i], { center: true })) }),
      ...linhas.map(([n, campo, nome, codigo]) => new TableRow({
        children: [
          c(`(${n})`, larg[0], { color: VERMELHO, center: true }),
          c(campo, larg[1]),
          c(nome, larg[2], { center: true }),
          c(codigo, larg[3], { center: true }),
        ],
      })),
    ],
  });
}

export async function gerarGruDocx(d: DadosGru): Promise<Buffer> {
  const nome = s(d.nome).toUpperCase();
  const cpf = s(d.cpf);
  const competencia = competenciaAtual();
  const espaco = () => new Paragraph({ text: "" });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
      children: [
        par([run("INSTRUÇÕES PARA O PREENCHIMENTO GUIA DE RECOLHIMENTO DA UNIÃO - GRU", { bold: true, size: 24 })], AlignmentType.CENTER),
        espaco(),
        par([run("GRU Simples preenchida", { bold: true, size: 22 })], AlignmentType.CENTER),
        espaco(),
        quadroGru(nome, cpf, competencia),
        espaco(),
        par([run(`${nome || "O requerente"} está pagando:`, { size: 22 })]),
        espaco(),
        tabelaCampos(competencia),
        espaco(),
        espaco(),
        par([run("Pagamento exclusivo Banco do Brasil", { size: 22 })]),
        espaco(),
        par([run("O preenchimento será no site da Secretaria do Tesouro Nacional", { size: 22 })]),
        new Paragraph({
          children: [new ExternalHyperlink({
            link: G.site,
            children: [new TextRun({ text: G.site, style: "Hyperlink", size: 22, font: "Arial" })],
          })],
        }),
        espaco(),
        par([run(
          "Depois de pagar, anexe ao requerimento a cópia da GRU e do comprovante de pagamento " +
          "da taxa de aquisição de PCE.",
          { size: 20, italics: true },
        )]),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
