import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, HeadingLevel, PageOrientation,
} from "docx";

export const dynamic = "force-dynamic";

/* POST /api/relatorios/docx
   { titulo, legenda, colunas: string[], linhas: string[][], larguras?: number[] }
   -> devolve o relatório em .docx para download.

   As linhas vêm prontas da tela, e não são recalculadas aqui de propósito: o
   documento tem que sair exatamente igual à prévia que o P/1 conferiu antes
   de clicar. Recalcular no servidor abriria espaço para o Word sair diferente
   do que estava na tela. */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "666666" };
const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };

function celula(texto: string, opt: { cabecalho?: boolean; largura?: number } = {}) {
  return new TableCell({
    borders: BORDAS,
    shading: opt.cabecalho ? { fill: "E8E2CE" } : undefined,
    width: opt.largura ? { size: opt.largura, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      children: [new TextRun({ text: texto || "—", bold: opt.cabecalho, size: opt.cabecalho ? 17 : 16 })],
    })],
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const titulo = String(b?.titulo || "Relatório").slice(0, 120);
    const legenda = String(b?.legenda || "").slice(0, 300);
    const colunas: string[] = Array.isArray(b?.colunas) ? b.colunas.map((c: any) => String(c)) : [];
    const linhas: string[][] = Array.isArray(b?.linhas)
      ? b.linhas.map((l: any) => (Array.isArray(l) ? l.map((c: any) => String(c ?? "")) : []))
      : [];
    const larguras: number[] = Array.isArray(b?.larguras) ? b.larguras.map((n: any) => Number(n) || 12) : [];

    if (!colunas.length) {
      return NextResponse.json({ error: "Nenhuma coluna no relatório." }, { status: 400 });
    }

    // normaliza as larguras para somar 100% (a numeração ocupa 4%)
    const soma = larguras.reduce((a, n) => a + n, 0) || colunas.length;
    const pct = colunas.map((_, i) => Math.max(4, Math.round(((larguras[i] || 12) / soma) * 96)));

    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    /* Muita coluna não cabe em pé. A partir de 7 o documento vira paisagem
       sozinho — melhor que entregar uma tabela espremida ou cortada. */
    const paisagem = colunas.length >= 7;

    const tabela = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        ...BORDAS,
        insideHorizontal: BORDA,
        insideVertical: BORDA,
      },
      rows: [
        new TableRow({
          tableHeader: true, // repete o cabeçalho em toda página
          children: [
            celula("#", { cabecalho: true, largura: 4 }),
            ...colunas.map((c, i) => celula(c, { cabecalho: true, largura: pct[i] })),
          ],
        }),
        ...linhas.map((l, idx) => new TableRow({
          children: [
            celula(String(idx + 1), { largura: 4 }),
            ...colunas.map((_, i) => celula(l[i] ?? "", { largura: pct[i] })),
          ],
        })),
      ],
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: paisagem ? { orientation: PageOrientation.LANDSCAPE } : undefined,
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "POLÍCIA MILITAR DO MARANHÃO", size: 18 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [new TextRun({ text: "18º BATALHÃO DE POLÍCIA MILITAR", size: 18, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 60 },
            children: [new TextRun({ text: titulo.toUpperCase(), bold: true, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: `${legenda} — ${linhas.length} militar(es)`, italics: true, size: 17, color: "555555" })],
          }),
          tabela,
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240 },
            children: [new TextRun({ text: `Emitido pelo SIGEP em ${hoje}`, size: 15, color: "777777" })],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="relatorio.docx"`,
      },
    });
  } catch (err) {
    console.error("[POST /api/relatorios/docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
