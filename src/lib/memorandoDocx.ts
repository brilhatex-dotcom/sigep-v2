import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, UnderlineType, VerticalAlign,
} from "docx";

/* =========================================================================
   Gerador do Memorando de Ferias (.docx) — monta o documento programaticamente
   (sem template), reaproveitando as mesmas imagens (brasoes/assinaturas) que
   ja existem em public/ e usadas na versao PDF/impressao.

   Os campos de texto (de, ao, assunto, inicioExtenso, etc.) chegam como HTML
   simples (apenas <strong>/<b>, <em>/<i>, <u>), exatamente o que o editor
   contentEditable do MemorandoFerias.tsx produz. htmlParaRuns() converte esse
   HTML em TextRun[] do docx, preservando negrito/italico/sublinhado.
   ========================================================================= */

export type MemorandoDocxInput = {
  numero: string;
  ano: string;
  cidadeData: string;
  de: string;
  ao: string;
  assunto: string;
  inicioExtenso: string;
  dias: string;
  exercicio: string;
  apresExtenso: string;
  observacao: string;
  assinaturaAo: string;
  nomeCmt: string;
  cargoCmt: string;
};

function mmToTwip(mm: number): number {
  return Math.round(mm * 56.6929133858);
}
function pxFromMm(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

function decodeEntities(s: string): string {
  return (s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textoSemTags(html: string): string {
  return decodeEntities((html || "").replace(/<[^>]*>/g, "")).trim();
}

type Marca = { bold?: boolean; italics?: boolean; underline?: boolean };

// Converte HTML simples (apenas <strong>/<b>, <em>/<i>, <u>, texto) em uma
// lista de TextRun do docx, preservando negrito/italico/sublinhado, incluindo
// combinacoes aninhadas (ex.: <strong><u>texto</u></strong>).
function htmlParaRuns(html: string, extra: Partial<{ size: number }> = {}): TextRun[] {
  const runs: TextRun[] = [];
  const tagRe = /<\/?(strong|b|em|i|u)>/gi;
  const pilha: Marca[] = [{}];
  let ultimo = 0;
  let m: RegExpExecArray | null;

  function atual(): Marca {
    return pilha[pilha.length - 1];
  }
  function pushTexto(txt: string) {
    const texto = decodeEntities(txt);
    if (!texto) return;
    const marca = atual();
    runs.push(
      new TextRun({
        text: texto,
        bold: marca.bold,
        italics: marca.italics,
        underline: marca.underline ? { type: UnderlineType.SINGLE } : undefined,
        ...extra,
      })
    );
  }

  while ((m = tagRe.exec(html))) {
    pushTexto(html.slice(ultimo, m.index));
    const nome = m[1].toLowerCase();
    const fechando = m[0].startsWith("</");
    if (!fechando) {
      const nova: Marca = { ...atual() };
      if (nome === "strong" || nome === "b") nova.bold = true;
      if (nome === "em" || nome === "i") nova.italics = true;
      if (nome === "u") nova.underline = true;
      pilha.push(nova);
    } else if (pilha.length > 1) {
      pilha.pop();
    }
    ultimo = tagRe.lastIndex;
  }
  pushTexto(html.slice(ultimo));
  return runs.length > 0 ? runs : [new TextRun({ text: "", ...extra })];
}

// Le uma imagem de public/<nome>. Se nao existir, devolve null (o documento
// simplesmente segue sem aquela imagem, igual ao onError da versao web).
function imagemOuNull(nomeArquivo: string, larguraMm: number, alturaMm: number): ImageRun | null {
  try {
    const caminho = path.join(process.cwd(), "public", nomeArquivo);
    const dados = fs.readFileSync(caminho);
    return new ImageRun({
      type: "png",
      data: dados,
      transformation: { width: pxFromMm(larguraMm), height: pxFromMm(alturaMm) },
    }) as unknown as ImageRun;
  } catch {
    return null;
  }
}

const SEM_BORDA = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

export async function gerarMemorandoDocx(d: MemorandoDocxInput): Promise<Buffer> {
  const temObs = textoSemTags(d.observacao) !== "";

  // ---- cabecalho: tabela de 3 colunas sem borda ----
  const brasaoPmma = imagemOuNull("brasao-pmma.png", 22, 22);
  const assinaturaCmt = imagemOuNull("assinatura-cmt.png", 34, 15);
  const brasaoEstado = imagemOuNull("brasao-estado-ma.png", 22, 17);
  const brasao18bpm = imagemOuNull("brasao-18bpm.png", 22, 22);
  const assinaturaJoelson = imagemOuNull("assinatura-joelson.png", 30, 16);

  const colEsquerda: Paragraph[] = [
    new Paragraph({ children: brasaoPmma ? [brasaoPmma] : [], alignment: AlignmentType.LEFT, spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: "VISTO", bold: true })], spacing: { after: 100 } }),
    new Paragraph({ children: assinaturaCmt ? [assinaturaCmt] : [], alignment: AlignmentType.LEFT, spacing: { after: 40 } }),
    new Paragraph({ children: [new TextRun("Cmt. do 18º BPM")] }),
  ];

  const colCentral: Paragraph[] = [
    new Paragraph({ children: brasaoEstado ? [brasaoEstado] : [], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ESTADO DO MARANHÃO", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POLÍCIA MILITAR DO MARANHÃO", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "COMANDO DO POLICIAMENTO DE ÁREA I/2", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "18º BATALHÃO DE POLICIA MILITAR", bold: true })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60 },
      children: [new TextRun({ text: "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000", size: 20 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "TELEFAX: (99) 98509-5005 (Permanência) – ", bold: true, size: 20 }),
        new TextRun({ text: "18batalhaopmma@gmail.com", bold: true, size: 20, underline: { type: UnderlineType.SINGLE } }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: htmlParaRuns(d.cidadeData),
    }),
  ];

  const colDireita: Paragraph[] = [
    new Paragraph({ children: brasao18bpm ? [brasao18bpm] : [], alignment: AlignmentType.CENTER }),
  ];

  const tabelaCabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDA,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: SEM_BORDA, children: colEsquerda }),
          new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: SEM_BORDA, children: colCentral }),
          new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: SEM_BORDA, children: colDireita }),
        ],
      }),
    ],
  });

  // ---- numero do memorando ----
  const paragrafoNumero = new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [new TextRun(`Memorando nº ${d.numero}/${d.ano} – 18º BPM`)],
  });

  // ---- Do / Ao / Assunto: tabela SEM borda, indentada ----
  function linhaRotulo(rotulo: string, valorHtml: string): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          borders: SEM_BORDA,
          verticalAlign: VerticalAlign.TOP,
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: rotulo, bold: true })] })],
        }),
        new TableCell({
          borders: SEM_BORDA,
          verticalAlign: VerticalAlign.TOP,
          width: { size: 85, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: htmlParaRuns(valorHtml) })],
        }),
      ],
    });
  }

  const tabelaDoAoAssunto = new Table({
    indent: { size: mmToTwip(60), type: WidthType.DXA },
    width: { size: 60, type: WidthType.PERCENTAGE },
    borders: SEM_BORDA,
    rows: [
      linhaRotulo("Do:", d.de),
      linhaRotulo("Ao:", d.ao),
      linhaRotulo("Assunto:", d.assunto),
    ],
  });

  // ---- corpo ----
  const runsCorpo: TextRun[] = [
    new TextRun("Informo a Vossa Senhoria, para conhecimento que a partir do dia "),
    ...htmlParaRuns(d.inicioExtenso),
    new TextRun(", encontra-se de Férias Regulamentares ("),
    ...htmlParaRuns(d.dias),
    new TextRun(" dias) referente ao exercício de "),
    ...htmlParaRuns(d.exercicio),
    new TextRun(", devendo apresentar-se pronto para o serviço Policial Militar, no dia "),
    ...htmlParaRuns(d.apresExtenso),
    new TextRun("."),
  ];

  const paragrafoCorpo = new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: mmToTwip(15) },
    spacing: { after: temObs ? mmToTwip(4) : mmToTwip(22) },
    children: runsCorpo,
  });

  const blocosDepoisDoCorpo: Paragraph[] = [];

  if (temObs) {
    blocosDepoisDoCorpo.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: mmToTwip(15) },
        spacing: { after: mmToTwip(20) },
        children: htmlParaRuns(d.observacao),
      })
    );
  }

  // ---- assinatura do destinatario ----
  blocosDepoisDoCorpo.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: mmToTwip(22) },
      children: htmlParaRuns(d.assinaturaAo),
    })
  );

  // ---- assinatura do emissor (rubrica + nome + cargo) ----
  blocosDepoisDoCorpo.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: assinaturaJoelson ? [assinaturaJoelson] : [], spacing: { after: 40 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: htmlParaRuns(d.nomeCmt) }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: htmlParaRuns(d.cargoCmt) })
  );

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 24 } }, // 12pt
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwip(210), height: mmToTwip(297) },
            margin: {
              top: mmToTwip(10),
              bottom: mmToTwip(12),
              left: mmToTwip(20),
              right: mmToTwip(20),
            },
          },
        },
        children: [
          tabelaCabecalho,
          paragrafoNumero,
          tabelaDoAoAssunto,
          new Paragraph({ text: "" }),
          paragrafoCorpo,
          ...blocosDepoisDoCorpo,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
