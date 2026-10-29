"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileSignature, Eye, Download, Check, Loader2, X, ChevronDown, CalendarDays,
  Sun, Clock, History, PauseCircle, Lock,
} from "lucide-react";
import MemorandoFerias, {
  type DadosMemorando, dataExtenso, hojeExtenso, linhaAo, linhaAssinaturaDestino, OBS_PADRAO,
} from "@/components/MemorandoFerias";

/* =========================================================================
   MINHAS FÉRIAS — a tela do policial, o mais didática possível:
     · cada férias aparece UMA vez (antes: memorando, lista e equipe
       repetiam as mesmas datas);
     · a PRÓXIMA vem em destaque: datas grandes, quanto falta, quantos dias,
       apresentação e o que fazer agora (um botão só);
     · o memorando em três etapas acesas: você assina → a seção assina →
       pronto para baixar. A assinatura abre 30 dias antes das férias;
     · a CONTAGEM: antes, "faltam N dias" com a barra enchendo até o
       início; durante, "dia X de Y" com a barra até a volta ao serviço;
     · uma cor por situação (vem aí, de férias, adiada, já gozada);
     · as férias que já passaram, recolhidas no fim.
   O memorando (ver, assinar com a senha, baixar) é o mesmo da seção.
   ========================================================================= */

export type PeriodoTela = {
  rotulo: string; inicioBR: string; fimBR: string; apresBR: string;
  inicioISO: string | null; fimISO: string | null; dias: number;
};
export type CartaoFerias = {
  chave: string;
  tipo: "plano" | "avulsa";
  titulo: string;
  anoGozo: string | null; numeroEquipe: string | null;
  periodos: PeriodoTela[];
  adiado: boolean;
};

type PeriodoMemo = { rotulo: string; inicioBR: string; fimBR: string; apresBR: string };
type Memo = {
  ref: string; tipo: "memorando_ferias" | "memorando_lp";
  anoGozo: string; numeroEquipe: string; rotuloPeriodo: string;
  periodos: PeriodoMemo[];
  inicioBR: string; fimBR: string; apresentacaoBR: string;
  inicioExtenso: string; apresExtenso: string; dias: number;
  sustacao?: { motivo: string; apres1BR: string; inicio2BR: string; apres2BR: string };
  postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string;
  quadro: string; ehOficial: boolean;
  estado: "pendente" | "assinado_militar" | "concluido";
  assinaturaMilitar: { nome: string; em: string; id: string } | null;
  assinaturaChefe: { nome: string; cargo: string; em: string; id: string } | null;
  diasParaComecar: number | null;
  liberado: boolean; liberaEmBR: string;
};
type Chefe = { nome: string; funcao: string; assinatura: string; assinarGov: boolean };

const PRAZO_LP = "3 (três) meses";
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// hoje no horário do quartel, como "aaaa-mm-dd" (compara direto com as datas dos cartões)
function hojeISO(): string {
  const d = new Date(Date.now() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}
const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(iso) - Date.parse(hoje)) / 86400000);

/** Os dados do militar no formato que o memorando oficial espera. */
function dadosDo(m: Memo): DadosMemorando {
  return {
    numero: "",
    postoGrad: m.postoGrad, numeroBarra: m.numeroBarra, nome: m.nome, quadro: m.quadro, ehOficial: m.ehOficial,
    inicioBR: m.inicioBR,
    apresentacaoBR: m.sustacao ? m.sustacao.apres1BR : m.apresentacaoBR,
    diasFerias: m.dias,
    sustacao: m.sustacao ? { motivo: m.sustacao.motivo, inicio2BR: m.sustacao.inicio2BR, apres2BR: m.sustacao.apres2BR } : undefined,
    nomeGuerra: m.nomeGuerra || undefined,
    prazoTexto: PRAZO_LP,
  };
}

// cartão da licença-prêmio: sai do próprio memorando (não está no plano de férias)
function cartaoDaLP(m: Memo): CartaoFerias {
  const p = m.periodos[0];
  const isoDe = (br: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(br) ? `${br.slice(6)}-${br.slice(3, 5)}-${br.slice(0, 2)}` : null);
  return {
    chave: `lp:${m.ref}`, tipo: "plano", titulo: `Licença-Prêmio ${m.anoGozo}`,
    anoGozo: m.anoGozo, numeroEquipe: m.numeroEquipe,
    periodos: [{ rotulo: "Licença-Prêmio", inicioBR: p.inicioBR, fimBR: p.fimBR || "—", apresBR: p.apresBR || "—", inicioISO: isoDe(p.inicioBR), fimISO: isoDe(p.fimBR), dias: m.dias }],
    adiado: false,
  };
}

type Situacao =
  | { tipo: "gozando"; volta: string; dia: number; total: number; restam: number }
  | { tipo: "falta"; dias: number; progresso: number; inicioBR: string }
  | { tipo: "passou" }
  | { tipo: "sem-data" };

/* `desde`: de onde a barra da espera começa a contar — o fim das férias
   anteriores (ou, sem elas, um ano antes do início). */
function situacaoDe(c: CartaoFerias, hoje: string, desde: string | null): Situacao {
  const ini = c.periodos.map((p) => p.inicioISO).filter(Boolean).sort()[0];
  const fim = c.periodos.map((p) => p.fimISO).filter(Boolean).sort().slice(-1)[0];
  if (!ini) return { tipo: "sem-data" };
  if (fim && fim < hoje) return { tipo: "passou" };
  const atual = c.periodos.find((p) => p.inicioISO && p.fimISO && p.inicioISO <= hoje && hoje <= p.fimISO);
  if (atual && atual.inicioISO && atual.fimISO) {
    const total = diasAte(atual.fimISO, atual.inicioISO) + 1;
    return { tipo: "gozando", volta: atual.apresBR, dia: diasAte(hoje, atual.inicioISO) + 1, total, restam: diasAte(atual.fimISO, hoje) + 1 };
  }
  const prox = c.periodos.find((p) => p.inicioISO && p.inicioISO > hoje) || c.periodos[0];
  const alvo = prox.inicioISO || ini;
  // entre os dois períodos da mesma férias, a espera conta do fim do 1º
  const antes = [desde, ...c.periodos.map((p) => p.fimISO)].filter((x): x is string => !!x && x < alvo).sort().slice(-1)[0];
  const comeco = antes || new Date(Date.parse(alvo) - 365 * 86400000).toISOString().slice(0, 10);
  const total = Math.max(1, diasAte(alvo, comeco));
  const dias = diasAte(alvo, hoje);
  return { tipo: "falta", dias, progresso: Math.min(1, Math.max(0, 1 - dias / total)), inicioBR: prox.inicioBR };
}

export default function MinhasFeriasPainel({ cartoes }: { cartoes: CartaoFerias[] }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [chefe, setChefe] = useState<Chefe | null>(null);
  const [vendo, setVendo] = useState<Memo | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [assinando, setAssinando] = useState<Memo | null>(null);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const hoje = hojeISO();

  const puxar = useCallback(async () => {
    try {
      const r = await fetch("/api/ferias/meu-memorando", { cache: "no-store" });
      const d = await r.json();
      if (Array.isArray(d?.memorandos)) setMemos(d.memorandos);
    } catch { /* sem rede: os cartões aparecem sem o memorando */ }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => {
    puxar();
    fetch("/api/escala-chefe").then((r) => r.json()).then((d) => setChefe({
      nome: String(d?.nome || ""), funcao: String(d?.funcao || ""),
      assinatura: String(d?.assinatura || ""), assinarGov: d?.assinarGov === true,
    })).catch(() => { /* o documento sai sem o nome do chefe */ });
  }, [puxar]);

  // o memorando de cada cartão (férias: pelo ano e equipe; LP: o próprio)
  const todos = useMemo(() => {
    const lista = [...cartoes, ...memos.filter((m) => m.tipo === "memorando_lp").map(cartaoDaLP)];
    // o fim mais recente ANTES de cada férias: o começo da contagem dela
    const fins = lista.flatMap((x) => x.periodos.map((p) => p.fimISO)).filter((x): x is string => !!x).sort();
    return lista
      .map((c) => ({
        c,
        memo: c.chave.startsWith("lp:")
          ? memos.find((m) => `lp:${m.ref}` === c.chave) || null
          : c.tipo === "plano" ? memos.find((m) => m.tipo === "memorando_ferias" && m.anoGozo === c.anoGozo && m.numeroEquipe === c.numeroEquipe) || null : null,
        // (só férias que já acabaram: a espera não começa no futuro)
        sit: situacaoDe(c, hoje, fins.filter((f) => f < (c.periodos[0]?.inicioISO || "") && f <= hoje).slice(-1)[0] || null),
      }))
      .sort((a, b) => (a.c.periodos[0]?.inicioISO || "9").localeCompare(b.c.periodos[0]?.inicioISO || "9"));
  }, [cartoes, memos, hoje]);

  const futuras = todos.filter((x) => x.sit.tipo !== "passou");
  const anteriores = todos.filter((x) => x.sit.tipo === "passou").reverse();
  const [destaque, ...proximas] = futuras;

  async function confirmarAssinatura() {
    if (!assinando || !senha.trim()) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/ferias/meu-memorando", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: assinando.ref, tipo: assinando.tipo, senha }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível assinar."); return; }
      setAssinando(null); setSenha("");
      setMsg("Memorando assinado! O P/1 já foi avisado. Quando a seção assinar, você recebe um aviso no celular.");
      puxar();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  /* O .docx com os MESMOS campos do memorando que a seção emite. */
  async function baixar(m: Memo) {
    setBaixando(m.ref + m.tipo); setErro("");
    const ehLP = m.tipo === "memorando_lp";
    const d = dadosDo(m);
    try {
      const res = await fetch("/api/ferias/memorando-docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: "", ano: m.anoGozo,
          cidadeData: `Presidente Dutra-MA, ${hojeExtenso()}.`,
          de: "1º Ten QOEM Chefe da 1ª Seção do 18º BPM.",
          ao: `${linhaAo(d)}.`,
          assunto: ehLP ? `Concessão de Licença-Prêmio (${PRAZO_LP}).` : `Concessão de Férias (${m.dias} dias).`,
          inicioExtenso: `<strong><u>${dataExtenso(m.inicioBR)}</u></strong>`,
          apresExtenso: `<strong><u>${dataExtenso(m.apresentacaoBR)}, às 07h30min</u></strong>`,
          dias: String(m.dias), prazo: PRAZO_LP, exercicio: String(Number(m.anoGozo) - 1),
          variante: ehLP ? "licenca" : "ferias", observacao: OBS_PADRAO,
          assinaturaAo: linhaAssinaturaDestino(d),
          nomeCmt: chefe?.nome || "", cargoCmt: chefe?.funcao || "",
          assinaturaChefe: chefe && !chefe.assinarGov ? chefe.assinatura : "",
        }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Memorando_${ehLP ? "LicencaPremio" : "Ferias"}_${m.anoGozo}_18BPM.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setErro("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBaixando(null);
    }
  }

  const acoes = { ver: setVendo, assinar: (m: Memo) => { setAssinando(m); setSenha(""); setErro(""); }, baixar, baixando };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}
      {erro && !assinando && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          <span>{erro}</span>
          <button onClick={() => setErro("")} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ---------- a próxima, em destaque ---------- */}
      {destaque ? (
        <Cartao item={destaque} hoje={hoje} grande carregando={carregando} acoes={acoes} />
      ) : (
        <div className="rounded-2xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center">
          <Sun className="mx-auto mb-2 h-8 w-8 text-teal-300" />
          <p className="text-sm font-semibold text-white">Nenhuma férias marcada para você no momento.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">Quando o P/1 lançar o plano de férias, ela aparece aqui.</p>
        </div>
      )}

      {/* ---------- as outras que ainda vêm ---------- */}
      {proximas.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#94A3B8]">
            <CalendarDays className="h-4 w-4" /> Depois dessa
          </h2>
          <div className="space-y-3">
            {proximas.map((x) => <Cartao key={x.c.chave} item={x} hoje={hoje} carregando={carregando} acoes={acoes} />)}
          </div>
        </section>
      )}

      {/* ---------- as que já passaram ---------- */}
      {anteriores.length > 0 && (
        <details className="group rounded-xl border border-[#1d2c44] bg-[#0F1B2D]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[#cdd9ea]">
            <History className="h-4 w-4 text-[#94A3B8]" /> Férias anteriores ({anteriores.length})
            <ChevronDown className="ml-auto h-4 w-4 text-[#94A3B8] transition group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-white/5 p-3">
            {anteriores.map((x) => <Cartao key={x.c.chave} item={x} hoje={hoje} carregando={carregando} acoes={acoes} />)}
          </div>
        </details>
      )}

      {/* o memorando oficial na tela — só leitura */}
      {vendo && (
        <MemorandoFerias
          dados={dadosDo(vendo)} ano={vendo.anoGozo}
          variante={vendo.tipo === "memorando_lp" ? "licenca" : "ferias"}
          tipoAssinatura={vendo.tipo} refAssinatura={vendo.ref}
          somenteLeitura onFechar={() => setVendo(null)}
        />
      )}

      {/* confirmação da assinatura */}
      {assinando && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0F1B2D] p-5">
            <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
              <FileSignature className="h-5 w-5 text-[#D4AF37]" /> Assinar memorando
            </h3>
            <p className="mb-3 text-sm text-[#94A3B8]">
              {assinando.tipo === "memorando_lp" ? "Licença-Prêmio" : "Férias"} {assinando.anoGozo} · {assinando.inicioBR} a {assinando.fimBR || "—"}
            </p>
            <p className="mb-3 rounded bg-white/[.04] px-2.5 py-2 text-xs text-[#cdd9ea]">
              Ao assinar, você confirma que está ciente do período. O P/1 é avisado na hora e a seção completa a assinatura.
            </p>
            <label className="mb-1 block text-xs font-medium text-[#cdd9ea]" htmlFor="senha-memo">Confirme sua senha</label>
            <input
              id="senha-memo" type="password" value={senha} autoFocus
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarAssinatura(); }}
              placeholder="sua senha do SIGEP"
              className="mb-3 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#D4AF37]"
            />
            {erro && <p className="mb-3 text-xs text-red-300">{erro}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => { setAssinando(null); setErro(""); }}
                className="rounded-lg border border-white/15 px-3 py-2.5 text-sm font-semibold text-[#94A3B8] hover:text-white">
                Cancelar
              </button>
              <button onClick={confirmarAssinatura} disabled={enviando || !senha.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1a1205] hover:brightness-110 disabled:opacity-50">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar e assinar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ cartão */

type Acoes = {
  ver: (m: Memo) => void; assinar: (m: Memo) => void; baixar: (m: Memo) => void; baixando: string | null;
};

function Selo({ sit, adiado }: { sit: Situacao; adiado: boolean }) {
  if (adiado) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-300"><PauseCircle className="h-3.5 w-3.5" /> adiada</span>;
  if (sit.tipo === "gozando") return <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/20 px-2.5 py-1 text-[11px] font-bold uppercase text-teal-200"><Sun className="h-3.5 w-3.5" /> você está de férias</span>;
  if (sit.tipo === "falta") {
    const t = sit.dias === 0 ? "começa hoje" : sit.dias === 1 ? "começa amanhã" : `faltam ${sit.dias} dias`;
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/15 px-2.5 py-1 text-[11px] font-bold uppercase text-[#D4AF37]"><Clock className="h-3.5 w-3.5" /> {t}</span>;
  }
  if (sit.tipo === "passou") return <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase text-[#94A3B8]">já gozada</span>;
  return null;
}

const COR = {
  vem: { borda: "border-[#D4AF37]/40 border-l-[#D4AF37]", fundo: "from-[#D4AF37]/[.12]", sombra: "shadow-[0_14px_40px_-20px_rgba(212,175,55,.45)]", texto: "text-[#D4AF37]" },
  gozando: { borda: "border-teal-400/40 border-l-teal-400", fundo: "from-teal-500/[.16]", sombra: "shadow-[0_14px_40px_-20px_rgba(45,212,191,.45)]", texto: "text-teal-300" },
  adiada: { borda: "border-amber-500/30 border-l-amber-500", fundo: "from-amber-500/[.10]", sombra: "", texto: "text-amber-300" },
  passou: { borda: "border-[#1d2c44] border-l-slate-600", fundo: "from-white/[.03]", sombra: "", texto: "text-[#94A3B8]" },
};

/* O contador e a barra que enche: antes das férias, até o início (dourada;
   nos últimos 30 dias — quando o memorando abre — fica verde); durante,
   até a volta ao serviço (verde-água). A barra cresce ao abrir a tela. */
function Contagem({ sit, grande }: { sit: Extract<Situacao, { tipo: "falta" | "gozando" }>; grande: boolean }) {
  const [cheio, setCheio] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCheio(true), 60); return () => clearTimeout(t); }, []);
  const gozando = sit.tipo === "gozando";
  const pct = gozando ? Math.min(1, sit.dia / sit.total) : sit.progresso;
  const perto = !gozando && sit.dias <= 30;
  const numero = gozando ? sit.restam : sit.dias;
  const barra = gozando ? "from-teal-400 to-cyan-300" : perto ? "from-amber-400 via-lime-400 to-emerald-400" : "from-[#b8932a] to-[#f3d27a]";
  const corNum = gozando ? "from-teal-200 to-cyan-300" : perto ? "from-amber-200 to-emerald-300" : "from-[#f3df9d] to-[#D4AF37]";
  const rotulo = gozando
    ? (numero === 1 ? "dia para voltar ao serviço" : "dias para voltar ao serviço")
    : sit.dias === 0 ? "as suas férias começam HOJE!" : sit.dias === 1 ? "dia para as suas férias" : "dias para as suas férias";

  return (
    <div className={`mb-3 rounded-xl border border-white/5 bg-black/25 ${grande ? "p-4" : "p-3"}`}>
      <div className="flex items-end gap-3">
        {!(sit.tipo === "falta" && sit.dias === 0) && (
          <span className={`bg-gradient-to-br ${corNum} bg-clip-text font-black leading-none text-transparent ${grande ? "text-6xl" : "text-4xl"}`}>{numero}</span>
        )}
        <span className="pb-1">
          <span className={`block font-bold text-white ${grande ? "text-base" : "text-sm"}`}>{rotulo}</span>
          <span className="block text-xs text-[#94A3B8]">
            {gozando ? <>Dia <b className="text-teal-200">{sit.dia}</b> de {sit.total} · apresentação em <b className="text-white">{sit.volta}</b></>
              : <>começam em <b className="text-white">{sit.inicioBR}</b>{perto && sit.dias > 0 && " · reta final!"}</>}
          </span>
        </span>
      </div>
      <div className={`mt-3 overflow-hidden rounded-full bg-white/10 ${grande ? "h-3" : "h-2"}`} role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <div className={`h-full rounded-full bg-gradient-to-r ${barra} transition-[width] duration-[1400ms] ease-out`}
          style={{ width: `${cheio ? Math.max(3, pct * 100) : 0}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-[#5b6b85]">
        <span>{gozando ? "início" : "espera"}</span>
        <span>{gozando ? "volta ao serviço" : "férias"}</span>
      </div>
    </div>
  );
}

function Cartao({ item, hoje, grande = false, carregando, acoes }: {
  item: { c: CartaoFerias; memo: Memo | null; sit: Situacao };
  hoje: string; grande?: boolean; carregando: boolean; acoes: Acoes;
}) {
  const { c, memo, sit } = item;
  const totalDias = c.periodos.reduce((s, p) => s + p.dias, 0);
  const passou = sit.tipo === "passou";
  // uma cor por situação: dourado (vem aí), verde-água (de férias), âmbar (adiada), cinza (já gozada)
  const cor = c.adiado ? COR.adiada : sit.tipo === "gozando" ? COR.gozando : passou ? COR.passou : COR.vem;
  return (
    <article className={`overflow-hidden border border-l-4 ${cor.borda} ${grande
      ? `rounded-2xl bg-gradient-to-br ${cor.fundo} via-[#0F1B2D] to-[#0F1B2D] ${cor.sombra}`
      : "rounded-xl bg-[#0F1B2D]"}`}>
      <div className={grande ? "p-5" : "p-4"}>
        {grande && <p className={`mb-1 text-[11px] font-black uppercase tracking-[0.2em] ${cor.texto}`}>{sit.tipo === "gozando" ? "Boas férias!" : "Suas próximas férias"}</p>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className={`${grande ? "text-lg" : "text-sm"} font-bold text-white`}>
            {c.titulo}
            {c.numeroEquipe && !c.chave.startsWith("lp:") && <span className="ml-2 text-xs font-normal text-[#94A3B8]">Equipe {c.numeroEquipe}</span>}
          </p>
          {/* com a contagem à vista, o selo de "faltam N dias" seria repetido */}
          {(c.adiado || (sit.tipo !== "falta" && sit.tipo !== "gozando")) && <Selo sit={sit} adiado={c.adiado} />}
        </div>

        {/* a contagem: quanto falta para começar / para voltar */}
        {!c.adiado && (sit.tipo === "falta" || sit.tipo === "gozando") && <Contagem sit={sit} grande={grande} />}

        {/* as datas, grandes e claras */}
        <div className="space-y-2">
          {c.periodos.map((p, i) => (
            <div key={i} className="rounded-xl bg-black/20 p-3">
              {c.periodos.length > 1 && <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">{p.rotulo}</p>}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`${grande ? "text-2xl" : "text-lg"} font-extrabold text-white`}>{p.inicioBR}</span>
                <span className="text-sm text-[#94A3B8]">até</span>
                <span className={`${grande ? "text-2xl" : "text-lg"} font-extrabold text-white`}>{p.fimBR}</span>
              </div>
              <p className="mt-1 text-xs text-[#cdd9ea]">
                {p.dias > 0 && <><b>{p.dias} dias</b> · </>}
                volta ao serviço (apresentação) em <b className="text-white">{p.apresBR}</b>, às 07h30
              </p>
            </div>
          ))}
          {c.periodos.length > 1 && totalDias > 0 && <p className="text-xs text-[#94A3B8]">Total: <b className="text-[#cdd9ea]">{totalDias} dias</b> em {c.periodos.length} períodos.</p>}
        </div>

        {c.adiado && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-100">
            Você adiou estas férias: neste período continua no serviço normal. Dúvidas, fale com o P/1.
          </p>
        )}

        {/* memorando */}
        {c.tipo === "plano" && !c.adiado && (
          carregando
            ? <p className="mt-3 flex items-center gap-2 text-xs text-[#94A3B8]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando o memorando…</p>
            : memo && <BlocoMemorando m={memo} passou={passou} acoes={acoes} />
        )}

      </div>
    </article>
  );
}

/* As três etapas do memorando, acesas conforme andam. */
function BlocoMemorando({ m, passou, acoes }: { m: Memo; passou: boolean; acoes: Acoes }) {
  const etapas = [
    { rotulo: "Você assina", feito: !!m.assinaturaMilitar, quando: m.assinaturaMilitar?.em },
    { rotulo: "A seção (P/1) assina", feito: !!m.assinaturaChefe, quando: m.assinaturaChefe?.em },
    { rotulo: "Pronto para baixar", feito: m.estado === "concluido", quando: undefined },
  ];
  const atual = etapas.findIndex((e) => !e.feito);
  const bloqueado = m.estado === "pendente" && !m.liberado;
  const chave = m.ref + m.tipo;

  let oQueFazer: React.ReactNode;
  if (m.estado === "concluido") oQueFazer = <><b>Memorando pronto.</b> Assinado por você e pela seção — pode ver ou baixar quando precisar.</>;
  else if (m.estado === "assinado_militar") oQueFazer = <><b>Você já assinou.</b> Agora é com a seção: quando o P/1 assinar, chega um aviso no seu celular.</>;
  else if (bloqueado) oQueFazer = <><b>Nada a fazer agora.</b> A assinatura abre em <b>{m.liberaEmBR}</b>, 30 dias antes das férias. Você já pode ver o documento.</>;
  else oQueFazer = <><b>Falta a sua assinatura.</b> Confira o memorando e assine — leva menos de um minuto.</>;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[.02] p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
        <FileSignature className="h-4 w-4 text-[#D4AF37]" /> Memorando de férias
      </p>

      {/* as três etapas */}
      <ol className="mb-3 grid grid-cols-3 gap-1">
        {etapas.map((e, i) => {
          const agora = i === atual && !bloqueado && !passou;
          return (
            <li key={i} className="relative flex flex-col items-center text-center">
              {i > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full ${etapas[i - 1].feito ? "bg-emerald-500/60" : "bg-white/10"}`} />}
              <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${
                e.feito ? "border-emerald-500 bg-emerald-500 text-white"
                  : agora ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]"
                  : "border-white/15 bg-[#0F1B2D] text-[#5b6b85]"}`}>
                {e.feito ? <Check className="h-4 w-4" strokeWidth={3} /> : i === 0 && bloqueado ? <Lock className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`mt-1 text-[11px] leading-tight ${e.feito ? "text-emerald-300" : agora ? "font-bold text-white" : "text-[#94A3B8]"}`}>{e.rotulo}</span>
              {e.quando && <span className="text-[10px] text-[#5b6b85]">{dataHora(e.quando)}</span>}
            </li>
          );
        })}
      </ol>

      {!passou && <p className="mb-3 rounded-lg bg-black/20 px-3 py-2 text-xs leading-relaxed text-[#cdd9ea]">{oQueFazer}</p>}

      {/* um botão principal; os outros discretos */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {m.estado === "pendente" && m.liberado && !passou && (
          <button onClick={() => acoes.assinar(m)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1a1205] transition hover:brightness-110">
            <FileSignature className="h-4 w-4" /> Assinar memorando
          </button>
        )}
        {m.estado === "concluido" && (
          <button onClick={() => acoes.baixar(m)} disabled={acoes.baixando === chave}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60">
            {acoes.baixando === chave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {acoes.baixando === chave ? "Gerando…" : "Baixar memorando"}
          </button>
        )}
        <button onClick={() => acoes.ver(m)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-[#cdd9ea] transition hover:border-[#D4AF37] hover:text-white">
          <Eye className="h-4 w-4" /> Ver memorando
        </button>
        {m.estado !== "concluido" && (
          <button onClick={() => acoes.baixar(m)} disabled={acoes.baixando === chave}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-[#94A3B8] transition hover:text-white disabled:opacity-60">
            {acoes.baixando === chave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar
          </button>
        )}
      </div>
    </div>
  );
}
