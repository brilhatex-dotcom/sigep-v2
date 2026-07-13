"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, ChevronRight, Pencil, Printer, Filter, CheckSquare } from "lucide-react";

/* Um militar esta "afastado" quando a situacao nao e disponivel (pronto/apto).
   Vale para qualquer afastamento (ferias, licenca, JMS, curso, missao...). */
function ehAfastado(s: string | null): boolean {
  const v = (s ?? "").toLowerCase().trim();
  if (!v || v === "—" || v === "-") return false;
  if (v.includes("pronto") || v.includes("apto") || v.includes("disponí") || v.includes("disponi")) return false;
  return true;
}

export type MilLot = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  situacao: string | null;
};
export type GrupoLot = { lotacao: string; lista: MilLot[] };

function escHtml(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function corSituacao(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("pronto")) return "bg-emerald-500/15 text-emerald-300";
  if (v.includes("jms")) return "bg-red-500/15 text-red-300";
  if (v.includes("féria") || v.includes("feria")) return "bg-sky-500/15 text-sky-300";
  if (v.includes("licen") || v === "lp" || v === "ltip") return "bg-amber-500/15 text-amber-300";
  if (v.includes("reserva")) return "bg-white/10 text-[#94A3B8]";
  return "bg-white/5 text-[#94A3B8]";
}

export default function LotacaoLista({
  grupos,
  totalMil,
  isAdmin,
}: {
  grupos: GrupoLot[];
  totalMil: number;
  isAdmin: boolean;
}) {
  const [filtro, setFiltro] = useState<string>("");           // "" = mostra todas na tela
  const [sel, setSel] = useState<Set<string>>(() => new Set(grupos.map((g) => g.lotacao)));
  const [painel, setPainel] = useState(false);

  const toggle = (lot: string) => setSel((s) => { const n = new Set(s); n.has(lot) ? n.delete(lot) : n.add(lot); return n; });
  const marcarTodas = () => setSel(new Set(grupos.map((g) => g.lotacao)));
  const limparTodas = () => setSel(new Set());

  const visiveis = filtro ? grupos.filter((g) => g.lotacao === filtro) : grupos;

  function imprimir() {
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const escolhidos = (() => { const u = grupos.filter((g) => sel.has(g.lotacao)); return u.length ? u : grupos; })();
    const totalImpresso = escolhidos.reduce((n, g) => n + g.lista.length, 0);
    const blocos = escolhidos
      .map((g) => {
        const linhas = g.lista
          .map((m, i) => {
            const tds = [
              i + 1,
              m.postoGrad ?? "",
              m.numeroBarra ?? "",
              m.nome ?? "",
              m.nomeGuerra ?? "",
              m.matricula ?? "",
              m.situacao ?? "",
            ]
              .map((v) => `<td>${escHtml(v)}</td>`)
              .join("");
            return `<tr class="${ehAfastado(m.situacao) ? "afast" : ""}">${tds}</tr>`;
          })
          .join("");
        return `
          <h2>${escHtml(g.lotacao)} <span class="qtd">${g.lista.length} militar(es)</span></h2>
          <table>
            <thead><tr>
              <th>#</th><th>Posto/Grad</th><th>Nº/Barra</th><th>Nome</th>
              <th>Nome de Guerra</th><th>Matrícula</th><th>Situação</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
          </table>`;
      })
      .join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Efetivo por Lotação - 18 BPM</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0b1f3a;padding:20px;}
        .cab{text-align:center;border-bottom:2px solid #0b1f3a;padding-bottom:8px;margin-bottom:14px;}
        .cab h1{font-size:15px;margin:0;text-transform:uppercase;}
        .cab p{font-size:10px;margin:1px 0;color:#333;}
        .sub{font-size:11px;color:#555;margin:0 0 14px;}
        h2{font-size:12px;background:#0b1f3a;color:#fff;padding:5px 8px;margin:14px 0 0;border-radius:3px 3px 0 0;}
        h2 .qtd{float:right;font-weight:normal;font-size:10px;opacity:.85;}
        table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:8px;}
        th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;}
        th{background:#e9edf3;}
        tr:nth-child(even) td{background:#f6f8fb;}
        tr.afast td{background:#fff3b0 !important;}
        .leg{font-size:9px;color:#555;margin:2px 0 10px;}
        .leg b{background:#fff3b0;padding:1px 6px;border:1px solid #d9c65a;border-radius:3px;color:#5a4b00;}
        h2,table{break-inside:avoid;}
        @media print{ @page{ size:landscape; margin:10mm; } }
      </style></head><body>
      <div class="cab">
        <h1>18º Batalhão de Polícia Militar</h1>
        <p>Estado do Maranhão · SSP · PMMA · CPA I/2</p>
        <p>Presidente Dutra - MA</p>
      </div>
      <p class="sub"><strong>Efetivo por Lotação</strong> — emitido em ${dataStr} · ${totalImpresso} militares em ${escolhidos.length} lotações</p>
      <p class="leg"><b>Amarelo</b> = militar afastado (férias, licença, JMS, curso, missão...)</p>
      ${blocos}
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Efetivo por Lotação</h1>
          <p className="text-sm text-[#94A3B8]">
            {totalMil} militares em {grupos.length} lotações.
          </p>
        </div>
        <button
          onClick={imprimir}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-medium text-[#1a1205] transition hover:brightness-110"
        >
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
          >
            <option value="">Todas as lotações (na tela)</option>
            {grupos.map((g) => (
              <option key={g.lotacao} value={g.lotacao}>{g.lotacao} ({g.lista.length})</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setPainel((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
        >
          <CheckSquare className="h-4 w-4" /> Selecionar p/ impressão ({sel.size}/{grupos.length})
        </button>
      </div>

      {painel && (
        <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
          <div className="mb-2 flex items-center gap-3 text-sm">
            <span className="font-semibold text-white">Lotações na impressão</span>
            <button onClick={marcarTodas} className="text-[#D4AF37] hover:underline">marcar todas</button>
            <button onClick={limparTodas} className="text-[#94A3B8] hover:underline">limpar</button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
            {grupos.map((g) => (
              <label key={g.lotacao} className="flex items-center gap-2 text-sm text-[#cdd9ea]">
                <input type="checkbox" checked={sel.has(g.lotacao)} onChange={() => toggle(g.lotacao)} />
                {g.lotacao} <span className="text-xs text-[#94A3B8]">({g.lista.length})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {visiveis.map((g) => (
          <section key={g.lotacao} className="ui-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3">
              <Building2 className="h-4 w-4 text-[#D4AF37]" />
              <h2 className="font-semibold text-white">{g.lotacao}</h2>
              <span className="ml-auto rounded-full bg-[#D4AF37]/15 px-2.5 py-0.5 text-xs font-bold text-[#D4AF37]">
                {g.lista.length}
              </span>
            </div>
            <ul className="divide-y divide-white/5">
              {g.lista.map((m, i) => (
                <li key={m.id} className={`group flex items-center gap-3 px-5 py-2.5 transition hover:bg-white/5 ${ehAfastado(m.situacao) ? "bg-amber-500/5" : ""}`}>
                  <span className="w-6 shrink-0 text-center text-xs font-semibold text-[#D4AF37]">{i + 1}</span>
                  <Link href={`/efetivo/${encodeURIComponent(m.id)}`} className="flex flex-1 items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-[#94A3B8]">{m.postoGrad ?? "—"}</span>
                    <span className="w-14 shrink-0 text-xs text-[#94A3B8]">{m.numeroBarra ?? "—"}</span>
                    <span className="flex-1 text-sm text-white">
                      {m.nome ?? "—"}
                      {m.nomeGuerra && <span className="ml-2 text-xs text-[#94A3B8]">({m.nomeGuerra})</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${corSituacao(m.situacao)}`}>
                      {m.situacao ?? "—"}
                    </span>
                  </Link>
                  {isAdmin && (
                    <Link
                      href={`/efetivo/${encodeURIComponent(m.id)}/editar`}
                      className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
                      title="Editar"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Link>
                  )}
                  <ChevronRight className="h-4 w-4 text-white/20 transition group-hover:text-[#D4AF37]" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
