import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

/* =========================================================================
   PLANO DE FÉRIAS EM EXCEL (.xlsx) — oficiais, praças ou todos.

   O papel segue o padrão dos documentos do Batalhão:
     · o MESMO cabeçalho da Escala de Serviço — 190 anos da PMMA à esquerda,
       armas do Maranhão no centro, brasão do 18º BPM à direita, e o texto da
       organização — SEM o "VISTO" do Cmt (isso é da escala do dia);
     · uma faixa por equipe com os períodos e a apresentação, e a tabela dos
       militares em ordem de hierarquia (posto, promoção, número, nome);
     · no fim, "Quartel do 18º BPM..." e a ASSINATURA DO CMT DA UNIDADE — a
       mesma imagem do VISTO da escala (Config "escala_chefe_p1".cmtAssinatura)
       com o nome do Comandante embaixo;
     · na impressão, cada equipe sai inteira numa folha, e a última equipe vai
       junto com a assinatura (que nunca fica sozinha numa página).

   As imagens vêm da mesma configuração da escala ("escala_brasoes"): trocar
   um brasão lá troca aqui também. Data URL ou arquivo em /public.

   A marca de férias ADIADAS não sai no papel — a mesma regra do "Imprimir"
   do plano: ela é aviso de tela, não informação do documento.
   ========================================================================= */

export type MembroPlano = {
  postoGrad: string | null; numeroBarra: string | null; nome: string | null;
  nomeGuerra: string | null; matricula: string | null; lotacao: string | null;
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

// colunas: as mesmas do "Imprimir" do plano, mais a lotação (Local)
const COLUNAS: { titulo: string; largura: number; alinhar: "left" | "center" }[] = [
  { titulo: "Nº", largura: 5, alinhar: "center" },
  { titulo: "POSTO/GRAD", largura: 17, alinhar: "left" },
  { titulo: "Nº/BARRA", largura: 11, alinhar: "center" },
  { titulo: "NOME", largura: 40, alinhar: "left" },
  { titulo: "NOME DE GUERRA", largura: 18, alinhar: "left" },
  { titulo: "MATRÍCULA", largura: 13, alinhar: "center" },
  { titulo: "LOCAL", largura: 24, alinhar: "left" },
];
const N = COLUNAS.length;

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
function naColuna(x: number) {
  let col = 0;
  while (col < N - 1 && x >= pxColuna(COLUNAS[col].largura)) { x -= pxColuna(COLUNAS[col].largura); col++; }
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
function porImagem(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, img: Imagem, centroX: number, linha: number, topoPt: number, altura: number) {
  const largura = Math.round((img.largura / img.altura) * altura);
  const x = Math.max(0, centroX - largura / 2);
  let y = topoPt;
  for (let i = 1; i < linha; i++) y += ws.getRow(i).height ?? 15;
  const id = wb.addImage({ buffer: img.buffer as any, extension: img.extension });
  ws.addImage(id, {
    tl: { ...naColuna(x), ...naLinha(ws, y) },
    br: { ...naColuna(x + largura), ...naLinha(ws, y + altura * 0.75) },   // 1 px = 0,75 pt
    editAs: "oneCell",
  } as any);
}

/* ---------------------------------------------------------------- planilha */

const TITULO_QUEM: Record<QuemPlano, string> = { oficiais: "OFICIAIS", pracas: "PRAÇAS", todos: "OFICIAIS E PRAÇAS" };

export function textoPeriodos(periodos: PeriodoPlano[]): string {
  const ps = periodos.filter((p) => p.inicio && p.inicio !== "—");
  if (!ps.length) return "períodos a definir";
  return ps.map((p) => {
    const apres = p.apres && p.apres !== "—" ? ` (apres. ${p.apres})` : "";
    return `${ps.length > 1 ? `${p.rotulo}: ` : ""}${p.inicio} a ${p.fim}${apres}`;
  }).join("   ·   ");
}

export async function gerarPlanoFeriasXlsx(equipes: EquipePlano[], op: OpcoesPlanoXlsx): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIGEP — 18º BPM";
  const ws = wb.addWorksheet(`Plano de Férias ${op.ano}`.slice(0, 31), {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  COLUNAS.forEach((c, i) => { ws.getColumn(i + 1).width = c.largura; });
  const larguraTotal = COLUNAS.reduce((s, c) => s + pxColuna(c.largura), 0);

  const linhaTexto = (r: number, texto: string, opt: { bold?: boolean; size?: number; underline?: boolean; altura?: number; alinhar?: "center" | "right" | "left"; italic?: boolean } = {}) => {
    ws.mergeCells(r, 1, r, N);
    const c = ws.getCell(r, 1);
    c.value = texto;
    c.font = { name: FONTE, size: opt.size ?? 10, bold: !!opt.bold, underline: !!opt.underline, italic: !!opt.italic };
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
  if (ma) porImagem(wb, ws, ma, larguraTotal / 2, 1, 3, 56);
  if (pmma) porImagem(wb, ws, pmma, 58, 2, 4, 84);
  if (bpm) porImagem(wb, ws, bpm, larguraTotal - 52, 2, 4, 84);

  // ---- título ----
  let r = 10;
  ws.getRow(9).height = 8;
  linhaTexto(r++, `PLANO DE FÉRIAS — ${op.ano}`, { bold: true, size: 14, underline: true, altura: 22 });
  linhaTexto(r++, TITULO_QUEM[op.quem], { bold: true, size: 11, altura: 16 });
  ws.getRow(r++).height = 8;

  /* ---- quebra de página: uma equipe não se parte entre duas folhas ----
     (o mesmo do "Imprimir" do plano, que usa break-inside: avoid). Na folha
     A4 em pé, com a redução do "ajustar à largura", cabem `porPagina` pontos
     de linhas; 5% de folga para a diferença de medida entre os programas. */
  const reducao = Math.min(1, (595.28 - 2 * 0.35 * 72) / (larguraTotal * 0.75));
  const porPagina = ((841.89 - (0.4 + 0.5) * 72) / reducao) * 0.95;
  let usado = 0;
  for (let i = 1; i < r; i++) usado += ws.getRow(i).height ?? 15;
  // o bloco de `altura` pontos que começa na linha r não cabe? quebra antes dela
  const reservar = (altura: number) => {
    if (usado > 0 && usado + altura > porPagina) { ws.getRow(r - 1).addPageBreak(); usado = 0; }
    usado = (usado + altura) % porPagina;
  };
  // nome comprido quebra em duas linhas: a altura acompanha
  const alturaLinha = (valores: string[]) =>
    Math.max(14, Math.max(...valores.map((v, i) => Math.ceil(v.length / Math.max(4, COLUNAS[i].largura * 1.15)))) * 12 + 2);

  // data + assinatura + nome + cargo do Cmt (as alturas das linhas do fecho)
  const FECHO = 10 + 16 + 10 + 48 + 14 + 14;

  // ---- uma faixa por equipe, a tabela dos militares embaixo ----
  // (equipe sem ninguém deste recorte não sai)
  const comMembros = equipes.filter((e) => e.membros.length);
  let total = 0;
  for (const e of comMembros) {
    const linhas = e.membros.map((m, k) =>
      [`${k + 1}º`, m.postoGrad || "—", m.numeroBarra || "—", m.nome || "—", m.nomeGuerra || "", m.matricula || "—", m.lotacao || "—"]);
    // a última equipe vai junto com o total e o fecho: a assinatura do Cmt
    // não fica sozinha numa folha
    const ultima = e === comMembros[comMembros.length - 1];
    reservar(18 + 15 + linhas.reduce((s, v) => s + alturaLinha(v), 0) + 8 + (ultima ? 14 + FECHO : 0));

    ws.mergeCells(r, 1, r, N);
    const faixa = ws.getCell(r, 1);
    faixa.value = `EQUIPE ${e.numero}   —   ${textoPeriodos(e.periodos)}   —   ${e.membros.length} militar(es)`;
    faixa.font = { name: FONTE, size: 10, bold: true };
    faixa.alignment = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
    faixa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    faixa.border = grade;
    ws.getRow(r).height = 18;
    r++;

    COLUNAS.forEach((c, i) => {
      const cel = ws.getCell(r, i + 1);
      cel.value = c.titulo;
      cel.font = { name: FONTE, size: 9, bold: true };
      cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      cel.border = grade;
    });
    ws.getRow(r).height = 15;
    r++;

    for (const valores of linhas) {
      valores.forEach((v, i) => {
        const cel = ws.getCell(r, i + 1);
        cel.value = v;
        cel.font = { name: FONTE, size: 9 };
        cel.alignment = { horizontal: COLUNAS[i].alinhar, vertical: "middle", wrapText: true };
        cel.border = grade;
      });
      ws.getRow(r).height = alturaLinha(valores);
      r++;
    }
    total += e.membros.length;
    ws.getRow(r++).height = 8;
  }

  if (!total) {
    reservar(18 + FECHO);
    linhaTexto(r++, "Nenhum militar neste recorte do plano.", { italic: true, altura: 18 });
  } else {
    linhaTexto(r++, `Total: ${total} militar(es)`, { bold: true, size: 9, alinhar: "right", altura: 14 });
  }

  // ---- fecho e assinatura do Cmt da unidade ----
  const hoje = op.hoje ?? new Date();
  ws.getRow(r++).height = 10;
  linhaTexto(r++, `Quartel do 18º BPM, em Presidente Dutra-MA, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}.`,
    { size: 10, alinhar: "right", altura: 16 });
  ws.getRow(r++).height = 10;

  const ass = carregarImagem(op.cmt.assinatura);
  ws.getRow(r).height = 48;
  ws.mergeCells(r, 1, r, N);
  if (ass) porImagem(wb, ws, ass, larguraTotal / 2, r, 2, 60);
  r++;
  linhaTexto(r++, (op.cmt.nome || "").toUpperCase() || "________________________________", { bold: true, size: 10, altura: 14 });
  linhaTexto(r++, op.cmt.cargo || "Comandante do 18º BPM", { size: 10, altura: 14 });

  ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + N)}${r - 1}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
