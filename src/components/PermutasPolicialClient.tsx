"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, X, Check, Clock, CheckCircle2, XCircle, Search, Send,
  AlertTriangle, ShieldCheck, FileText, Plus, ArrowLeftRight, ChevronDown, Folder,
} from "lucide-react";
import SolicitacaoPermutaDoc, { PermutaDoc } from "@/components/SolicitacaoPermutaDoc";

type Assinatura = { efetivoId: string; nome: string; linha: string; em: string };
type Permuta = {
  id: string;
  solicitanteId: string; solicitante: Assinatura;
  solicitadoId: string; solicitadoNome: string; solicitado: Assinatura | null;
  dataPermuta: string; dataRetorno: string; motivo: string;
  estado: string; parecerP1: string | null; p1Nome: string | null; p1Cargo?: string | null; p1Em: string | null;
  visto: "autorizado" | "nao_autorizado" | null; subcmtNome?: string | null; subcmtEm?: string | null; criadoEm: string;
};
type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; matricula: string };

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function nomeMilitar(m: Militar): string {
  const posto = (m.postoGrad || "").trim();
  const barra = (m.numeroBarra || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  return [posto, /\d/.test(barra) ? "nº " + barra : "", guerra].filter(Boolean).join(" ").trim();
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function mesLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})/);
  return m ? `${MESES[+m[2] - 1]} / ${m[1]}` : ym;
}
// Agrupa as permutas em "pastas" por mes da data da permuta (recentes primeiro).
function agruparPorMes(arr: Permuta[]): { mes: string; itens: Permuta[] }[] {
  const map = new Map<string, Permuta[]>();
  for (const p of arr) {
    const k = (p.dataPermuta || "").slice(0, 7) || "0000-00";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, itens]) => ({ mes, itens }));
}

const ESTADO: Record<string, { rotulo: string; cor: string }> = {
  aguardando_solicitado: { rotulo: "Aguardando o colega assinar", cor: "bg-amber-500/15 text-amber-300" },
  recusada: { rotulo: "Recusada pelo colega", cor: "bg-red-500/15 text-red-300" },
  aguardando_p1: { rotulo: "Aguardando parecer do P/1", cor: "bg-[#D4AF37]/15 text-[#D4AF37]" },
  aguardando_subcmt: { rotulo: "Aguardando visto do Subcmt", cor: "bg-sky-500/15 text-sky-300" },
  autorizada: { rotulo: "Autorizada", cor: "bg-emerald-500/15 text-emerald-300" },
  nao_autorizada: { rotulo: "Não autorizada", cor: "bg-red-500/15 text-red-300" },
  cancelada: { rotulo: "Cancelada", cor: "bg-white/10 text-[#94A3B8]" },
};

export default function PermutasPolicialClient({ isAdmin, temFicha }: { isAdmin: boolean; temFicha: boolean }) {
  const [meus, setMeus] = useState<Permuta[]>([]);
  const [paraMim, setParaMim] = useState<Permuta[]>([]);
  const [paraP1, setParaP1] = useState<Permuta[]>([]);
  const [paraSubcmt, setParaSubcmt] = useState<Permuta[]>([]);
  const [podeP1, setPodeP1] = useState(false);
  const [podeSubcmt, setPodeSubcmt] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [doc, setDoc] = useState<PermutaDoc | null>(null);

  // form nova permuta
  const [novo, setNovo] = useState(false);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");
  const [colega, setColega] = useState<Militar | null>(null);
  const [dataPermuta, setDataPermuta] = useState("");
  const [dataRetorno, setDataRetorno] = useState("");
  const [motivo, setMotivo] = useState("");

  // análise: parecer (P/1) ou visto (Subcmt)
  const [analisar, setAnalisar] = useState<{ p: Permuta; modo: "parecer" | "visto" } | null>(null);
  const [visto, setVisto] = useState<"autorizado" | "nao_autorizado">("autorizado");
  const [parecer, setParecer] = useState("");
  const [parecerFav, setParecerFav] = useState(true);
  // reautenticação: senha digitada no ato de assinar
  const [senhaAss, setSenhaAss] = useState("");
  const [assinarPend, setAssinarPend] = useState<Permuta | null>(null);

  // pastas (por mes) abertas/fechadas em "Minhas permutas"
  const [pastasAbertas, setPastasAbertas] = useState<Record<string, boolean>>({});
  const gruposMeus = useMemo(() => agruparPorMes(meus), [meus]);

  async function carregar() {
    try {
      const r = await fetch("/api/permutas/pedidos");
      const d = await r.json();
      setMeus(d.meus || []); setParaMim(d.paraMim || []); setParaP1(d.paraP1 || []);
      setParaSubcmt(d.paraSubcmt || []); setPodeP1(!!d.podeP1); setPodeSubcmt(!!d.podeSubcmt);
    } catch { /* silencioso */ }
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => { fetch("/api/efetivo").then((r) => r.json()).then((d) => setEfetivo(d.efetivo || [])).catch(() => {}); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return efetivo.filter((m) => `${m.nome} ${m.nomeGuerra} ${m.matricula} ${m.numeroBarra} ${m.postoGrad}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, efetivo]);

  function abrirNovo() {
    setNovo(true); setColega(null); setBusca(""); setDataPermuta(""); setDataRetorno(""); setMotivo(""); setErro(""); setSenhaAss("");
  }

  async function criar() {
    if (!colega || !dataPermuta) { setErro("Escolha o colega e a data da permuta."); return; }
    if (!senhaAss) { setErro("Digite sua senha para assinar a solicitação."); return; }
    setOcupado("criar"); setErro("");
    try {
      const r = await fetch("/api/permutas/pedidos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar", solicitadoId: colega.id, dataPermuta, dataRetorno, motivo, senha: senhaAss }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao criar."); return; }
      setNovo(false); await carregar();
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
      setAnalisar(null); setAssinarPend(null); setSenhaAss(""); await carregar();
    } catch { setErro("Erro de conexão."); }
    finally { setOcupado(null); }
  }

  function assinar(p: Permuta) {
    setAssinarPend(p); setSenhaAss(""); setErro("");
  }

  return (
    <div className="space-y-5">
      {!temFicha && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Seu usuário não está vinculado a uma ficha de efetivo — a assinatura precisa disso. Avise o administrador.
        </p>
      )}
      {erro && (
        <p className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}

      {/* Nova permuta */}
      <div>
        <button onClick={abrirNovo} disabled={!temFicha}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Nova solicitação de permuta
        </button>
      </div>

      {/* Aguardando MINHA assinatura (solicitado) */}
      {paraMim.length > 0 && (
        <section className="ui-card border-[#D4AF37]/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <ArrowLeftRight className="h-4 w-4 text-[#D4AF37]" /> Pediram permuta com você
          </h2>
          <ul className="space-y-2">
            {paraMim.map((p) => (
              <li key={p.id} className="rounded-lg border border-white/10 bg-[#0b1626] p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">{p.solicitante.linha}</span> quer permutar o serviço de{" "}
                  <span className="font-semibold">{dBR(p.dataPermuta)}</span> (retorno {dBR(p.dataRetorno)}).
                </p>
                {p.motivo && <p className="mt-0.5 text-xs text-[#94A3B8]">Motivo: {p.motivo}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setDoc(p as PermutaDoc)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                    <FileText className="h-3.5 w-3.5" /> Ver documento
                  </button>
                  <button onClick={() => assinar(p)} disabled={ocupado === "assinar-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {ocupado === "assinar-" + p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Assinar (concordo)
                  </button>
                  <button onClick={() => acao({ acao: "assinar", id: p.id, resposta: "recusar" }, "assinar-" + p.id)} disabled={ocupado === "assinar-" + p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/50 disabled:opacity-60">
                    <X className="h-3.5 w-3.5" /> Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Seção P/1 (Chefe assina; auxiliares só acompanham) */}
      {paraP1.length > 0 && (
        <section className="ui-card border-[#D4AF37]/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" /> Permutas para parecer do P/1
            {!podeP1 && <span className="text-xs font-normal text-[#94A3B8]">(acompanhamento — só o Chefe do P/1 assina)</span>}
          </h2>
          <ul className="space-y-2">
            {paraP1.map((p) => (
              <li key={p.id} className="rounded-lg border border-white/10 bg-[#0b1626] p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">{p.solicitante.linha}</span> ⇄ <span className="font-semibold">{p.solicitado?.linha || p.solicitadoNome}</span>
                </p>
                <p className="mt-0.5 text-xs text-emerald-300">
                  Ambos assinaram · permuta {dBR(p.dataPermuta)} · retorno {dBR(p.dataRetorno)}
                </p>
                {p.motivo && <p className="text-xs text-[#94A3B8]">Motivo: {p.motivo}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setDoc(p as PermutaDoc)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                    <FileText className="h-3.5 w-3.5" /> Ver documento
                  </button>
                  {podeP1 && (
                    <button onClick={() => { setAnalisar({ p, modo: "parecer" }); setParecer(""); setParecerFav(true); setSenhaAss(""); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110">
                      <ShieldCheck className="h-3.5 w-3.5" /> Dar parecer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Subcomandante (Frans): dar o VISTO (favorável/não) */}
      {podeSubcmt && paraSubcmt.length > 0 && (
        <section className="ui-card border-sky-500/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-sky-300" /> Permutas para visto do Subcomandante
          </h2>
          <ul className="space-y-2">
            {paraSubcmt.map((p) => (
              <li key={p.id} className="rounded-lg border border-white/10 bg-[#0b1626] p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">{p.solicitante.linha}</span> ⇄ <span className="font-semibold">{p.solicitado?.linha || p.solicitadoNome}</span>
                </p>
                <p className="mt-0.5 text-xs text-sky-300">
                  {p.estado === "autorizada"
                    ? `Já autorizada pelo parecer favorável do P/1${p.p1Nome ? ` (${p.p1Nome})` : ""} — visto opcional`
                    : `Parecer não favorável do P/1${p.p1Nome ? ` (${p.p1Nome})` : ""} — decida o visto`}
                  {" "}· permuta {dBR(p.dataPermuta)} · retorno {dBR(p.dataRetorno)}
                </p>
                {p.parecerP1 && <p className="text-xs text-[#94A3B8]">Parecer: {p.parecerP1}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setDoc(p as PermutaDoc)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                    <FileText className="h-3.5 w-3.5" /> Ver documento
                  </button>
                  <button onClick={() => { setAnalisar({ p, modo: "visto" }); setVisto("autorizado"); setSenhaAss(""); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Dar visto (favorável/não)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Minhas permutas */}
      <section className="ui-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Clock className="h-4 w-4 text-[#D4AF37]" /> Minhas permutas
        </h2>
        {meus.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">Nenhuma permuta ainda. Use &ldquo;Nova solicitação de permuta&rdquo;.</p>
        ) : (
          <div className="space-y-2">
            {gruposMeus.map((g, i) => {
              const aberto = pastasAbertas[g.mes] ?? i === 0; // 1ª pasta (mais recente) aberta
              return (
                <div key={g.mes} className="overflow-hidden rounded-lg border border-white/10">
                  <button
                    onClick={() => setPastasAbertas((s) => ({ ...s, [g.mes]: !aberto }))}
                    className="flex w-full items-center gap-2 bg-[#0b1626] px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/5"
                  >
                    <Folder className="h-4 w-4 text-[#D4AF37]" />
                    {mesLabel(g.mes)}
                    <span className="rounded-full bg-white/10 px-1.5 text-xs text-[#94A3B8]">{g.itens.length}</span>
                    <ChevronDown className={`ml-auto h-4 w-4 text-[#94A3B8] transition ${aberto ? "rotate-180" : ""}`} />
                  </button>
                  {aberto && (
                    <ul className="space-y-2 p-2">
                      {g.itens.map((p) => {
                        const est = ESTADO[p.estado] || { rotulo: p.estado, cor: "bg-white/10 text-[#94A3B8]" };
                        return (
                          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#0b1626] p-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white">{p.solicitante.linha} ⇄ {p.solicitado?.linha || p.solicitadoNome}</p>
                              <p className="text-xs text-[#94A3B8]">Permuta {dBR(p.dataPermuta)} · retorno {dBR(p.dataRetorno)}</p>
                              {p.estado === "nao_autorizada" && p.parecerP1 && <p className="text-xs text-red-300">Parecer: {p.parecerP1}</p>}
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${est.cor}`}>{est.rotulo}</span>
                            <button onClick={() => setDoc(p as PermutaDoc)} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/5">
                              <FileText className="h-3.5 w-3.5" /> Documento
                            </button>
                            {p.estado === "aguardando_solicitado" && p.solicitanteId && (
                              <button onClick={() => acao({ acao: "cancelar", id: p.id }, "cancelar-" + p.id)} disabled={ocupado === "cancelar-" + p.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-[#94A3B8] hover:bg-white/5 disabled:opacity-60">
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL nova permuta */}
      {novo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setNovo(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Nova solicitação de permuta</h3>
              <button onClick={() => setNovo(false)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Colega (solicitado)</label>
                {colega ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#0b1626] px-3 py-2 text-sm text-white">
                    <span>{nomeMilitar(colega)}</span>
                    <button onClick={() => { setColega(null); setBusca(""); }} className="text-[#94A3B8] hover:text-white"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, guerra ou matrícula..."
                        className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                    </div>
                    {busca.trim().length >= 2 && (
                      <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/10">
                        {filtrados.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-[#94A3B8]">Nenhum militar encontrado.</p>
                        ) : filtrados.map((m) => (
                          <button key={m.id} onClick={() => setColega(m)} className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-white/5">
                            {nomeMilitar(m)}{m.matricula && <span className="ml-2 text-xs text-[#94A3B8]">Mat. {m.matricula}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Data da permuta</label>
                  <input type="date" value={dataPermuta} onChange={(e) => setDataPermuta(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Data de retorno <span className="text-[#6f88a8]">(opcional)</span></label>
                  <input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Motivo</label>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: assuntos pessoais"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Sua senha (para assinar)</label>
                <input type="password" value={senhaAss} onChange={(e) => setSenhaAss(e.target.value)} placeholder="confirme a assinatura com sua senha"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <p className="rounded-lg bg-white/5 p-2 text-[11px] text-[#94A3B8]">
                Ao enviar, você assina pelo seu login (posto, nº e nome de guerra) e confirma com a senha. O colega recebe o alerta para assinar o &ldquo;concordo&rdquo;.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setNovo(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                <button onClick={criar} disabled={!colega || !dataPermuta || !senhaAss || ocupado === "criar"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                  {ocupado === "criar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar e assinar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL análise: parecer (P/1) ou visto (Subcmt) */}
      {analisar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setAnalisar(null)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">{analisar.modo === "parecer" ? "Parecer do Chefe do P/1" : "Visto do Subcomandante"}</h3>
              <button onClick={() => setAnalisar(null)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-5">
              <div className="rounded-lg bg-white/5 p-3 text-sm text-white">
                {analisar.p.solicitante.linha} ⇄ {analisar.p.solicitado?.linha || analisar.p.solicitadoNome}
                <p className="text-xs text-[#94A3B8]">Permuta {dBR(analisar.p.dataPermuta)} · retorno {dBR(analisar.p.dataRetorno)}</p>
              </div>

              {analisar.modo === "parecer" ? (
                <>
                  <div className="flex gap-2">
                    <button onClick={() => setParecerFav(true)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${parecerFav ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-white/10 text-[#94A3B8] hover:bg-white/5"}`}>
                      <CheckCircle2 className="mx-auto mb-0.5 h-4 w-4" /> Favorável
                    </button>
                    <button onClick={() => setParecerFav(false)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${!parecerFav ? "border-red-500 bg-red-500/15 text-red-300" : "border-white/10 text-[#94A3B8] hover:bg-white/5"}`}>
                      <XCircle className="mx-auto mb-0.5 h-4 w-4" /> Não favorável
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Parecer (opcional)</label>
                    <textarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={3}
                      className="w-full resize-none rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    {parecerFav
                      ? "Parecer favorável já AUTORIZA a permuta e a lança na escala — o visto do Subcmt fica opcional (caixinha em branco até ele assinar)."
                      : "Parecer não favorável: segue para o Subcomandante decidir o visto (favorável/não)."}
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Sua senha (para assinar o parecer)</label>
                    <input type="password" value={senhaAss} onChange={(e) => setSenhaAss(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setAnalisar(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                    <button onClick={() => acao({ acao: "parecer", id: analisar.p.id, parecer, favoravel: parecerFav, senha: senhaAss }, "parecer")} disabled={!senhaAss || ocupado === "parecer"}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                      {ocupado === "parecer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Enviar parecer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {analisar.p.parecerP1 && <p className="rounded-lg bg-white/5 p-2 text-xs text-[#94A3B8]"><b>Parecer do P/1:</b> {analisar.p.parecerP1}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setVisto("autorizado")}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${visto === "autorizado" ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-white/10 text-[#94A3B8] hover:bg-white/5"}`}>
                      <CheckCircle2 className="mx-auto mb-0.5 h-4 w-4" /> Favorável (Autorizado)
                    </button>
                    <button onClick={() => setVisto("nao_autorizado")}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${visto === "nao_autorizado" ? "border-red-500 bg-red-500/15 text-red-300" : "border-white/10 text-[#94A3B8] hover:bg-white/5"}`}>
                      <XCircle className="mx-auto mb-0.5 h-4 w-4" /> Não autorizado
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Sua senha (para dar o visto)</label>
                    <input type="password" value={senhaAss} onChange={(e) => setSenhaAss(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setAnalisar(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                    <button onClick={() => acao({ acao: "visto", id: analisar.p.id, visto, senha: senhaAss }, "visto")} disabled={!senhaAss || ocupado === "visto"}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                      {ocupado === "visto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Registrar visto
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL assinar "concordo" (reautenticação por senha) */}
      {assinarPend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setAssinarPend(null)}>
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Assinar o &ldquo;concordo&rdquo;</h3>
              <button onClick={() => setAssinarPend(null)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-[#cdd9ea]">Permuta com <b>{assinarPend.solicitante.linha}</b>. Confirme sua assinatura com a senha — depois segue para o P/1.</p>
              <input type="password" value={senhaAss} onChange={(e) => setSenhaAss(e.target.value)} autoFocus placeholder="Sua senha"
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAssinarPend(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                <button onClick={() => acao({ acao: "assinar", id: assinarPend.id, resposta: "aceitar", senha: senhaAss }, "assinar-" + assinarPend.id)}
                  disabled={!senhaAss || ocupado === "assinar-" + assinarPend.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {ocupado === "assinar-" + assinarPend.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Assinar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {doc && <SolicitacaoPermutaDoc doc={doc} onFechar={() => setDoc(null)} />}
    </div>
  );
}
