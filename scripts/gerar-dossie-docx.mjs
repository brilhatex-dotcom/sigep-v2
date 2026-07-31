/* =========================================================================
   Gera o DOSSIE-COMANDO em Word (.docx) com o TIMBRE oficial do 18º BPM —
   o mesmo cabeçalho da escala de serviço: brasão da PMMA à esquerda, armas
   do Estado do Maranhão ao centro com o texto do órgão, e o brasão do 18º
   BPM à direita. O timbre se repete em todas as páginas.

   Fonte do conteúdo: DOSSIE-COMANDO.md — assim o Word nunca sai do ar em
   relação ao documento versionado.

       node scripts/gerar-dossie-docx.mjs
       soffice --headless --convert-to pdf DOSSIE-COMANDO.docx

   ========================================================================= */

import fs from "node:fs";
import path from "node:path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
  VerticalAlign, HeadingLevel, PageNumber, convertMillimetersToTwip,
} from "docx";

const RAIZ = process.cwd();
/* Aceita outro documento como argumento:
     node scripts/gerar-dossie-docx.mjs RESUMO-COMANDO.md          */
const BASE = (process.argv[2] || "DOSSIE-COMANDO.md").replace(/\.md$/i, "");
const ENTRADA = path.join(RAIZ, `${BASE}.md`);
const SAIDA = path.join(RAIZ, `${BASE}.docx`);

/* O nome que vai no rodapé e nas propriedades sai do próprio documento:
   a primeira linha "## ..." é o subtítulo. */
const FONTE_MD = fs.readFileSync(ENTRADA, "utf8");
const SUBTITULO = (FONTE_MD.split("\n").find((l) => l.startsWith("## ")) || "## Documento")
  .slice(3).trim();

const AZUL = "0B1F3A";      // azul-marinho institucional
const DOURADO = "8A6D1F";   // dourado sóbrio, legível no papel
const CINZA = "555555";

/* Selos de situação: célula cujo conteúdo é só uma destas palavras sai como
   etiqueta colorida, em vez de texto solto. Leitura imediata na tabela. */
const SELOS = {
  "IMPLANTADO":    { fundo: "D8EFE0", texto: "0F5932" },
  "EM USO":        { fundo: "D8EFE0", texto: "0F5932" },
  "PARCIAL":       { fundo: "FEECCD", texto: "734A05" },
  "A IMPLANTAR":   { fundo: "FEECCD", texto: "734A05" },
  "SE AUTORIZADO": { fundo: "DDE8F9", texto: "17407F" },
};
const selo = (txt) => SELOS[String(txt || "").replace(/\*/g, "").trim().toUpperCase()] || null;

const ORG_TEXTO = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
];

/* ---------------------------------------------------------------- imagens */
function imagem(rel, w, h) {
  try {
    const arq = path.join(RAIZ, "public", rel.replace(/^\//, ""));
    const data = fs.readFileSync(arq);
    const kind = /\.jpe?g$/i.test(arq) ? "jpg" : "png";
    return new ImageRun({ type: kind, data, transformation: { width: w, height: h } });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ texto */
const SEM = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SEM_BORDAS = { top: SEM, bottom: SEM, left: SEM, right: SEM };
const FINA = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
const BORDAS = { top: FINA, bottom: FINA, left: FINA, right: FINA };

/* Converte a marcação inline do Markdown (**negrito**, *itálico*, `código`)
   em TextRun. Nada de regex sobre o texto inteiro: percorre uma vez só. */
function runs(texto, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) out.push(new TextRun({ text: texto.slice(ultimo, m.index), ...base }));
    const t = m[0];
    // dentro do negrito ainda pode haver `código`; tira só as crases
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2).replace(/`/g, ""), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: 18, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) out.push(new TextRun({ text: texto.slice(ultimo), ...base }));
  return out.length ? out : [new TextRun({ text: "", ...base })];
}

const P = (texto, opt = {}) =>
  new Paragraph({
    alignment: opt.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opt.after ?? 120, line: 276 },
    indent: opt.indent,
    children: runs(texto, { size: opt.size ?? 21, color: opt.color, bold: opt.bold, italics: opt.italics }),
  });

/* ----------------------------------------------------------------- timbre */
function timbre() {
  const cel = (filhos, largura) =>
    new TableCell({
      width: { size: largura, type: WidthType.PERCENTAGE },
      borders: SEM_BORDAS,
      verticalAlign: VerticalAlign.CENTER,
      children: filhos,
    });

  const brasaoPmma = imagem("brasoes/brasao-pmma.png", 58, 62);
  const armasMa = imagem("brasao-estado-ma.png", 52, 56);
  const brasao18 = imagem("brasoes/brasao-18bpm.png", 56, 62);

  const centro = [];
  if (armasMa) centro.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [armasMa], spacing: { after: 40 } }));
  for (const linha of ORG_TEXTO) {
    centro.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, line: 200 },
      children: [new TextRun({ text: linha, bold: true, size: 15, color: AZUL })],
    }));
  }
  centro.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 30, after: 0, line: 200 },
    children: [new TextRun({ text: "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP 65.760-000", size: 13, color: CINZA })],
  }));

  const tabela = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDAS,
    rows: [new TableRow({
      children: [
        cel(brasaoPmma ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [brasaoPmma] })] : [new Paragraph("")], 18),
        cel(centro, 64),
        cel(brasao18 ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [brasao18] })] : [new Paragraph("")], 18),
      ],
    })],
  });

  return new Header({
    children: [
      tabela,
      new Paragraph({
        spacing: { before: 60, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: DOURADO, space: 1 } },
        children: [new TextRun({ text: "", size: 2 })],
      }),
    ],
  });
}

function rodape() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 6 } },
        children: [
          new TextRun({ text: `SIGEP · 18º BPM — ${SUBTITULO} · página `, size: 15, color: CINZA }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: CINZA }),
          new TextRun({ text: " de ", size: 15, color: CINZA }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: CINZA }),
        ],
      }),
    ],
  });
}

/* ------------------------------------------------- conversão do Markdown */
function tabelaDocx(linhas) {
  const celulas = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const cab = celulas(linhas[0]);
  const corpo = linhas.slice(2).map(celulas);
  const larg = Math.floor(100 / cab.length);

  const linhaCab = new TableRow({
    tableHeader: true,
    children: cab.map((c) => new TableCell({
      width: { size: larg, type: WidthType.PERCENTAGE },
      borders: BORDAS,
      shading: { fill: AZUL },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: runs(c, { bold: true, size: 18, color: "FFFFFF" }),
      })],
    })),
  });

  const linhasCorpo = corpo.map((cols, i) => new TableRow({
    children: cols.map((c) => {
      const sl = selo(c);
      return new TableCell({
        width: { size: larg, type: WidthType.PERCENTAGE },
        borders: BORDAS,
        shading: sl ? { fill: sl.fundo } : i % 2 ? { fill: "F4F6F9" } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [new Paragraph({
          alignment: sl ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: sl
            ? [new TextRun({ text: c.replace(/\*/g, "").trim().toUpperCase(), bold: true, size: 16, color: sl.texto })]
            : runs(c, { size: 18 }),
        })],
      });
    }),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [linhaCab, ...linhasCorpo],
  });
}

function converter(md) {
  const linhas = md.split("\n");
  const filhos = [];
  let i = 0;

  while (i < linhas.length) {
    const l = linhas[i];

    // bloco de código / diagrama — sai em fonte monoespaçada, com fundo
    if (l.trim().startsWith("```")) {
      i++;
      const bloco = [];
      while (i < linhas.length && !linhas[i].trim().startsWith("```")) bloco.push(linhas[i++]);
      i++;
      filhos.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({
          children: [new TableCell({
            borders: BORDAS,
            shading: { fill: "F4F6F9" },
            margins: { top: 120, bottom: 120, left: 150, right: 150 },
            children: bloco.map((b) => new Paragraph({
              spacing: { after: 0, line: 200 },
              children: [new TextRun({ text: b || " ", font: "Consolas", size: 15, color: AZUL })],
            })),
          })],
        })],
      }));
      filhos.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
      continue;
    }

    // tabela
    if (l.trim().startsWith("|") && linhas[i + 1]?.includes("---")) {
      const bloco = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) bloco.push(linhas[i++]);
      filhos.push(tabelaDocx(bloco));
      filhos.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }

    // separador
    if (/^---+$/.test(l.trim())) {
      filhos.push(new Paragraph({
        spacing: { before: 120, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
        children: [new TextRun({ text: "", size: 2 })],
      }));
      i++;
      continue;
    }

    // títulos
    if (l.startsWith("#### ")) {
      filhos.push(new Paragraph({
        spacing: { before: 200, after: 80 },
        children: runs(l.slice(5), { bold: true, size: 21, color: AZUL }),
      }));
      i++; continue;
    }
    if (l.startsWith("### ")) {
      filhos.push(new Paragraph({
        spacing: { before: 260, after: 100 },
        children: runs(l.slice(4), { bold: true, size: 23, color: AZUL }),
      }));
      i++; continue;
    }
    if (l.startsWith("## ")) {
      filhos.push(new Paragraph({
        spacing: { before: 320, after: 140 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: DOURADO, space: 4 } },
        children: runs(l.slice(3), { bold: true, size: 27, color: AZUL }),
      }));
      i++; continue;
    }
    if (l.startsWith("# ")) {
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 60 },
        children: runs(l.slice(2), { bold: true, size: 34, color: AZUL }),
      }));
      i++; continue;
    }

    // citação em destaque
    if (l.startsWith("> ")) {
      const bloco = [];
      while (i < linhas.length && linhas[i].startsWith("> ")) bloco.push(linhas[i++].slice(2));
      filhos.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({
          children: [new TableCell({
            borders: {
              top: SEM, bottom: SEM, right: SEM,
              left: { style: BorderStyle.SINGLE, size: 18, color: DOURADO },
            },
            shading: { fill: "FBF7EA" },
            margins: { top: 140, bottom: 140, left: 180, right: 140 },
            children: bloco.map((b) => new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 0, line: 276 },
              children: runs(b, { size: 21, italics: true, color: "3A2E10" }),
            })),
          })],
        })],
      }));
      filhos.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }

    // lista
    if (/^[-*] /.test(l.trim())) {
      while (i < linhas.length && /^[-*] /.test(linhas[i].trim())) {
        filhos.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 60, line: 276 },
          bullet: { level: 0 },
          children: runs(linhas[i].trim().replace(/^[-*] /, ""), { size: 21 }),
        }));
        i++;
      }
      filhos.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      continue;
    }

    // lista numerada
    if (/^\d+\. /.test(l.trim())) {
      while (i < linhas.length && /^\d+\. /.test(linhas[i].trim())) {
        filhos.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 60, line: 276 },
          indent: { left: 360 },
          children: runs(linhas[i].trim(), { size: 21 }),
        }));
        i++;
      }
      filhos.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      continue;
    }

    // linha em branco
    if (!l.trim()) { i++; continue; }

    // parágrafo comum
    filhos.push(P(l.trim()));
    i++;
  }

  return filhos;
}

/* ------------------------------------------------------------------ main */
const md = FONTE_MD;

const doc = new Document({
  creator: "SIGEP · 18º BPM",
  title: `SIGEP — ${SUBTITULO}`,
  description: `${SUBTITULO} — SIGEP do 18º BPM`,
  styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertMillimetersToTwip(38),
          bottom: convertMillimetersToTwip(20),
          left: convertMillimetersToTwip(22),
          right: convertMillimetersToTwip(20),
        },
      },
    },
    headers: { default: timbre() },
    footers: { default: rodape() },
    children: converter(md),
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(SAIDA, buf);
console.log(`✔ ${path.basename(SAIDA)} — ${(buf.length / 1024).toFixed(0)} KB`);
