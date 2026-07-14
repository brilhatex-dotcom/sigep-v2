"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Loader2, ArrowLeftRight, Check, X, Clock, CheckCircle2,
  XCircle, Search, Send, AlertTriangle, ShieldCheck,
} from "lucide-react";

type SlotView = {
  campo: string; idx: number; label: string;
  titular: string; permuta: string | null; status: string | null; ehMeu: boolean;
};
type Pedido = {
  id: string; data: string; campo: string; idx: number; label: string;
  titular: string; solicitanteNome: string; colegaNome: string; motivo?: string;
  estado: string; motivoP1?: string | null; criadoEm: string; colegaEm?: string | null; p1Em?: string | null;
};
type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; matricula: string };

function hojeISO(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function nomeMilitar(m: Militar): string {
  const posto = (m.postoGrad || "").trim();
  const barra = (m.numeroBarra || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", guerra].filter(Boolean).join(" ").trim();
}

const ESTADO: Record<string, { rotulo: string; cor: string }> = {
  aguardando_colega: { rotulo: "Aguardando o colega", cor: "bg-amber-500/15 text-amber-300" },
  recusada_colega: { rotulo: "Recusada pelo colega", cor: "bg-red-500/15 text-red-300" },
  aguardando_p1: { rotulo: "Aguardando o P/1", cor: "bg-[#D4AF37]/15 text-[#D4AF37]" },
  deferida: { rotulo: "Deferida — na escala", cor: "bg-emerald-500/15 text-emerald-300" },
  indeferida: { rotulo: "Indeferida", cor: "bg-red-500/15 text-red-300" },
  cancelada: { rotulo: "Cancelada", cor: "bg-white/10 text-[#94A3B8]" },
};

export default function PermutasPolicialClient({ isAdmin, temFicha }: { isAdmin: boolean; temFicha: boolean }) {
  const [data, setData] = useState(hojeISO());
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [existeDia, setExisteDia] = useState(true);
  const [carregandoDia, setCarregandoDia] = useState(false);

  const [meus, setMeus] = useState<Pedido[]>([]);
  const [paraMim, setParaMim] = useState<Pedido[]>([]);
  const [paraP1, setParaP1] = useState<Pedido[]>([]);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [alvo, setAlvo] = useState<SlotView | null>(null); // slot sendo pedido
  const [busca, setBusca] = useState("");
  const [colega, setColega] = useState<Militar | null>(null);
  const [motivo, setMotivo] = useState("");

  async function carregarPedidos() {
    try {
      const r = await fetch("/api/permutas/pedidos");
      const d = await r.json();
      setMeus(d.meus || []); setParaMim(d.paraMim || []); setParaP1(d.paraP1 || []);
    } catch { /* silencioso */ }
  }
  async function carregarDia(dt: string) {
    setCarregandoDia(true);
    try {
      const r = await fetch(`/api/permutas/escala-dia?data=${encodeURIComponent(dt)}`);
      const d = await r.json();
      setSlots(d.slots || []); setExisteDia(!!d.existe);
    } catch { setSlots([]); setExisteDia(false); }
    finally { setCarregandoDia(false); }
  }

  useEffect(() => { carregarPedidos(); }, []);
  useEffect(() => { carregarDia(data); }, [data]);
  useEffect(() => {
    fetch("/api/efetivo").then((r) => r.json()).then((d) => setEfetivo(d.efetivo || [])).catch(() => {});
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return efetivo.filter((m) => `${m.nome} ${m.nomeGuerra} ${m.matricula} ${m.numeroBarra} ${m.postoGrad}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, efetivo]);

  function abrirPedido(s: SlotView) {
    setAlvo(s); setColega(null); setBusca(""); setMotivo(""); setErro("");
  }

  async function confirmarPedido() {
    if (!alvo || !colega) return;
    setOcupado("criar"); setErro("");
    try {
      const r = await fetch("/api/permutas/pedidos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar", data, campo: alvo.campo, idx: alvo.idx, label: alvo.label,
          titular: alvo.titular, colegaId: colega.id, colegaNome: nomeMilitar(colega), motivo,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao criar o pedido."); return; }
      setAlvo(null);
      await Promise.all([carregarPedidos(), carregarDia(data)]);
    } catch { setErro("Erro de conexão."); }
    finally { setOcupado(null); }
  }

  async function acao(body: Record<string, unknown>, chave: string) {
    setOcupado(chave); setErro("");
    try {
      const r = await fetch("/api/permutas/pedidos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha na operação."); return; }
      await Promise.all([carregarPedidos(), carregarDia(data)]);
    } catch { setErro("Erro de conexão."); }
    finally { setOcupado(null); }
  }

  const meusSlots = slots.filter((s) => s.ehMeu);

  return (
    <div className="space-y-5">
      {!temFicha && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Seu usuário não está vinculado a uma ficha de efetivo — não é possível
          identificar seus serviços na escala. Avise o administrador.
        </p>
      )}
      {erro && (
        <p className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}

      {/* AGUARDANDO SUA CONCORDANCIA (colega) */}
      {paraMim.length > 0 && (
        <section className="ui-card border-[#D4AF37]/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <ArrowLeftRight className="h-4 w-4 text-[#D4AF37]" /> Pediram permuta com você
          </h2>
          <ul className="space-y-2">
            {paraMim.map((p) => (
              <li key={p.id} className="rounded-lg border border-white/10 bg-[#0b1626] p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">{p.solicitanteNome}</span> quer que você assuma o serviço
                  <span className="font-semibold"> {p.label}</span> do dia <span className="font-semibold">{dataBR(p.data)}</span>.
                </p>
                {p.motivo && <p className="mt-0.5 text-xs text-[#94A3B8]">Motivo: {p.motivo}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => acao({ acao: "colega", id: p.id, resposta: "aceitar" }, "colega-" + p.id)}
                    disabled={ocupado === "colega-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {ocupado === "colega-" + p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Concordo
                  </button>
                  <button
                    onClick={() => acao({ acao: "colega", id: p.id, resposta: "recusar" }, "colega-" + p.id)}
                    disabled={ocupado === "colega-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" /> Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* P/1: PARA ANALISE */}
      {isAdmin && paraP1.length > 0 && (
        <section className="ui-card border-[#D4AF37]/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" /> Permutas para análise do P/1
          </h2>
          <ul className="space-y-2">
            {paraP1.map((p) => (
              <li key={p.id} className="rounded-lg border border-white/10 bg-[#0b1626] p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">{p.solicitanteNome}</span> →{" "}
                  <span className="font-semibold">{p.colegaNome}</span> · {p.label} ·{" "}
                  <span className="font-semibold">{dataBR(p.data)}</span>
                </p>
                <p className="mt-0.5 text-xs text-emerald-300">Colega já concordou. Titular na vaga: {p.titular}</p>
                {p.motivo && <p className="text-xs text-[#94A3B8]">Motivo: {p.motivo}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => acao({ acao: "p1", id: p.id, resposta: "deferir" }, "p1-" + p.id)}
                    disabled={ocupado === "p1-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {ocupado === "p1-" + p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Deferir
                  </button>
                  <button
                    onClick={() => { const m = prompt("Motivo do indeferimento (opcional):") ?? ""; acao({ acao: "p1", id: p.id, resposta: "indeferir", motivo: m }, "p1-" + p.id); }}
                    disabled={ocupado === "p1-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/50 disabled:opacity-60"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Indeferir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ESCALA DA SEDE (somente leitura) — pedir permuta */}
      <section className="ui-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <CalendarDays className="h-4 w-4 text-[#D4AF37]" /> Escala da sede
          </h2>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50"
          />
          <span className="text-xs text-[#94A3B8]">{dataBR(data)}</span>
        </div>

        {carregandoDia ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando escala...</p>
        ) : !existeDia || slots.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-[#0b1626] p-4 text-sm text-[#94A3B8]">
            Nenhuma escala publicada para este dia. Escolha outra data.
          </p>
        ) : (
          <>
            {meusSlots.length === 0 && (
              <p className="mb-3 rounded-lg border border-white/10 bg-[#0b1626] p-3 text-xs text-[#94A3B8]">
                Você não aparece como titular em nenhum serviço deste dia. Só é possível pedir permuta de um serviço seu.
              </p>
            )}
            <ul className="divide-y divide-white/5">
              {slots.map((s) => (
                <li key={`${s.campo}-${s.idx}`} className={`flex flex-wrap items-center gap-2 py-2.5 ${s.ehMeu ? "" : "opacity-70"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#94A3B8]">{s.label}</p>
                    <p className="text-sm text-white">
                      {s.titular}
                      {s.ehMeu && <span className="ml-2 rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#D4AF37]">seu serviço</span>}
                    </p>
                    {s.permuta && (
                      <p className="text-xs text-amber-300">Substituto: {s.permuta}{s.status ? ` · ${s.status}` : ""}</p>
                    )}
                  </div>
                  {s.ehMeu && !s.permuta && (
                    <button
                      onClick={() => abrirPedido(s)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-2.5 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" /> Pedir permuta
                    </button>
                  )}
                  {s.permuta && (
                    <span className="text-xs text-[#94A3B8]">permuta em andamento</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* MEUS PEDIDOS */}
      <section className="ui-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Clock className="h-4 w-4 text-[#D4AF37]" /> Meus pedidos
        </h2>
        {meus.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">Você ainda não solicitou nenhuma permuta.</p>
        ) : (
          <ul className="space-y-2">
            {meus.map((p) => {
              const est = ESTADO[p.estado] || { rotulo: p.estado, cor: "bg-white/10 text-[#94A3B8]" };
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#0b1626] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      {p.label} · <span className="font-semibold">{dataBR(p.data)}</span> → {p.colegaNome}
                    </p>
                    {p.estado === "indeferida" && p.motivoP1 && (
                      <p className="text-xs text-red-300">Motivo do P/1: {p.motivoP1}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${est.cor}`}>{est.rotulo}</span>
                  {p.estado === "aguardando_colega" && (
                    <button
                      onClick={() => acao({ acao: "cancelar", id: p.id }, "cancelar-" + p.id)}
                      disabled={ocupado === "cancelar-" + p.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-[#94A3B8] hover:bg-white/5 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* MODAL: escolher colega */}
      {alvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAlvo(null)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Pedir permuta</h3>
              <button onClick={() => setAlvo(null)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-5">
              <div className="rounded-lg bg-white/5 p-3 text-sm text-white">
                <span className="font-semibold">{alvo.label}</span> · {dataBR(data)}
                <p className="text-xs text-[#94A3B8]">Seu serviço: {alvo.titular}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Colega que vai assumir</label>
                {colega ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#0b1626] px-3 py-2 text-sm text-white">
                    <span>{nomeMilitar(colega)}</span>
                    <button onClick={() => { setColega(null); setBusca(""); }} className="text-[#94A3B8] hover:text-white"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome, guerra ou matrícula..."
                        className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                      />
                    </div>
                    {busca.trim().length >= 2 && (
                      <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/10">
                        {filtrados.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-[#94A3B8]">Nenhum militar encontrado.</p>
                        ) : filtrados.map((m) => (
                          <button key={m.id} onClick={() => setColega(m)}
                            className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-white/5">
                            {nomeMilitar(m)}
                            {m.matricula && <span className="ml-2 text-xs text-[#94A3B8]">Mat. {m.matricula}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Motivo (opcional)</label>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ex.: compromisso pessoal"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAlvo(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                <button onClick={confirmarPedido} disabled={!colega || ocupado === "criar"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                  {ocupado === "criar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
