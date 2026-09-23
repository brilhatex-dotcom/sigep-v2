import path from "path";
import ExcelJS from "exceljs";
import { COLUNAS, type LinhaPlanilha } from "@/lib/planilhaPadrao";

/* =========================================================================
   A PLANILHA PADRÃO EM .XLSX — preenchida DENTRO do modelo oficial.

   O arquivo de partida é o próprio "TABELA-PADRÃO" que a CPPPM mandou
   (public/templates/planilha_padrao_promocao.xlsx), e não uma planilha
   montada do zero parecida com ele. A Comissão consolida a planilha de todas
   as unidades numa aba só (art. 3º, § 2º): colunas fora de ordem, título
   diferente ou cabeçalho mexido viram retrabalho lá — ou devolução.

   O que se mexe no modelo, e só isso:
     · "XXXX BATALHÃO" vira "18º BATALHÃO" (como na planilha de agosto/2026);
     · as linhas de exemplo (Francisco de Tal, Fulano de Tal) saem, e entram
       os militares, a partir da linha 8, na ordem de antiguidade;
     · o termo de assinatura ("Quartel em cidade - MA, xx de mês...") desce
       para logo depois da última linha, já com local, data e o Chefe do P/1;
     · borda fina nas células e cabeçalho em negrito. O modelo não tem borda
       nenhuma: ele conta com a "grade de impressão" ligada, que só aparece no
       papel. Na tela, duzentas linhas sem borda não se conferem.
   ========================================================================= */

const MODELO = path.join(process.cwd(), "public", "templates", "planilha_padrao_promocao.xlsx");
const LINHA_CABECALHO = 7;
const PRIMEIRA_LINHA = 8;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const fina = { style: "thin" as const, color: { argb: "FF000000" } };
const grade = { top: fina, left: fina, bottom: fina, right: fina };

/* Quantas linhas um texto ocupa numa coluna, quebrando por PALAVRA.

   A primeira versao dividia o total de caracteres pela largura e errava para
   menos: "ENSINO MÉDIO COMPLETO" cabe em 2 linhas contando letras, mas a
   quebra e por palavra e da 3 ("ENSINO" / "MÉDIO" / "COMPLETO") — e o texto
   saia cortado em cima e embaixo. Aqui a quebra e simulada do mesmo jeito
   que o Excel faz. */
export function linhasOcupadas(texto: string, cabem: number): number {
  let total = 0;
  for (const paragrafo of texto.split("\n")) {
    let linhas = 1, atual = 0;
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tam = palavra.length;
      if (atual === 0) { atual = tam; }
      else if (atual + 1 + tam <= cabem) { atual += 1 + tam; }
      else { linhas++; atual = tam; }
      // palavra maior que a coluna quebra no meio
      while (atual > cabem) { linhas++; atual -= cabem; }
    }
    total += linhas;
  }
  return Math.max(1, total);
}

/* O Excel não ajusta sozinho a altura de linha com texto quebrado quando o
   arquivo é gerado fora dele: sem isto o texto longo saía cortado numa linha
   de altura fixa. */
function alturaDaLinha(ws: ExcelJS.Worksheet, valores: string[]): number {
  let linhas = 1;
  valores.forEach((v, i) => {
    if (!v) return;
    const largura = ws.getColumn(i + 1).width || 8.43;
    // Times New Roman 10 e mais estreita que a fonte-padrao da unidade de largura
    const cabem = Math.max(3, Math.floor(largura * 1.1));
    linhas = Math.max(linhas, linhasOcupadas(v, cabem));
  });
  return Math.min(409, Math.max(15.75, linhas * 12.75 + 3));
}

/* Como a Unidade preenche (planilha de agosto/2026): matrícula, ID, QPMP e as
   quantidades são NÚMERO, e a inclusão é DATA de verdade — dá para ordenar e
   filtrar no Excel, e a Comissão consolida sem "número armazenado como
   texto". Texto com zero à esquerda continua texto (senão o zero some). */
const NUMERICAS = new Set(["mat", "id", "qpmp", "elogios", "medalhas"]);
export function valorDaCelula(chave: string, v: string): string | number | Date {
  if (NUMERICAS.has(chave) && /^(0|[1-9]\d{0,14})$/.test(v)) return Number(v);
  if (chave === "incl") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    // meia-noite UTC: o Excel não tem fuso, e a data não pode "voltar um dia"
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
  return v;
}

// texto corrido à esquerda; o resto centralizado, como na planilha da Unidade
const A_ESQUERDA = new Set(["nome", "cursos", "promCabo", "prom3", "prom2", "prom1", "cefc", "cefs", "cap", "eap", "conceito"]);

export type Assinante = { nome: string; cargo: string };

export async function gerarPlanilhaXlsx(
  linhas: LinhaPlanilha[],
  assinante: Assinante,
  hoje = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(MODELO);
  const ws = wb.getWorksheet("RESUMO") || wb.worksheets[0];

  // ---- cabeçalho: só o nome da unidade muda ----
  const a1 = ws.getCell("A1");
  a1.value = String(a1.value ?? "").replace(/X+\s*BATALH[ÃA]O/i, "18º BATALHÃO");

  // ---- guarda o estilo do termo de assinatura antes de mexer nas linhas ----
  const estiloTermo = { ...ws.getCell("A26").style };
  try { ws.unMergeCells("A26:X29"); } catch { /* modelo sem o termo mesclado */ }

  /* ---- LIMPA da linha 8 até o fim, célula por célula ----

     Não usar ws.spliceRows aqui. Ele foi a primeira tentativa, e deixou para
     trás as linhas de exemplo ("3SGT", "SD"...) e — pior — o termo-modelo
     inteiro, "Quartel em cidade - MA, xx de mês de 2026 / CAP QOPM CICRANO
     DE TAL DOS AZOIS", embaixo da planilha de verdade. Num documento que vai
     assinado para a Comissão. A conferência que pegou isso foi abrir o
     arquivo gerado e OLHAR; ler as células esperadas não pegava, porque o
     lixo estava justamente nas células que ninguém esperava.

     O modelo declara 1006 linhas; são 24 colunas. Limpar tudo é barato e não
     depende de a biblioteca acertar o deslocamento de linhas. */
  const ultima = ws.rowCount;
  for (let r = PRIMEIRA_LINHA; r <= ultima; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= COLUNAS.length; c++) {
      const cel = row.getCell(c);
      cel.value = null;
      cel.style = {};
    }
    row.height = 15.75;
  }

  // ---- cabeçalho da tabela: negrito e grade, títulos intocados ----
  const cab = ws.getRow(LINHA_CABECALHO);
  for (let c = 1; c <= COLUNAS.length; c++) {
    const cel = cab.getCell(c);
    cel.font = { name: "Times New Roman", size: 10, bold: true };
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cel.border = grade;
  }

  // ---- os militares, na ordem de antiguidade que já veio montada ----
  linhas.forEach((l, i) => {
    const valores = COLUNAS.map((c) => l.celulas[c.chave]?.valor ?? "");
    const row = ws.getRow(PRIMEIRA_LINHA + i);
    valores.forEach((v, c) => {
      const chave = COLUNAS[c].chave;
      const cel = row.getCell(c + 1);
      cel.value = valorDaCelula(chave, v);
      if (chave === "incl" && cel.value instanceof Date) cel.numFmt = "dd/mm/yyyy";
      cel.font = { name: "Times New Roman", size: 10 };
      cel.alignment = { horizontal: A_ESQUERDA.has(chave) ? "left" : "center", vertical: "middle", wrapText: true };
      cel.border = grade;
    });
    row.height = alturaDaLinha(ws, valores);
  });

  /* ---- termo de assinatura, COLADO na última linha ----
     Sem linha em branco no meio: o modelo imprime as LINHAS DE GRADE (é
     assim que ele tem grade sem ter borda), e uma linha vazia entre a
     tabela e o termo saía gradeada no papel, parecendo um militar faltando. */
  const ini = PRIMEIRA_LINHA + linhas.length;
  const data = `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  ws.mergeCells(ini, 1, ini + 3, COLUNAS.length);
  const termo = ws.getCell(ini, 1);
  termo.value =
    `Quartel do 18º BPM, em Presidente Dutra - MA, ${data}.\n\n` +
    `${(assinante.nome || "________________________________").toUpperCase()}\n` +
    `${assinante.cargo || "Chefe do P/1 do 18º BPM"}\n`;
  termo.style = { ...estiloTermo, alignment: { horizontal: "center", vertical: "middle", wrapText: true } };
  for (let r = ini; r <= ini + 3; r++) ws.getRow(r).height = 18;

  // ---- 200 linhas: o cabeçalho fica parado na tela e se repete na impressão ----
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: LINHA_CABECALHO }];
  ws.pageSetup.printTitlesRow = `${LINHA_CABECALHO}:${LINHA_CABECALHO}`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
