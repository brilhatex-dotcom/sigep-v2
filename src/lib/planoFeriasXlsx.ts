import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

/* =========================================================================
   PLANO DE FÉRIAS EM EXCEL (.xlsx) — oficiais, praças ou os dois.

   O LAYOUT é o das planilhas que o P/1 já usava (PLANO DE FÉRIAS 2026 —
   praças e oficiais); o CABEÇALHO é o nosso, o da Escala de Serviço:
     · 190 anos da PMMA à esquerda, armas do Maranhão no centro, brasão do
       18º BPM à direita e o texto da organização — SEM o "VISTO" do Cmt;
     · título "PLANO DE FÉRIAS DOS PRAÇAS (OFICIAIS) DO 18º BPM REFERENTE AO
       EXERCÍCIO DE <ano>." (Arial 12, como no modelo).

   PRAÇAS — uma tabela por equipe, uma embaixo da outra, cada uma com o seu
   cabeçalho cinza: ORD | GRAD | NUMERO | NOME | ID | MATRÍCULA | EQUIPE |
   PERIODO. O ORD recomeça em cada equipe; o período sai "02/01/27 a
   05/02/27" (e " e " entre os dois períodos, quando a equipe tem dois).
   OFICIAIS — uma tabela só, em ordem de hierarquia: ORD | POSTO | NOME |
   MATRICULA | ID | EQUIPE (o modelo dos oficiais não traz o período).
   Nos dois, o NOME DE GUERRA sai em negrito dentro do nome completo.

   "Oficiais e praças" = as duas abas no mesmo arquivo (como no modelo).

   No fim de cada aba, "Quartel do 18º BPM..." e a ASSINATURA DO CMT DA
   UNIDADE — a mesma imagem do VISTO da escala (Config "escala_chefe_p1"
   .cmtAssinatura) com o nome do Comandante embaixo. Na impressão, uma
   equipe não se parte entre duas folhas, e a assinatura não fica sozinha.

   A marca de férias ADIADAS não sai no papel — a mesma regra do "Imprimir"
   do plano: ela é aviso de tela, não informação do documento.
   ========================================================================= */

export type MembroPlano = {
  id: string;
  postoGrad: string | null; numeroBarra: string | null; nome: string | null;
  nomeGuerra: string | null; matricula: string | null;
  oficial: boolean;
  antiguidade: number;   // posição na hierarquia do plano todo (0 = mais antigo)
};
export type PeriodoPlano = { rotulo: string; inicio: string; fim: string; apres: string };
export type EquipePlano = { numero: string; periodos: PeriodoPlano[]; membros: MembroPlano[] };
export type QuemPlano = "oficiais" | "pracas" | "todos";

export type OpcoesPlanoXlsx = {
  ano: string;
  quem: QuemPlano;
  brasoes: { pmma?: string; ma?: string; bpm?: string };
  cmt: { nome: string; cargo: string; assinatura?: string };
  hoje?: Date;
};

const ORG = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const FONTE = "Times New Roman";

type Coluna = { titulo: string; largura: number; alinhar: "left" | "center"; tam: number };

// larguras, fontes e alinhamentos copiados dos modelos
const COLUNAS_PRACAS: Coluna[] = [
  { titulo: "ORD", largura: 7.43, alinhar: "center", tam: 12 },
  { titulo: "GRAD", largura: 18.14, alinhar: "center", tam: 10 },
  { titulo: "NUMERO", largura: 14.29, alinhar: "center", tam: 10 },
  { titulo: "NOME", largura: 53.86, alinhar: "center", tam: 10 },
  { titulo: "ID", largura: 14.57, alinhar: "center", tam: 10 },
  { titulo: "MATRÍCULA", largura: 17.57, alinhar: "center", tam: 10 },
  { titulo: "EQUIPE", largura: 9.57, alinhar: "center", tam: 12 },
  { titulo: "PERIODO", largura: 43.29, alinhar: "center", tam: 12 },
];
const COLUNAS_OFICIAIS: Coluna[] = [
  { titulo: "ORD", largura: 5.86, alinhar: "center", tam: 12 },
  { titulo: "POSTO", largura: 18.57, alinhar: "center", tam: 12 },
  { titulo: "NOME", largura: 50.71, alinhar: "left", tam: 12 },
  { titulo: "MATRICULA", largura: 13.57, alinhar: "center", tam: 12 },
  { titulo: "ID", largura: 14, alinhar: "center", tam: 12 },
  { titulo: "EQUIPE", largura: 15.14, alinhar: "center", tam: 12 },
];

const fina = { style: "thin" as const, color: { argb: "FF000000" } };
const grade = { top: fina, left: fina, bottom: fina, right: fina };

/* ---------------------------------------------------------------- imagens */

type Imagem = { buffer: Buffer; extension: "png" | "jpeg"; largura: number; altura: number };

// largura x altura direto do cabeçalho do arquivo (PNG ou JPEG), sem biblioteca
function dimensoes(b: Buffer, ext: "png" | "jpeg"): { largura: number; altura: number } | null {
  try {
    if (ext === "png" && b.length > 24) return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marca = b[i + 1];
      const tam = b.readUInt16BE(i + 2);
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC)
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      }
      i += 2 + tam;
    }
  } catch { /* cai no null */ }
  return null;
}

export function carregarImagem(valor?: string | null): Imagem | null {
  if (!valor) return null;
  try {
    let buffer: Buffer;
    let extension: "png" | "jpeg";
    if (valor.startsWith("data:")) {
      const m = valor.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!m) return null;
      buffer = Buffer.from(m[2], "base64");
      extension = m[1].toLowerCase() === "png" ? "png" : "jpeg";
    } else {
      const rel = valor.replace(/^\//, "");
      buffer = fs.readFileSync(path.join(process.cwd(), "public", rel));
      extension = /\.jpe?g$/i.test(rel) ? "jpeg" : "png";
    }
    const d = dimensoes(buffer, extension);
    if (!d || !d.largura || !d.altura) return null;
    return { buffer, extension, ...d };
  } catch { return null; }
}

// largura em pixels de uma coluna do Excel (a regra do próprio Excel para a
// fonte padrão, Calibri 11: 7 px por dígito)
const pxColuna = (largura: number) => Math.trunc(((256 * largura + Math.trunc(128 / 7)) / 256) * 7);
const EMU_PX = 9525;    // EMU por pixel (96 dpi)
const EMU_PT = 12700;   // EMU por ponto

// ponto x (px a partir da borda esquerda da coluna A) -> coluna 0-based + sobra em EMU
function naColuna(colunas: Coluna[], x: number) {
  let col = 0;
  while (col < colunas.length - 1 && x >= pxColuna(colunas[col].largura)) { x -= pxColuna(colunas[col].largura); col++; }
  return { nativeCol: col, nativeColOff: Math.round(x * EMU_PX) };
}

// ponto y (pt a partir do topo da linha 1) -> linha 0-based + sobra em EMU
function naLinha(ws: ExcelJS.Worksheet, y: number) {
  let row = 0;
  for (let h = ws.getRow(1).height ?? 15; y >= h; h = ws.getRow(row + 1).height ?? 15) { y -= h; row++; }
  return { nativeRow: row, nativeRowOff: Math.round(y * EMU_PT) };
}

/* Põe a imagem com a ALTURA dada em pixels (a largura segue a proporção),
   centrada no ponto x (pixels a partir da borda esquerda da coluna A), a
   `topoPt` pontos do topo da linha `linha` (1-based). As linhas que a imagem
   ocupa já têm de estar com a altura definida.

   Âncora pelos DOIS cantos, em EMU (como o próprio Excel grava "mover sem
   redimensionar"): a coluna fracionária do exceljs ("col: 3.5") usa uma
   largura de coluna irreal e jogava as imagens para a esquerda, e a âncora de
   um canto só com tamanho sai com um atributo (editAs) fora do padrão do
   formato. */
function porImagem(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, colunas: Coluna[], img: Imagem, centroX: number, linha: number, topoPt: number, altura: number) {
  const largura = Math.round((img.largura / img.altura) * altura);
  const x = Math.max(0, centroX - largura / 2);
  let y = topoPt;
  for (let i = 1; i < linha; i++) y += ws.getRow(i).height ?? 15;
  const id = wb.addImage({ buffer: img.buffer as any, extension: img.extension });
  ws.addImage(id, {
    tl: { ...naColuna(colunas, x), ...naLinha(ws, y) },
    br: { ...naColuna(colunas, x + largura), ...naLinha(ws, y + altura * 0.75) },   // 1 px = 0,75 pt
    editAs: "oneCell",
  } as any);
}

/* ---------------------------------------------------------------- planilha */

// "02/01/2027" -> "02/01/27", como no modelo
const curta = (d: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d) ? `${d.slice(0, 6)}${d.slice(8)}` : d);

// "02/01/27 a 05/02/27" — com dois períodos, " e " entre eles
export function textoPeriodos(periodos: PeriodoPlano[]): string {
  const ps = periodos.filter((p) => p.inicio && p.inicio !== "—");
  if (!ps.length) return "a definir";
  return ps.map((p) => `${curta(p.inicio)} a ${curta(p.fim)}`).join(" e ");
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

/* O nome completo com o NOME DE GUERRA em negrito (como no modelo:
   "**Aldean** da Costa Monteiro"). Palavra a palavra, sem ligar para acento
   nem caixa; se o nome de guerra não estiver no nome, sai tudo normal. */
export function nomeComGuerra(nome: string, guerra: string | null, tam: number): ExcelJS.CellRichTextValue | string {
  const alvo = new Set(semAcento(guerra || "").split(/\s+/).filter((p) => p && !PARTICULAS.has(p)));
  if (!alvo.size || !nome) return nome;
  const pedacos = nome.split(/(\s+)/);
  if (!pedacos.some((p) => alvo.has(semAcento(p)))) return nome;
  const richText: ExcelJS.RichText[] = [];
  for (const p of pedacos) {
    const negrito = alvo.has(semAcento(p));
    const ultimo = richText[richText.length - 1];
    // junta os pedaços vizinhos de mesmo estilo
    if (ultimo && !!ultimo.font?.bold === negrito) ultimo.text += p;
    else richText.push({ text: p, font: { name: FONTE, size: tam, bold: negrito } });
  }
  return { richText };
}

type Folha = { titulo: string; nomeAba: string; colunas: Coluna[] };
const FOLHA_PRACAS: Folha = { titulo: "PRAÇAS", nomeAba: "Praças", colunas: COLUNAS_PRACAS };
const FOLHA_OFICIAIS: Folha = { titulo: "OFICIAIS", nomeAba: "Oficiais", colunas: COLUNAS_OFICIAIS };

/* Cabeçalho (o da escala, sem o VISTO), título, e as ferramentas de linha e
   de quebra de página de uma aba. */
function novaAba(wb: ExcelJS.Workbook, folha: Folha, op: OpcoesPlanoXlsx) {
  const colunas = folha.colunas;
  const N = colunas.length;
  const ws = wb.addWorksheet(folha.nomeAba, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  colunas.forEach((c, i) => { ws.getColumn(i + 1).width = c.largura; });
  const larguraTotal = colunas.reduce((s, c) => s + pxColuna(c.largura), 0);

  const linhaTexto = (r: number, texto: string, opt: { bold?: boolean; size?: number; altura?: number; alinhar?: "center" | "right" | "left"; italic?: boolean; fonte?: string } = {}) => {
    ws.mergeCells(r, 1, r, N);
    const c = ws.getCell(r, 1);
    c.value = texto;
    c.font = { name: opt.fonte ?? FONTE, size: opt.size ?? 10, bold: !!opt.bold, italic: !!opt.italic };
    c.alignment = { horizontal: opt.alinhar ?? "center", vertical: "middle", wrapText: true };
    if (opt.altura) ws.getRow(r).height = opt.altura;
  };

  /* ---- cabeçalho: o da escala, sem o VISTO ----
     linha 1: armas do MA no centro; linhas 2..8: a organização;
     190 anos da PMMA à esquerda e o 18º BPM à direita, na altura do texto. */
  ws.getRow(1).height = 46;
  ORG.forEach((t, i) => linhaTexto(2 + i, t, { bold: i === 4, size: i === 4 ? 11 : 10, altura: 14 }));
  const pmma = carregarImagem(op.brasoes.pmma);
  const ma = carregarImagem(op.brasoes.ma);
  const bpm = carregarImagem(op.brasoes.bpm);
  if (ma) porImagem(wb, ws, colunas, ma, larguraTotal / 2, 1, 3, 56);
  if (pmma) porImagem(wb, ws, colunas, pmma, 58, 2, 4, 84);
  if (bpm) porImagem(wb, ws, colunas, bpm, larguraTotal - 52, 2, 4, 84);

  // ---- título, como no modelo (Arial 12) ----
  ws.getRow(9).height = 10;
  linhaTexto(10, `PLANO DE FÉRIAS DOS ${folha.titulo} DO 18º BPM REFERENTE AO EXERCÍCIO DE ${op.ano}.`,
    { size: 12, fonte: "Arial", altura: 20 });
  ws.getRow(11).height = 12;

  /* ---- quebra de página: um bloco não se parte entre duas folhas ----
     Na folha A4 em pé, com a redução do "ajustar à largura", cabem
     `porPagina` pontos de linhas; 5% de folga para a diferença de medida
     entre os programas. */
  const reducao = Math.min(1, (595.28 - 2 * 0.35 * 72) / (larguraTotal * 0.75));
  const porPagina = ((841.89 - (0.4 + 0.5) * 72) / reducao) * 0.95;
  let usado = 0;
  for (let i = 1; i <= 11; i++) usado += ws.getRow(i).height ?? 15;
  // o bloco de `altura` pontos que começa na linha r não cabe? quebra antes dela
  const reservar = (r: number, altura: number) => {
    if (usado > 0 && usado + altura > porPagina) { ws.getRow(r - 1).addPageBreak(); usado = 0; }
    usado = (usado + altura) % porPagina;
  };

  return { ws, colunas, larguraTotal, linhaTexto, reservar, primeira: 12 };
}

const ALTURA_LINHA = 17.25;   // a do modelo
// data + assinatura + nome + cargo do Cmt (as alturas das linhas do fecho)
const FECHO = 14 + 18 + 10 + 48 + 14 + 14;

function cabecalhoTabela(ws: ExcelJS.Worksheet, r: number, colunas: Coluna[], estilo: "pracas" | "oficiais") {
  colunas.forEach((c, i) => {
    const cel = ws.getCell(r, i + 1);
    cel.value = c.titulo;
    // praças: Times 12 em cinza claro; oficiais: Arial 10 negrito em cinza (os modelos)
    cel.font = estilo === "pracas" ? { name: FONTE, size: 12 } : { name: "Arial", size: 10, bold: true };
    cel.alignment = { horizontal: "center", vertical: "middle" };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: estilo === "pracas" ? "FFD9D9D9" : "FFC0C0C0" } };
    cel.border = grade;
  });
  ws.getRow(r).height = estilo === "pracas" ? 16.5 : 15;
}

function linhaMilitar(ws: ExcelJS.Worksheet, r: number, colunas: Coluna[], valores: (string | ExcelJS.CellRichTextValue)[]) {
  valores.forEach((v, i) => {
    const cel = ws.getCell(r, i + 1);
    cel.value = v as any;
    cel.font = { name: FONTE, size: colunas[i].tam };
    cel.alignment = { horizontal: colunas[i].alinhar, vertical: "middle", wrapText: true };
    cel.border = grade;
  });
  ws.getRow(r).height = ALTURA_LINHA;
}

// "Quartel do 18º BPM..." e a assinatura do Cmt da unidade
function fecho(wb: ExcelJS.Workbook, aba: ReturnType<typeof novaAba>, r: number, op: OpcoesPlanoXlsx) {
  const { ws, colunas, larguraTotal, linhaTexto } = aba;
  const hoje = op.hoje ?? new Date();
  ws.getRow(r++).height = 14;
  linhaTexto(r++, `Quartel do 18º BPM, em Presidente Dutra-MA, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}.`,
    { size: 12, fonte: "Arial", altura: 18 });
  ws.getRow(r++).height = 10;
  const ass = carregarImagem(op.cmt.assinatura);
  ws.getRow(r).height = 48;
  ws.mergeCells(r, 1, r, colunas.length);
  if (ass) porImagem(wb, ws, colunas, ass, larguraTotal / 2, r, 2, 60);
  r++;
  linhaTexto(r++, (op.cmt.nome || "").toUpperCase() || "________________________________", { bold: true, size: 11, altura: 14 });
  linhaTexto(r++, op.cmt.cargo || "Comandante do 18º BPM", { size: 11, altura: 14 });
  ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + colunas.length)}${r - 1}`;
}

/* PRAÇAS: uma tabela por equipe, com o cabeçalho cinza em cada uma. */
function abaPracas(wb: ExcelJS.Workbook, equipes: EquipePlano[], op: OpcoesPlanoXlsx) {
  const aba = novaAba(wb, FOLHA_PRACAS, op);
  const { ws, colunas, linhaTexto, reservar } = aba;
  let r = aba.primeira;
  const blocos = equipes
    .map((e) => ({ ...e, membros: e.membros.filter((m) => !m.oficial) }))
    .filter((e) => e.membros.length);
  blocos.forEach((e, k) => {
    const ultima = k === blocos.length - 1;
    // a tabela da equipe inteira numa folha; a última vai junto com a assinatura
    reservar(r, 16.5 + e.membros.length * ALTURA_LINHA + (ultima ? FECHO : 2 * 15));
    cabecalhoTabela(ws, r++, colunas, "pracas");
    const periodo = textoPeriodos(e.periodos);
    e.membros.forEach((m, i) => {
      linhaMilitar(ws, r++, colunas, [
        String(i + 1), m.postoGrad || "-------", m.numeroBarra || "-------",
        nomeComGuerra(m.nome || "", m.nomeGuerra, colunas[3].tam), m.id || "-------", m.matricula || "-------",
        e.numero, periodo,
      ]);
    });
    // duas linhas entre uma equipe e a outra (o modelo)
    if (!ultima) { ws.getRow(r++).height = 15; ws.getRow(r++).height = 15; }
  });
  if (!blocos.length) linhaTexto(r++, "Nenhuma praça neste plano.", { italic: true, altura: 18 });
  fecho(wb, aba, r, op);
}

/* OFICIAIS: uma tabela só, em ordem de hierarquia, com a equipe de cada um. */
function abaOficiais(wb: ExcelJS.Workbook, equipes: EquipePlano[], op: OpcoesPlanoXlsx) {
  const aba = novaAba(wb, FOLHA_OFICIAIS, op);
  const { ws, colunas, linhaTexto, reservar } = aba;
  let r = aba.primeira;
  const oficiais = equipes
    .flatMap((e) => e.membros.filter((m) => m.oficial).map((m) => ({ m, equipe: e.numero })))
    .sort((a, b) => a.m.antiguidade - b.m.antiguidade);
  if (oficiais.length) {
    reservar(r, 15 + oficiais.length * ALTURA_LINHA + FECHO);
    cabecalhoTabela(ws, r++, colunas, "oficiais");
    oficiais.forEach(({ m, equipe }, i) => {
      linhaMilitar(ws, r++, colunas, [
        String(i + 1), m.postoGrad || "-------",
        nomeComGuerra(m.nome || "", m.nomeGuerra, colunas[2].tam), m.matricula || "-------", m.id || "-------", equipe,
      ]);
    });
  } else {
    linhaTexto(r++, "Nenhum oficial neste plano.", { italic: true, altura: 18 });
  }
  fecho(wb, aba, r, op);
}

export async function gerarPlanoFeriasXlsx(equipes: EquipePlano[], op: OpcoesPlanoXlsx): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIGEP — 18º BPM";
  // "oficiais e praças": as duas abas no mesmo arquivo, oficiais primeiro
  if (op.quem !== "pracas") abaOficiais(wb, equipes, op);
  if (op.quem !== "oficiais") abaPracas(wb, equipes, op);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
