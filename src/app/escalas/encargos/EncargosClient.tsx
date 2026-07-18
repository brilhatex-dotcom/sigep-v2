"use client";

import { useEffect, useMemo, useState } from "react";
import { ORGANOGRAMA, acharNo, pertenceAoNo, type NoOrg } from "@/lib/organograma";
import { Search, X, Check, ShieldCheck, Building2 } from "lucide-react";

type Opcao = { id: string; label: string; cargoDoc: string };
type Item = { efetivoId: string; encargo: string; label: string; nome: string; numeroBarra: string };
type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; lotacao: string };

function abrev(p?: string): string {
  const map: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "major": "Maj", "capitão": "Cap", "capitao": "Cap",
    "1º tenente": "1º Ten", "2º tenente": "2º Ten", "aspirante a oficial": "Asp Of", "subtenente": "ST",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt", "cabo": "Cb", "soldado": "Sd",
  };
  return map[(p || "").trim().toLowerCase()] ?? (p || "").trim();
}
function nomeMil(m: Militar): string {
  return [abrev(m.postoGrad), m.numeroBarra ? "nº " + m.numeroBarra : "", (m.nomeGuerra || m.nome || "").trim()].filter(Boolean).join(" ");
}
function norm(s: string): string {
  return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Ordem base do Comando/Seções
const ORDEM_BASE = ["cmt", "subcmt", "chefe_p1", "aux_p1", "cmt_ft_rotem", "chefe_p3", "chefe_p4"];

export default function EncargosClient() {
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");

  const carregar = () => {
    Promise.all([
      fetch("/api/admin/encargos").then((r) => (r.ok ? r.json() : { opcoes: [], itens: [] })),
      fetch("/api/efetivo").then((r) => (r.ok ? r.json() : { efetivo: [] })),
    ]).then(([a, b]) => {
      setOpcoes(a.opcoes || []); setItens(a.itens || []); setEfetivo(b.efetivo || []);
    }).catch(() => setMsg("Falha ao carregar.")).finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  const titularDe = (encId: string): Item | undefined => itens.find((i) => i.encargo === encId);

  const definir = async (efetivoId: string, encargo: string) => {
    setMsg("");
    try {
      const r = await fetch("/api/admin/encargos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId, encargo }),
      });
      if (!r.ok) throw new Error();
      setMsg("Salvo. ✅");
      carregar();
    } catch { setMsg("Não foi possível salvar."); }
  };

  // Lugares (Cmt + Sargenteante) a partir das opções cmt_<noId>.
  const lugares = useMemo(() => {
    const out: { noId: string; rotulo: string; no: NoOrg | null }[] = [];
    for (const o of opcoes) {
      const m = o.id.match(/^cmt_(\d+cia(?:-p\d+)?)$/);
      if (m) {
        const noId = m[1];
        out.push({ noId, rotulo: o.label.replace(/^Cmt\s*[—-]\s*/, ""), no: acharNo(noId, ORGANOGRAMA) });
      }
    }
    return out;
  }, [opcoes]);

  const baseOpcoes = useMemo(() =>
    ORDEM_BASE.map((id) => opcoes.find((o) => o.id === id)).filter(Boolean) as Opcao[], [opcoes]);

  if (carregando) return <div className="text-sm text-[#94A3B8]">Carregando encargos…</div>;

  return (
    <div className="space-y-6 text-[#cdd9ea]">
      {msg && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{msg}</div>}

      {/* Comando e Seções do BPM */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#D4AF37]"><ShieldCheck className="h-4 w-4" /> Comando e Seções (18º BPM)</h2>
        <p className="mb-3 text-xs text-[#94A3B8]">Cmt do BPM, Subcmt e Chefe do P/1 têm <b>acesso total</b> (entram como admin). Os demais têm acesso conforme a função.</p>
        <div className="grid gap-2">
          {baseOpcoes.map((o) => (
            <SlotEncargo key={o.id} encId={o.id} rotulo={o.label} titular={titularDe(o.id)} efetivo={efetivo} no={null} onDefinir={definir} />
          ))}
        </div>
      </section>

      {/* Comando dos Lugares */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#D4AF37]"><Building2 className="h-4 w-4" /> Comando dos Lugares (CIA / DPM / Pelotão)</h2>
        <p className="mb-3 text-xs text-[#94A3B8]">O <b>Cmt do lugar</b> assina a escala da unidade e aprova o que o sargenteante enviar. O <b>sargenteante</b> monta a escala e encaminha ao Cmt. Onde não houver sargenteante, o próprio Cmt publica já autorizado.</p>
        <div className="grid gap-3">
          {lugares.map((l) => (
            <div key={l.noId} className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Building2 className="h-4 w-4 text-[#D4AF37]" /> {l.rotulo}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <SlotEncargo encId={`cmt_${l.noId}`} rotulo="Comandante" titular={titularDe(`cmt_${l.noId}`)} efetivo={efetivo} no={l.no} onDefinir={definir} />
                <SlotEncargo encId={`sarg_${l.noId}`} rotulo="Sargenteante" titular={titularDe(`sarg_${l.noId}`)} efetivo={efetivo} no={l.no} onDefinir={definir} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* Um posto (encargo): mostra o titular atual e permite trocar/remover.
   Quando `no` é dado, o buscador sugere primeiro o efetivo daquele lugar. */
function SlotEncargo({
  encId, rotulo, titular, efetivo, no, onDefinir,
}: {
  encId: string; rotulo: string; titular?: Item; efetivo: Militar[]; no: NoOrg | null;
  onDefinir: (efetivoId: string, encargo: string) => void;
}) {
  const [abrir, setAbrir] = useState(false);
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);

  const candidatos = useMemo(() => {
    let base = efetivo;
    if (no && !todos) base = efetivo.filter((m) => pertenceAoNo(m.lotacao, no));
    const t = norm(q);
    const filtro = t
      ? base.filter((m) => norm(`${m.nome} ${m.nomeGuerra} ${m.numeroBarra} ${m.postoGrad}`).includes(t))
      : base;
    return filtro.slice(0, 12);
  }, [efetivo, no, todos, q]);

  return (
    <div className="rounded-lg border border-[#22314d] bg-[#0b1626] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{rotulo}</span>
        {titular
          ? <button onClick={() => onDefinir(titular.efetivoId, "")} className="inline-flex items-center gap-1 rounded border border-red-500/30 px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-500/10"><X className="h-3 w-3" /> remover</button>
          : <span className="text-[11px] text-[#64748b]">vago</span>}
      </div>
      <div className="mt-1 text-sm text-white">
        {titular ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-400" /> {titular.nome}{titular.numeroBarra ? ` (nº ${titular.numeroBarra})` : ""}</span> : <span className="text-[#64748b]">— ninguém atribuído —</span>}
      </div>

      {!abrir
        ? <button onClick={() => setAbrir(true)} className="mt-2 rounded border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/5">{titular ? "Trocar" : "Atribuir"}</button>
        : (
          <div className="mt-2 rounded-md border border-[#22314d] bg-[#0a1220] p-2">
            <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0b1626] px-2">
              <Search className="h-3.5 w-3.5 text-[#64748b]" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, nº ou posto…"
                className="w-full bg-transparent py-1 text-sm text-white outline-none placeholder:text-[#4b5c74]" />
              <button onClick={() => { setAbrir(false); setQ(""); }} className="text-[#64748b] hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {no && (
              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> mostrar todo o efetivo (não só o desta unidade)
              </label>
            )}
            <div className="mt-1 max-h-56 overflow-y-auto">
              {candidatos.length === 0 && <div className="px-1 py-2 text-xs text-[#64748b]">Nenhum militar encontrado.</div>}
              {candidatos.map((m) => (
                <button key={m.id} onClick={() => { onDefinir(m.id, encId); setAbrir(false); setQ(""); }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-[#cdd9ea] hover:bg-white/5">
                  <span>{nomeMil(m)}</span>
                  <span className="truncate text-[10px] text-[#64748b]">{m.lotacao}</span>
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
