"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Eye, Loader2, Trash2, RefreshCw, Inbox, FolderOpen } from "lucide-react";

/* =========================================================================
   LISTA DOS DOCUMENTOS JÁ FEITOS — dentro da própria aba (Diárias)

   Mesmo jeito da aba Emitidos da JMS: agrupado (por mês ou por exercício), o
   grupo mais recente aberto, busca pelo nome e, em cada linha, "Abrir" — que
   carrega o documento de volta na folha, pronto para conferir e reimprimir.
   ========================================================================= */

export type ItemFeito = {
  id: string;
  grupo: string;        // chave do grupo, ordenada do mais recente para trás
  grupoRotulo: string;  // "outubro de 2026" / "Exercício 2026"
  titulo: string;       // "2º Sargento Arodo"
  etiqueta?: string;    // "3 viagens · 6 diárias"
  detalhe?: string;     // "feita em 01/10/2026 às 10:12 por FULANA"
};

export default function ListaFeitos({
  titulo, itens, carregando, erro, vazio, abertaDeInicio, onAbrir, onApagar, onAtualizar, abrindo,
}: {
  titulo: string;
  itens: ItemFeito[];
  carregando: boolean;
  erro?: string;
  vazio: string;
  abertaDeInicio: boolean;
  onAbrir: (item: ItemFeito) => void;
  onApagar?: (item: ItemFeito) => void;
  onAtualizar: () => void;
  abrindo?: string | null;
}) {
  const [aberta, setAberta] = useState(abertaDeInicio);
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string> | null>(null);

  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const mapa = new Map<string, { rotulo: string; itens: ItemFeito[] }>();
    for (const i of itens) {
      if (t && !`${i.titulo} ${i.etiqueta || ""}`.toLowerCase().includes(t)) continue;
      const g = mapa.get(i.grupo) || { rotulo: i.grupoRotulo, itens: [] };
      g.itens.push(i);
      mapa.set(i.grupo, g);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([chave, g]) => ({ chave, ...g }));
  }, [itens, busca]);

  // o grupo mais recente nasce aberto; com busca, todos abrem
  const estaAberto = (chave: string) =>
    busca.trim() !== "" || (abertos ? abertos.has(chave) : chave === grupos[0]?.chave);
  const alternar = (chave: string) =>
    setAbertos((s) => {
      const n = new Set(s ?? (grupos[0] ? [grupos[0].chave] : []));
      if (n.has(chave)) n.delete(chave); else n.add(chave);
      return n;
    });

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] print:hidden">
      <button onClick={() => setAberta((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <FolderOpen className="h-4 w-4 text-[#D4AF37]" />
        <span className="text-sm font-semibold text-white">{titulo}</span>
        <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-xs font-semibold text-[#D4AF37]">
          {carregando ? "…" : itens.length}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-[#94A3B8] transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>

      {aberta && (
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar pelo nome…"
              className="w-full max-w-xs rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50"
            />
            <button onClick={onAtualizar} title="Atualizar" className="ml-auto rounded-lg border border-white/10 p-1.5 text-[#94A3B8] transition hover:text-white">
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>

          {carregando && !itens.length ? (
            <p className="flex items-center gap-2 py-6 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : erro ? (
            <p className="py-6 text-sm text-red-300">{erro}</p>
          ) : grupos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="h-8 w-8 text-[#94A3B8]/40" />
              <p className="text-sm text-[#94A3B8]">{itens.length ? "Ninguém com esse nome." : vazio}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {grupos.map((g) => {
                const aberto = estaAberto(g.chave);
                return (
                  <li key={g.chave} className="overflow-hidden rounded-lg border border-white/10">
                    <button onClick={() => alternar(g.chave)}
                      className="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
                      <ChevronRight className={`h-4 w-4 shrink-0 text-[#D4AF37] transition-transform ${aberto ? "rotate-90" : ""}`} />
                      <span className="text-sm font-semibold text-white first-letter:uppercase">{g.rotulo}</span>
                      <span className="ml-auto rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-xs font-semibold text-[#D4AF37]">{g.itens.length}</span>
                    </button>
                    {aberto && (
                      <ul className="divide-y divide-white/5">
                        {g.itens.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                            <span className="font-medium text-white">{i.titulo}</span>
                            {i.etiqueta && (
                              <span className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-[#94A3B8]">{i.etiqueta}</span>
                            )}
                            {i.detalhe && <span className="ml-auto text-xs text-[#7e8b99]">{i.detalhe}</span>}
                            <button onClick={() => onAbrir(i)} disabled={abrindo === i.id}
                              className={`${i.detalhe ? "" : "ml-auto "}inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/40 px-2 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-50`}>
                              {abrindo === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Abrir
                            </button>
                            {onApagar && (
                              <button onClick={() => onApagar(i)} title="Tirar da lista"
                                className="rounded p-1 text-[#94A3B8] transition hover:bg-red-500/10 hover:text-red-300">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// "2026-10" -> "outubro de 2026"
export const mesPorExtenso = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1] || "?"} de ${chave.slice(0, 4)}`;
// "2026-10-01" -> "01/10/2026"
export const dataBR = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
