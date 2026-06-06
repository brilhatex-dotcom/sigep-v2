"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PATENTES, classificarPatente } from "@/lib/patentes";
import { FileSpreadsheet, Printer, FilterX } from "lucide-react";

export type MilitarLinha = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  rg: string | null;
  cpf: string | null;
  situacao: string | null;
  lotacao: string | null;
};

type Coluna = { key: keyof MilitarLinha | "rank"; label: string; filtro: boolean; tipo?: "texto" | "select" };

const COLUNAS: Coluna[] = [
  { key: "rank", label: "#", filtro: false },
  { key: "postoGrad", label: "Posto/Grad", filtro: true },
  { key: "numeroBarra", label: "Nº/Barra", filtro: true },
  { key: "nome", label: "Nome", filtro: true },
  { key: "nomeGuerra", label: "Nome de Guerra", filtro: true },
  { key: "matricula", label: "Matrícula", filtro: true },
  { key: "id", label: "ID", filtro: true },
  { key: "rg", label: "RG", filtro: true },
  { key: "cpf", label: "CPF", filtro: true },
  { key: "situacao", label: "Situação", filtro: true, tipo: "select" },
  { key: "lotacao", label: "Lotação", filtro: true },
];

const CHAVES_EXPORT: { key: keyof MilitarLinha; label: string }[] = [
  { key: "postoGrad", label: "Posto/Grad" },
  { key: "numeroBarra", label: "Nº/Barra" },
  { key: "nome", label: "Nome" },
  { key: "nomeGuerra", label: "Nome de Guerra" },
  { key: "matricula", label: "Matrícula" },
  { key: "id", label: "ID" },
  { key: "rg", label: "RG" },
  { key: "cpf", label: "CPF" },
  { key: "situacao", label: "Situação" },
  { key: "lotacao", label: "Lotação" },
];

function semAcento(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function corSituacao(s: string | null): string {
  const v = semAcento(s ?? "");
  if (v.includes("pronto")) return "bg-emerald-500/15 text-emerald-300";
  if (v.includes("jms")) return "bg-red-500/15 text-red-300";
  if (v.includes("feria")) return "bg-sky-500/15 text-sky-300";
  if (v.includes("licenca") || v === "lp" || v === "ltip") return "bg-amber-500/15 text-amber-300";
  if (v.includes("reserva")) return "bg-white/10 text-[#94A3B8]";
  return "bg-white/5 text-[#94A3B8]";
}

function escHtml(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function AntiguidadeTabela({
  militares,
  postoInicial = "",
}: {
  militares: MilitarLinha[];
  postoInicial?: string;
}) {
  const router = useRouter();
  const comRank = useMemo(() => militares.map((m, i) => ({ ...m, rank: i + 1 })), [militares]);
  const [filtros, setFiltros] = useState<Record<string, string>>(
    postoInicial ? { postoGrad: postoInicial } : {}
  );

  const resumo = useMemo(() => {
    const cont = new Map<number, number>();
    comRank.forEach((m) => {
      const o = classificarPatente(m.postoGrad).ordem;
      cont.set(o, (cont.get(o) ?? 0) + 1);
    });
    return PATENTES.filter((p) => (cont.get(p.ordem) ?? 0) > 0).map((p) => ({
      rotulo: p.rotulo, qtd: cont.get(p.ordem) ?? 0,
    }));
  }, [comRank]);

  const situacoes = useMemo(() => {
    const set = new Set<string>();
    comRank.forEach((m) => { if (m.situacao && m.situacao.trim()) set.add(m.situacao.trim()); });
    return Array.from(set).sort();
  }, [comRank]);

  const filtrados = useMemo(() => {
    return comRank.filter((m) => {
      for (const col of COLUNAS) {
        if (!col.filtro) continue;
        const termo = (filtros[col.key as string] ?? "").trim();
        if (!termo) continue;
        const valor = String((m as Record<string, unknown>)[col.key] ?? "");
        if (col.tipo === "select") { if (valor !== termo) return false; }
        else { if (!semAcento(valor).includes(semAcento(termo))) return false; }
      }
      return true;
    });
  }, [comRank, filtros]);

  function mudarFiltro(key: string, valor: string) { setFiltros((f) => ({ ...f, [key]: valor })); }
  function limpar() { setFiltros({}); }
  const temFiltro = Object.values(filtros).some((v) => v && v.trim());

  function exportarCsv() {
    const cab = ["#", ...CHAVES_EXPORT.map((c) => c.label)];
    const linhas = filtrados.map((m) => [m.rank, ...CHAVES_EXPORT.map((c) => m[c.key] ?? "")]);
    const esc = (v: unknown) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[";\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = "\uFEFF" + [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "efetivo-antiguidade.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() {
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const ths = ["#", ...CHAVES_EXPORT.map((c) => c.label)].map((h) => `<th>${escHtml(h)}</th>`).join("");
    const trs = filtrados.map((m) => {
      const tds = [m.rank, ...CHAVES_EXPORT.map((c) => m[c.key] ?? "")].map((v) => `<td>${escHtml(v)}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Efetivo por Antiguidade - 18 BPM</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0b1f3a;padding:24px;}
        h1{font-size:16px;margin:0;} .sub{font-size:11px;color:#555;margin:2px 0 16px;}
        table{width:100%;border-collapse:collapse;font-size:10px;}
        th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;}
        th{background:#0b1f3a;color:#fff;} tr:nth-child(even) td{background:#f4f6fa;}
        @media print{ @page{ size:landscape; margin:12mm; } }
      </style></head><body>
      <h1>18&ordm; BPM &mdash; Efetivo por Antiguidade</h1>
      <p class="sub">Emitido em ${dataStr} &middot; ${filtrados.length} militares${temFiltro ? " (filtro aplicado)" : ""}</p>
      <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {resumo.map((r) => (
          <button
            key={r.rotulo}
            onClick={() => mudarFiltro("postoGrad", filtros.postoGrad === r.rotulo ? "" : r.rotulo)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 transition ${
              filtros.postoGrad === r.rotulo
                ? "bg-[#D4AF37] text-[#1a1205] ring-transparent"
                : "bg-[#0F1B2D] text-[#94A3B8] ring-white/10 hover:text-white"
            }`}
          >
            {r.rotulo}
            <span className={`font-bold ${filtros.postoGrad === r.rotulo ? "text-[#1a1205]" : "text-white"}`}>{r.qtd}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[#94A3B8]">
          <span className="font-semibold text-white">{filtrados.length}</span> de {comRank.length} militares
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {temFiltro && (
            <button onClick={limpar} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white">
              <FilterX className="h-4 w-4" /> Limpar
            </button>
          )}
          <button onClick={exportarCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:border-emerald-500/40 hover:text-white">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button onClick={imprimir} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-medium text-[#1a1205] transition hover:brightness-110">
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#0F1B2D]">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#0F1B2D]">
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-[#94A3B8]">
              {COLUNAS.map((c) => (
                <th key={c.key as string} className="px-3 py-2.5 font-semibold">{c.label}</th>
              ))}
            </tr>
            <tr className="border-b border-white/10 bg-white/5">
              {COLUNAS.map((c) => (
                <th key={c.key as string} className="px-2 py-1.5">
                  {c.filtro && (c.tipo === "select" ? (
                    <select
                      value={filtros[c.key as string] ?? ""}
                      onChange={(e) => mudarFiltro(c.key as string, e.target.value)}
                      className="w-full rounded border border-white/10 bg-[#0b1626] px-1.5 py-1 text-xs font-normal text-white outline-none focus:border-[#D4AF37]/50"
                    >
                      <option value="">Todas</option>
                      {situacoes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input
                      value={filtros[c.key as string] ?? ""}
                      onChange={(e) => mudarFiltro(c.key as string, e.target.value)}
                      placeholder="filtrar"
                      className="w-full rounded border border-white/10 bg-[#0b1626] px-1.5 py-1 text-xs font-normal text-white placeholder-[#94A3B8] outline-none focus:border-[#D4AF37]/50"
                    />
                  ))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtrados.map((m) => (
              <tr key={m.id} className="hover:bg-white/5">
                <td className="px-3 py-2 text-[#94A3B8]">{m.rank}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.postoGrad ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.numeroBarra ?? "—"}</td>
                <td className="px-3 py-2">
                  <button onClick={() => router.push(`/efetivo/${encodeURIComponent(m.id)}`)} className="text-left font-medium text-white hover:text-[#D4AF37]">
                    {m.nome ?? "—"}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.nomeGuerra ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.matricula ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.id}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.rg ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.cpf ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${corSituacao(m.situacao)}`}>
                    {m.situacao && m.situacao.trim() ? m.situacao : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.lotacao ?? "—"}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-4 py-10 text-center text-[#94A3B8]">
                  Nenhum militar encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
