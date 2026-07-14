"use client";

import { useEffect, useMemo, useState } from "react";
import { Plane, Plus, Trash2, Search } from "lucide-react";

/* Férias em DATAS SOLTAS (individual), fora do plano por equipes.
   Conta como "Férias" na situacao (dashboard/lotacao/efetivo/organograma). */

type Avulsa = { id: string; idPmma: string; nome: string; inicio: string; fim: string; obs: string };
type Militar = { id: string; postoGrad?: string; nome?: string; nomeGuerra?: string; matricula?: string };

function brData(iso: string) { return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso; }
function nomeMil(m: Militar) { return [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" "); }

export default function FeriasAvulsas({ ano, isAdmin }: { ano: string; isAdmin: boolean }) {
  const [avulsas, setAvulsas] = useState<Avulsa[]>([]);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Militar | null>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [abrirForm, setAbrirForm] = useState(false);

  const carregar = () => {
    fetch(`/api/ferias/avulsas?ano=${encodeURIComponent(ano)}`).then((r) => r.ok ? r.json() : null)
      .then((d) => setAvulsas(Array.isArray(d?.avulsas) ? d.avulsas : [])).catch(() => {});
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [ano]);
  useEffect(() => {
    fetch("/api/efetivo").then((r) => r.ok ? r.json() : null)
      .then((d) => setEfetivo((d?.efetivo || d || []) as Militar[])).catch(() => {});
  }, []);

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase(); if (!t) return [];
    return efetivo.filter((m) => (nomeMil(m) + " " + (m.matricula || "")).toLowerCase().includes(t)).slice(0, 6);
  }, [busca, efetivo]);

  const adicionar = async () => {
    if (!sel || !inicio || !fim) { alert("Escolha o militar e as datas (início e fim)."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/ferias/avulsas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: sel.id, nome: nomeMil(sel), inicio, fim, obs }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || "Falha ao salvar."); return; }
      setSel(null); setBusca(""); setInicio(""); setFim(""); setObs(""); setAbrirForm(false);
      carregar();
    } catch { alert("Falha ao salvar."); }
    finally { setSalvando(false); }
  };
  const remover = async (id: string) => {
    if (!confirm("Remover estas férias avulsas?")) return;
    try {
      const r = await fetch(`/api/ferias/avulsas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setAvulsas((l) => l.filter((a) => a.id !== id));
    } catch { alert("Falha ao remover."); }
  };

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-[#0F1B2D] p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <Plane className="h-4 w-4 text-[#3B82F6]" /> Férias em datas soltas (individual)
        </h2>
        {isAdmin && (
          <button onClick={() => setAbrirForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10">
            <Plus className="h-4 w-4" /> Nova férias avulsa
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-[#94A3B8]">Para quem tira férias fora das equipes/datas do plano. Conta como “Férias” na situação (dashboard, lotação, organograma…).</p>

      {abrirForm && isAdmin && (
        <div className="mb-4 rounded-lg border border-white/10 bg-[#0b1626] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <label className="mb-1 block text-xs text-[#94A3B8]">Militar</label>
              {sel ? (
                <div className="flex items-center justify-between rounded-lg border border-[#D4AF37]/40 bg-[#0F1B2D] px-3 py-2 text-sm text-white">
                  <span>{nomeMil(sel)}{sel.matricula ? ` · mat ${sel.matricula}` : ""}</span>
                  <button onClick={() => { setSel(null); setBusca(""); }} className="text-xs text-[#94A3B8] hover:text-white">trocar</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar militar por nome ou matrícula..."
                      className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                  </div>
                  {busca.trim() !== "" && (
                    <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1626] shadow-xl">
                      {resultados.length === 0 ? <div className="px-3 py-2 text-xs text-[#94A3B8]">Nenhum militar.</div> :
                        resultados.map((m) => (
                          <button key={m.id} onClick={() => { setSel(m); setBusca(""); }} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                            {nomeMil(m)} {m.matricula && <span className="text-xs text-[#94A3B8]">mat {m.matricula}</span>}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#94A3B8]">Início</label>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#94A3B8]">Fim</label>
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-[#94A3B8]">Observação (opcional)</label>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex: saldo de férias, período abonado..." className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={adicionar} disabled={salvando} className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">{salvando ? "Salvando..." : "Adicionar"}</button>
            <button onClick={() => setAbrirForm(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {avulsas.length === 0 ? (
        <p className="py-4 text-center text-sm text-[#94A3B8]">Nenhuma férias avulsa em {ano}.</p>
      ) : (
        <ul className="space-y-2">
          {avulsas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-4 py-2.5">
              <div>
                <p className="text-sm font-semibold text-white">{a.nome || a.idPmma}</p>
                <p className="text-xs text-[#94A3B8]">{brData(a.inicio)} a {brData(a.fim)}{a.obs ? ` · ${a.obs}` : ""}</p>
              </div>
              {isAdmin && <button onClick={() => remover(a.id)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#94A3B8] transition hover:border-red-500/40 hover:text-red-300"><Trash2 className="h-3 w-3" /> remover</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
