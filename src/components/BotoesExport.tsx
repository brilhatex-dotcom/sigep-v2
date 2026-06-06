"use client";

import { Download, FileSpreadsheet, Printer, FileText } from "lucide-react";

// Exporta dados de tabela sem bibliotecas:
// - CSV: gera arquivo .csv (separador ;)
// - Excel: gera .xls via tabela HTML (abre no Excel)
// - PDF: usa a impressao do navegador (Salvar como PDF)
export default function BotoesExport({
  nomeArquivo,
  colunas,
  linhas,
}: {
  nomeArquivo: string;
  colunas: string[];
  linhas: (string | number)[][];
}) {
  function baixar(conteudo: string, ext: string, mime: string) {
    const blob = new Blob(["\ufeff" + conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const txt = [colunas.map(esc).join(";"), ...linhas.map((l) => l.map(esc).join(";"))].join("\n");
    baixar(txt, "csv", "text/csv;charset=utf-8");
  }

  function excel() {
    const th = colunas.map((c) => `<th>${c}</th>`).join("");
    const trs = linhas
      .map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("");
    const html = `<table border="1"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    baixar(html, "xls", "application/vnd.ms-excel");
  }

  return (
    <div className="flex items-center gap-1 print:hidden">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
        title="Imprimir / PDF"
      >
        <Printer className="h-3.5 w-3.5" /> PDF
      </button>
      <button
        onClick={excel}
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#94A3B8] transition hover:border-[#22C55E]/40 hover:text-white"
        title="Exportar Excel"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </button>
      <button
        onClick={csv}
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#94A3B8] transition hover:border-sky-500/40 hover:text-white"
        title="Exportar CSV"
      >
        <FileText className="h-3.5 w-3.5" /> CSV
      </button>
    </div>
  );
}
