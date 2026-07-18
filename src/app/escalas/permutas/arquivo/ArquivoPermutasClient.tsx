"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Eye, FileDown, MapPin, Loader2 } from "lucide-react";
import SolicitacaoPermutaDoc, { type PermutaDoc } from "@/components/SolicitacaoPermutaDoc";

type Item = PermutaDoc & { localId: string; localRotulo: string; lotacao: string; criadoEm: string };
type Local = { id: string; rotulo: string };

const ESTADO_ROT: Record<string, { t: string; c: string }> = {
  aguardando_solicitado: { t: "Aguardando colega", c: "bg-white/10 text-[#cdd9ea]" },
  aguardando_p1: { t: "Aguardando P/1", c: "bg-[#D4AF37]/15 text-[#D4AF37]" },
  aguardando_subcmt: { t: "Aguardando Subcmt", c: "bg-sky-500/15 text-sky-300" },
  autorizada: { t: "Autorizada", c: "bg-emerald-500/15 text-emerald-300" },
  nao_autorizada: { t: "Não autorizada", c: "bg-red-500/15 text-red-300" },
  recusada: { t: "Recusada", c: "bg-red-500/15 text-red-300" },
  cancelada: { t: "Cancelada", c: "bg-white/10 text-[#94A3B8]" },
};
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "—";
}

type Gran = "dia" | "mes" | "ano" | "todas";

export default function ArquivoPermutasClient() {
  const [permutas, setPermutas] = useState<Item[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [localSel, setLocalSel] = useState<string>("");
  const [q, setQ] = useState("");
  const [gran, setGran] = useState<Gran>("todas");
  const [ref, setRef] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [carregando, setCarregando] = useState(true);
  const [doc, setDoc] = useState<PermutaDoc | null>(null);
  const [baixando, setBaixando] = useState<string>("");

  useEffect(() => {
    fetch("/api/permutas/arquivo").then((r) => (r.ok ? r.json() : { locais: [], permutas: [] }))
      .then((d) => {
        setPermutas(d.permutas || []);
        setLocais(d.locais || []);
        setLocalSel((d.locais?.[0]?.id) || "");
      }).catch(() => {}).finally(() => setCarregando(false));
  }, []);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of permutas) m.set(p.localId, (m.get(p.localId) || 0) + 1);
    return m;
  }, [permutas]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return permutas.filter((p) => {
      if (localSel && p.localId !== localSel) return false;
      if (t && !`${p.protocolo} ${p.solicitante.linha} ${p.solicitado?.linha || ""} ${p.solicitadoNome} ${p.motivo}`.toLowerCase().includes(t)) return false;
      if (gran !== "todas" && ref) {
        const d = (p.dataPermuta || "").slice(0, gran === "dia" ? 10 : gran === "mes" ? 7 : 4);
        const r = ref.slice(0, gran === "dia" ? 10 : gran === "mes" ? 7 : 4);
        if (d !== r) return false;
      }
      return true;
    }).sort((a, b) => (b.dataPermuta || "").localeCompare(a.dataPermuta || ""));
  }, [permutas, localSel, q, gran, ref]);

  const baixarWord = async (p: Item) => {
    setBaixando(p.id);
    try {
      const res = await fetch(`/api/permutas/docx?id=${encodeURIComponent(p.id)}`);
      if (!res.ok) { alert("Não foi possível gerar o Word."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Permuta_${(p.protocolo || p.solicitante.linha).replace(/[^\w]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { alert("Erro ao gerar o Word."); }
    finally { setBaixando(""); }
  };

  if (carregando) return <div className="text-sm text-[#94A3B8]">Carregando arquivo…</div>;

  return (
    <div className="text-[#cdd9ea]">
      {/* Abas por lugar */}
      <div className="mb-3 flex flex-wrap gap-2">
        {locais.map((l) => (
          <button key={l.id} onClick={() => setLocalSel(l.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${localSel === l.id ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#f3df9d]" : "border-[#22314d] bg-[#0b1626] text-[#94A3B8] hover:border-[#D4AF37]/40"}`}>
            <MapPin className="h-3.5 w-3.5" /> {l.rotulo} <span className="rounded-full bg-white/10 px-1.5">{contagem.get(l.id) || 0}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#22314d] bg-[#0b1626] px-3">
          <Search className="h-4 w-4 text-[#64748b]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por policial, protocolo, motivo…"
            className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-[#4b5c74]" />
        </div>
        <select value={gran} onChange={(e) => setGran(e.target.value as Gran)}
          className="rounded-lg border border-[#22314d] bg-[#0b1626] px-2 py-2 text-sm text-white">
          <option value="todas">Todas as datas</option>
          <option value="dia">Por dia</option>
          <option value="mes">Por mês</option>
          <option value="ano">Por ano</option>
        </select>
        {gran !== "todas" && (
          <input type={gran === "ano" ? "number" : gran === "mes" ? "month" : "date"}
            value={gran === "ano" ? ref.slice(0, 4) : gran === "mes" ? ref.slice(0, 7) : ref}
            onChange={(e) => {
              const v = e.target.value;
              setRef(gran === "ano" ? `${v}-01-01` : gran === "mes" ? `${v}-01` : v);
            }}
            className="rounded-lg border border-[#22314d] bg-[#0b1626] px-2 py-2 text-sm text-white" />
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#1d2c44]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="bg-[#0F1B2D] text-[11px] uppercase tracking-wide text-[#94A3B8]">
              <th className="px-3 py-2">Protocolo</th>
              <th className="px-3 py-2">Permuta</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[#64748b]">Nenhuma permuta encontrada neste filtro.</td></tr>
            )}
            {filtradas.map((p) => {
              const est = ESTADO_ROT[p.estado] || { t: p.estado, c: "bg-white/10 text-[#cdd9ea]" };
              return (
                <tr key={p.id} className="border-t border-[#16243a] align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-white">{p.protocolo || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="text-white">{p.solicitante.linha}</div>
                    <div className="text-[11px] text-[#64748b]">⇄ {p.solicitado?.linha || p.solicitadoNome}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{dBR(p.dataPermuta)}<div className="text-[10px] text-[#64748b]">ret. {dBR(p.dataRetorno)}</div></td>
                  <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${est.c}`}>{est.t}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setDoc(p)} className="inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2 py-1 text-xs text-[#f3df9d] hover:bg-[#D4AF37]/20"><Eye className="h-3.5 w-3.5" /> Ver</button>
                      <button onClick={() => baixarWord(p)} disabled={baixando === p.id} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/5 disabled:opacity-60">{baixando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Word</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#64748b]">Clique em <b>Ver</b> para abrir a permuta na tela — de lá dá para <b>Baixar PDF</b> e <b>Baixar Word</b>. O arquivo agrupa as permutas por lugar (a lotação do solicitante define o local).</p>

      {doc && <SolicitacaoPermutaDoc doc={doc} onFechar={() => setDoc(null)} />}
    </div>
  );
}
