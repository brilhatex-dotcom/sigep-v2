"use client";

import { useMemo, useState } from "react";
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

type Coluna = {
  key: keyof MilitarLinha | "rank";
  label: string;
  filtro: boolean;
  tipo?: "texto" | "select";
};

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
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function corSituacao(s: string | null): string {
  const v = semAcento(s ?? "");
  if (v.includes("pronto")) return "bg-emerald-100 text-emerald-700";
  if (v.includes("jms")) return "bg-red-100 text-red-700";
  if (v.includes("feria")) return "bg-blue-100 text-blue-700";
  if (v.includes("licenca") || v === "lp" || v === "ltip")
    return "bg-amber-100 text-amber-700";
  if (v.includes("atestado")) return "bg-orange-100 text-orange-700";
  if (v.includes("adido")) return "bg-indigo-100 text-indigo-700";
  if (v.includes("reserva")) return "bg-gray-200 text-gray-600";
  return "bg-slate-100 text-slate-600";
}

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function AntiguidadeTabela({
  militares,
}: {
  militares: MilitarLinha[];
}) {
  const router = useRouter();

  // antiguidade ja vem ordenada do servidor; o rank e a posicao na lista cheia
  const comRank = useMemo(
    () => militares.map((m, i) => ({ ...m, rank: i + 1 })),
    [militares]
  );

  const [filtros, setFiltros] = useState<Record<string, string>>({});

  // resumo de quantidades por patente (ordem hierarquica)
  const resumo = useMemo(() => {
    const cont = new Map<number, number>();
    comRank.forEach((m) => {
      const o = classificarPatente(m.postoGrad).ordem;
      cont.set(o, (cont.get(o) ?? 0) + 1);
    });
    return PATENTES.filter((p) => (cont.get(p.ordem) ?? 0) > 0).map((p) => ({
      rotulo: p.rotulo,
      qtd: cont.get(p.ordem) ?? 0,
    }));
  }, [comRank]);

  // situacoes distintas para o dropdown
  const situacoes = useMemo(() => {
    const set = new Set<string>();
    comRank.forEach((m) => {
      if (m.situacao && m.situacao.trim()) set.add(m.situacao.trim());
    });
    return Array.from(set).sort();
  }, [comRank]);

  const filtrados = useMemo(() => {
    return comRank.filter((m) => {
      for (const col of COLUNAS) {
        if (!col.filtro) continue;
        const termo = (filtros[col.key as string] ?? "").trim();
        if (!termo) continue;
        const valor = String((m as Record<string, unknown>)[col.key] ?? "");
        if (col.tipo === "select") {
          if (valor !== termo) return false;
        } else {
          if (!semAcento(valor).includes(semAcento(termo))) return false;
        }
      }
      return true;
    });
  }, [comRank, filtros]);

  function mudarFiltro(key: string, valor: string) {
    setFiltros((f) => ({ ...f, [key]: valor }));
  }

  function limpar() {
    setFiltros({});
  }

  const temFiltro = Object.values(filtros).some((v) => v && v.trim());

  function exportarCsv() {
    const cab = ["#", ...CHAVES_EXPORT.map((c) => c.label)];
    const linhas = filtrados.map((m) => [
      m.rank,
      ...CHAVES_EXPORT.map((c) => m[c.key] ?? ""),
    ]);
    const esc = (v: unknown) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[";\n]/.test(s) ? `"${s}"` : s;
    };
    const csv =
      "\uFEFF" +
      [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "efetivo-antiguidade.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() {
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const ths = ["#", ...CHAVES_EXPORT.map((c) => c.label)]
      .map((h) => `<th>${escHtml(h)}</th>`)
      .join("");
    const trs = filtrados
      .map((m) => {
        const tds = [m.rank, ...CHAVES_EXPORT.map((c) => m[c.key] ?? "")]
          .map((v) => `<td>${escHtml(v)}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Efetivo por Antiguidade - 18 BPM</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0b1f3a;padding:24px;}
        h1{font-size:16px;margin:0;}
        .sub{font-size:11px;color:#555;margin:2px 0 16px;}
        table{width:100%;border-collapse:collapse;font-size:10px;}
        th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;}
        th{background:#0b1f3a;color:#fff;}
        tr:nth-child(even) td{background:#f4f6fa;}
        @media print{ @page{ size:landscape; margin:12mm; } }
      </style></head><body>
      <h1>18&ordm; BPM &mdash; Efetivo por Antiguidade</h1>
      <p class="sub">Emitido em ${dataStr} &middot; ${filtrados.length} militares${
      temFiltro ? " (filtro aplicado)" : ""
    }</p>
      <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div className="space-y-4">
      {/* Resumo por patente */}
      <div className="flex flex-wrap gap-2">
        {resumo.map((r) => (
          <span
            key={r.rotulo}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs shadow-sm ring-1 ring-gray-100"
          >
            <span className="text-gray-600">{r.rotulo}</span>
            <span className="font-bold text-sigep-navy">{r.qtd}</span>
          </span>
        ))}
      </div>

      {/* Barra de acoes */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-sigep-navy">
            {filtrados.length}
          </span>{" "}
          de {comRank.length} militares
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {temFiltro && (
            <button
              onClick={limpar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <FilterX className="h-4 w-4" /> Limpar filtros
            </button>
          )}
          <button
            onClick={exportarCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={imprimir}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sigep-navy px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sigep-azul"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500">
              {COLUNAS.map((c) => (
                <th key={c.key as string} className="px-3 py-2.5 font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-100 bg-sigep-cinza/40">
              {COLUNAS.map((c) => (
                <th key={c.key as string} className="px-2 py-1.5">
                  {c.filtro &&
                    (c.tipo === "select" ? (
                      <select
                        value={filtros[c.key as string] ?? ""}
                        onChange={(e) =>
                          mudarFiltro(c.key as string, e.target.value)
                        }
                        className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs font-normal text-gray-700 outline-none focus:border-sigep-dourado"
                      >
                        <option value="">Todas</option>
                        {situacoes.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={filtros[c.key as string] ?? ""}
                        onChange={(e) =>
                          mudarFiltro(c.key as string, e.target.value)
                        }
                        placeholder="filtrar"
                        className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs font-normal text-gray-700 outline-none focus:border-sigep-dourado"
                      />
                    ))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map((m) => (
              <tr key={m.id} className="hover:bg-sigep-cinza/50">
                <td className="px-3 py-2 text-gray-400">{m.rank}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {m.postoGrad ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.numeroBarra ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() =>
                      router.push(`/efetivo/${encodeURIComponent(m.id)}`)
                    }
                    className="text-left font-medium text-sigep-navy hover:underline"
                  >
                    {m.nome ?? "—"}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.nomeGuerra ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.matricula ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.id}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.rg ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.cpf ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${corSituacao(
                      m.situacao
                    )}`}
                  >
                    {m.situacao && m.situacao.trim() ? m.situacao : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {m.lotacao ?? "—"}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td
                  colSpan={COLUNAS.length}
                  className="px-4 py-10 text-center text-gray-400"
                >
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
