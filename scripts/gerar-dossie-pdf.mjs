/* =========================================================================
   Gera o DOSSIE-COMANDO em PDF com o TIMBRE oficial do 18º BPM — o mesmo
   cabeçalho da escala de serviço, repetido em todas as páginas, com
   numeração no rodapé.

   Monta o PDF direto com pdf-lib (a mesma biblioteca que já gera o PDF da
   escala), a partir do DOSSIE-COMANDO.md. Assim o PDF e o Word nascem do
   mesmo texto versionado e nunca divergem.

       node scripts/gerar-dossie-pdf.mjs

   ========================================================================= */

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const RAIZ = process.cwd();
/* Aceita outro documento como argumento:
     node scripts/gerar-dossie-pdf.mjs RESUMO-COMANDO.md          */
const BASE = (process.argv[2] || "DOSSIE-COMANDO.md").replace(/\.md$/i, "");
const ENTRADA = path.join(RAIZ, `${BASE}.md`);
const SAIDA = path.join(RAIZ, `${BASE}.pdf`);

/* ---------------------------------------------------------------- página */
const A4 = { w: 595.28, h: 841.89 };
const MARGEM = { esq: 52, dir: 46, base: 58 };
// O timbre ocupa do topo até ~728 (brasões + 5 linhas do órgão + endereço).
// O conteúdo começa abaixo da régua dourada, sem encostar nele.
const TOPO_CONTEUDO = 704;
const LARGURA = A4.w - MARGEM.esq - MARGEM.dir;

const AZUL = rgb(0.043, 0.122, 0.227);
const DOURADO = rgb(0.541, 0.427, 0.122);
const CINZA = rgb(0.36, 0.4, 0.46);
const CINZA_CLARO = rgb(0.78, 0.80, 0.84);
const FUNDO_ZEBRA = rgb(0.957, 0.965, 0.976);
const FUNDO_CODIGO = rgb(0.949, 0.957, 0.973);
const FUNDO_CITACAO = rgb(0.984, 0.969, 0.918);
const PRETO = rgb(0.10, 0.12, 0.16);

const ORG_TEXTO = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
];

/* As fontes padrão do PDF usam WinAnsi: acentuação do português entra, mas
   traços de caixa e emoji não. Troca por equivalentes legíveis em vez de
   quebrar a geração. */
const TROCAS = {
  "─": "-", "│": "|", "┌": "+", "┐": "+", "└": "+", "┘": "+",
  "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
  "▼": "v", "▲": "^", "►": ">", "◄": "<", "▸": ">", "◀": "<", "▶": ">",
  "★": "*", "✔": "-", "✅": "", "🔒": "", "🛡️": "", "🛡": "", "📄": "", "💾": "",
  "🖨": "", "⛶": "", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...",
  "≥": ">=", "≤": "<=", "×": "x", "→": "->", "♂": "M", "♀": "F",
};

function limpar(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    if (ch in TROCAS) { out += TROCAS[ch]; continue; }
    const c = ch.codePointAt(0);
    // Latin-1 + Latin Extended-A, mais os sinais tipográficos que a
    // codificação WinAnsi das fontes padrão aceita (travessão, bullet, euro).
    if (c <= 0x2c6 || c === 0x2013 || c === 0x2014 || c === 0x2022 || ch === "€") out += ch;
    // acima disso (emoji, traços de caixa não mapeados): descarta
  }
  return out;
}

/* --------------------------------------------------------------- inline */
/** "texto **negrito** e `código`" -> [{t, b, i, m}] */
function inline(txt) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let ultimo = 0, m;
  const s = limpar(txt);
  while ((m = re.exec(s)) !== null) {
    if (m.index > ultimo) out.push({ t: s.slice(ultimo, m.index) });
    const p = m[0];
    // dentro do negrito ainda pode haver `código`; tira só as crases
    if (p.startsWith("**")) out.push({ t: p.slice(2, -2).replace(/`/g, ""), b: true });
    else if (p.startsWith("`")) out.push({ t: p.slice(1, -1), m: true });
    else out.push({ t: p.slice(1, -1), i: true });
    ultimo = m.index + p.length;
  }
  if (ultimo < s.length) out.push({ t: s.slice(ultimo) });
  return out.length ? out : [{ t: "" }];
}

/* O nome que vai no rodapé e nas propriedades sai do próprio documento:
   a primeira linha "## ..." é o subtítulo. */
const FONTE_MD = fs.readFileSync(ENTRADA, "utf8");
const SUBTITULO = (FONTE_MD.split("\n").find((l) => l.startsWith("## ")) || "## Documento")
  .slice(3).trim();

/* ============================================================== gerador */
const pdf = await PDFDocument.create();
pdf.setTitle(limpar(`SIGEP - 18º BPM - ${SUBTITULO}`));
pdf.setAuthor("SIGEP - 18º BPM");
pdf.setSubject(limpar(SUBTITULO));

const F = {
  n: await pdf.embedFont(StandardFonts.Helvetica),
  b: await pdf.embedFont(StandardFonts.HelveticaBold),
  i: await pdf.embedFont(StandardFonts.HelveticaOblique),
  m: await pdf.embedFont(StandardFonts.Courier),
  mb: await pdf.embedFont(StandardFonts.CourierBold),
};
const fonte = (r) => (r.m ? F.m : r.b ? F.b : r.i ? F.i : F.n);

async function embutir(rel) {
  try {
    const arq = path.join(RAIZ, "public", rel.replace(/^\//, ""));
    const data = fs.readFileSync(arq);
    return /\.jpe?g$/i.test(arq) ? await pdf.embedJpg(data) : await pdf.embedPng(data);
  } catch { return null; }
}
const IMG = {
  pmma: await embutir("brasoes/brasao-pmma.png"),
  ma: await embutir("brasao-estado-ma.png"),
  bpm: await embutir("brasoes/brasao-18bpm.png"),
};

let pagina = null;
let y = 0;
const paginas = [];

function desenharTimbre(p) {
  const topo = A4.h - 30;

  const por = (img, cx, alvoH) => {
    if (!img) return;
    const esc = alvoH / img.height;
    const w = img.width * esc;
    p.drawImage(img, { x: cx - w / 2, y: topo - alvoH, width: w, height: alvoH });
  };
  por(IMG.pmma, MARGEM.esq + 26, 46);
  por(IMG.bpm, A4.w - MARGEM.dir - 26, 46);
  por(IMG.ma, A4.w / 2, 30);

  let ty = topo - 38;
  for (const linha of ORG_TEXTO) {
    const t = limpar(linha);
    const w = F.b.widthOfTextAtSize(t, 7.2);
    p.drawText(t, { x: A4.w / 2 - w / 2, y: ty, size: 7.2, font: F.b, color: AZUL });
    ty -= 8.4;
  }
  const end = limpar("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP 65.760-000");
  const we = F.n.widthOfTextAtSize(end, 6.4);
  p.drawText(end, { x: A4.w / 2 - we / 2, y: ty - 1, size: 6.4, font: F.n, color: CINZA });

  p.drawRectangle({ x: MARGEM.esq, y: TOPO_CONTEUDO + 18, width: LARGURA, height: 1.4, color: DOURADO });
}

function novaPagina() {
  pagina = pdf.addPage([A4.w, A4.h]);
  paginas.push(pagina);
  desenharTimbre(pagina);
  y = TOPO_CONTEUDO;
}
function espaco(h) {
  if (y - h < MARGEM.base) novaPagina();
}

/* Quebra uma sequência de runs em linhas que cabem na largura. */
function quebrar(runs, largura, tam) {
  const linhas = [];
  let atual = [], usado = 0;
  for (const r of runs) {
    const f = fonte(r);
    const partes = r.t.split(/(\s+)/).filter((x) => x !== "");
    for (const parte of partes) {
      const w = f.widthOfTextAtSize(parte, tam);
      if (usado + w > largura && usado > 0) {
        linhas.push(atual);
        atual = []; usado = 0;
        if (/^\s+$/.test(parte)) continue;   // não começa linha com espaço
      }
      atual.push({ ...r, t: parte, w });
      usado += w;
    }
  }
  if (atual.length) linhas.push(atual);
  return linhas.length ? linhas : [[]];
}

function escreverLinha(linha, x, tam, cor) {
  let cx = x;
  for (const r of linha) {
    pagina.drawText(r.t, { x: cx, y, size: tam, font: fonte(r), color: r.cor || cor });
    cx += r.w ?? fonte(r).widthOfTextAtSize(r.t, tam);
  }
}

function paragrafo(txt, opt = {}) {
  const tam = opt.tam ?? 9.4;
  const alt = opt.alt ?? tam * 1.42;
  const x = MARGEM.esq + (opt.recuo ?? 0);
  const larg = LARGURA - (opt.recuo ?? 0);
  const runs = opt.runs ?? inline(txt);
  if (opt.bold) runs.forEach((r) => (r.b = true));
  for (const linha of quebrar(runs, larg, tam)) {
    espaco(alt);
    escreverLinha(linha, x, tam, opt.cor ?? PRETO);
    y -= alt;
  }
  y -= opt.depois ?? 4;
}

function titulo(txt, nivel) {
  const cfg = {
    1: { tam: 17, antes: 6, depois: 6, regua: false },
    2: { tam: 12.5, antes: 16, depois: 8, regua: true },
    3: { tam: 10.6, antes: 12, depois: 5, regua: false },
    4: { tam: 9.6, antes: 9, depois: 3, regua: false },
  }[nivel];
  // Nunca deixa um título sozinho no pé da página: exige espaço para ele
  // MAIS algumas linhas do que vem a seguir.
  espaco(cfg.tam * 2.4 + cfg.antes + 72);
  y -= cfg.antes;
  const runs = inline(txt).map((r) => ({ ...r, b: true }));
  const alt = cfg.tam * 1.3;
  for (const linha of quebrar(runs, LARGURA, cfg.tam)) {
    espaco(alt);
    if (nivel === 1) {
      const w = linha.reduce((a, r) => a + (r.w ?? 0), 0);
      escreverLinha(linha, MARGEM.esq + (LARGURA - w) / 2, cfg.tam, AZUL);
    } else {
      escreverLinha(linha, MARGEM.esq, cfg.tam, AZUL);
    }
    y -= alt;
  }
  if (cfg.regua) {
    y -= 1;
    pagina.drawRectangle({ x: MARGEM.esq, y, width: LARGURA, height: 1, color: DOURADO });
  }
  y -= cfg.depois;
}

function regua() {
  espaco(14);
  y -= 6;
  pagina.drawRectangle({ x: MARGEM.esq, y, width: LARGURA, height: 0.6, color: CINZA_CLARO });
  y -= 10;
}

function lista(itens, numerada) {
  const tam = 9.4, alt = 13.4, recuo = 16;
  itens.forEach((it, idx) => {
    const marca = numerada ? `${idx + 1}.` : "•";
    const linhas = quebrar(inline(it), LARGURA - recuo, tam);
    linhas.forEach((linha, i) => {
      espaco(alt);
      if (i === 0) {
        pagina.drawText(marca, { x: MARGEM.esq + 3, y, size: tam, font: F.n, color: DOURADO });
      }
      escreverLinha(linha, MARGEM.esq + recuo, tam, PRETO);
      y -= alt;
    });
    y -= 2;
  });
  y -= 4;
}

function citacao(linhas) {
  const tam = 9.4, alt = 13.6, pad = 10, recuo = 14;
  const largTexto = LARGURA - recuo - pad * 2;
  const blocos = linhas.map((l) => quebrar(inline(l).map((r) => ({ ...r, i: true })), largTexto, tam));
  const total = blocos.reduce((a, b) => a + b.length, 0) * alt + pad * 2;
  espaco(total + 6);
  const topo = y + 3;
  pagina.drawRectangle({ x: MARGEM.esq, y: topo - total, width: LARGURA, height: total, color: FUNDO_CITACAO });
  pagina.drawRectangle({ x: MARGEM.esq, y: topo - total, width: 3, height: total, color: DOURADO });
  y = topo - pad - tam;
  for (const bloco of blocos) {
    for (const linha of bloco) {
      escreverLinha(linha, MARGEM.esq + recuo + pad, tam, rgb(0.23, 0.18, 0.06));
      y -= alt;
    }
  }
  y = topo - total - 10;
}

function codigo(linhas) {
  const tam = 7.4, alt = 9.8, pad = 9;
  const total = linhas.length * alt + pad * 2;
  espaco(total + 6);
  const topo = y + 3;
  pagina.drawRectangle({
    x: MARGEM.esq, y: topo - total, width: LARGURA, height: total,
    color: FUNDO_CODIGO, borderColor: CINZA_CLARO, borderWidth: 0.5,
  });
  y = topo - pad - tam;
  for (const l of linhas) {
    pagina.drawText(limpar(l) || " ", { x: MARGEM.esq + pad, y, size: tam, font: F.m, color: AZUL });
    y -= alt;
  }
  y = topo - total - 10;
}

function tabela(bruto) {
  const celulas = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const cab = celulas(bruto[0]);
  const corpo = bruto.slice(2).map(celulas);
  const n = cab.length;
  const tam = 8.2, altLinha = 11.4, pad = 5;

  // largura por coluna: proporcional ao conteúdo, com piso e teto
  const peso = cab.map((_, c) => {
    let max = F.b.widthOfTextAtSize(limpar(cab[c]), tam);
    for (const l of corpo) {
      max = Math.max(max, F.n.widthOfTextAtSize(limpar(l[c] ?? "").replace(/\*\*/g, ""), tam));
    }
    return Math.min(Math.max(max, 46), 250);
  });
  const soma = peso.reduce((a, b) => a + b, 0);
  const larguras = peso.map((p) => (p / soma) * LARGURA);

  const desenhaLinha = (cols, opt) => {
    const blocos = cols.map((c, i) =>
      quebrar(inline(c).map((r) => ({ ...r, b: opt.cab ? true : r.b })), larguras[i] - pad * 2, tam));
    const altura = Math.max(...blocos.map((b) => b.length)) * altLinha + pad * 1.6;
    if (y - altura < MARGEM.base) {
      novaPagina();
      if (!opt.cab) desenhaLinha(cab, { cab: true });   // repete o cabeçalho
    }
    const topo = y;
    let x = MARGEM.esq;
    cols.forEach((_, i) => {
      pagina.drawRectangle({
        x, y: topo - altura, width: larguras[i], height: altura,
        color: opt.cab ? AZUL : opt.zebra ? FUNDO_ZEBRA : undefined,
        borderColor: CINZA_CLARO, borderWidth: 0.5,
      });
      let ty = topo - pad - tam * 0.9;
      for (const linha of blocos[i]) {
        const guarda = y; y = ty;
        escreverLinha(linha, x + pad, tam, opt.cab ? rgb(1, 1, 1) : PRETO);
        y = guarda;
        ty -= altLinha;
      }
      x += larguras[i];
    });
    y = topo - altura;
  };

  espaco(40);
  desenhaLinha(cab, { cab: true });
  corpo.forEach((l, i) => desenhaLinha(l, { zebra: i % 2 === 1 }));
  y -= 12;
}

/* ------------------------------------------------------ percorre o texto */
const md = FONTE_MD.split("\n");
novaPagina();

let i = 0;
while (i < md.length) {
  const l = md[i];

  if (l.trim().startsWith("```")) {
    i++;
    const bloco = [];
    while (i < md.length && !md[i].trim().startsWith("```")) bloco.push(md[i++]);
    i++;
    codigo(bloco);
    continue;
  }
  if (l.trim().startsWith("|") && md[i + 1]?.includes("---")) {
    const bloco = [];
    while (i < md.length && md[i].trim().startsWith("|")) bloco.push(md[i++]);
    tabela(bloco);
    continue;
  }
  if (/^---+$/.test(l.trim())) { regua(); i++; continue; }
  if (l.startsWith("#### ")) { titulo(l.slice(5), 4); i++; continue; }
  if (l.startsWith("### ")) { titulo(l.slice(4), 3); i++; continue; }
  if (l.startsWith("## ")) { titulo(l.slice(3), 2); i++; continue; }
  if (l.startsWith("# ")) { titulo(l.slice(2), 1); i++; continue; }
  if (l.startsWith("> ")) {
    const bloco = [];
    while (i < md.length && md[i].startsWith("> ")) bloco.push(md[i++].slice(2));
    citacao(bloco);
    continue;
  }
  if (/^[-*] /.test(l.trim())) {
    const itens = [];
    while (i < md.length && /^[-*] /.test(md[i].trim())) itens.push(md[i++].trim().replace(/^[-*] /, ""));
    lista(itens, false);
    continue;
  }
  if (/^\d+\. /.test(l.trim())) {
    const itens = [];
    while (i < md.length && /^\d+\. /.test(md[i].trim())) itens.push(md[i++].trim().replace(/^\d+\.\s*/, ""));
    lista(itens, true);
    continue;
  }
  if (!l.trim()) { i++; continue; }
  paragrafo(l.trim());
  i++;
}

/* --------------------------------------------------------------- rodapé */
const total = paginas.length;
if (total > 1) paginas.forEach((p, idx) => {
  p.drawRectangle({ x: MARGEM.esq, y: MARGEM.base - 16, width: LARGURA, height: 0.5, color: CINZA_CLARO });
  const t = limpar(`SIGEP · 18º BPM — ${SUBTITULO} · página ${idx + 1} de ${total}`);
  const w = F.n.widthOfTextAtSize(t, 7);
  p.drawText(t, { x: A4.w / 2 - w / 2, y: MARGEM.base - 27, size: 7, font: F.n, color: CINZA });
});

fs.writeFileSync(SAIDA, await pdf.save());
console.log(`✔ ${path.basename(SAIDA)} — ${total} páginas, ${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB`);
