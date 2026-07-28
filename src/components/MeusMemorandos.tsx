"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileSignature, Eye, Download, Check, Clock, Loader2, X, ShieldCheck, AlertCircle,
} from "lucide-react";
import MemorandoFerias, {
  type DadosMemorando, dataExtenso, hojeExtenso, linhaAo, linhaAssinaturaDestino, OBS_PADRAO,
} from "@/components/MemorandoFerias";

/* =========================================================================
   Memorando do militar — ver, assinar e baixar.

   A dinâmica, em três passos:
     1. o militar assina o memorando (confirmando a senha);
     2. o P/1 e os auxiliares recebem o aviso e a seção assina;
     3. o militar recebe no celular que o documento ficou pronto.

   O documento que aparece aqui é exatamente o mesmo que o P/1 emite — só
   que em modo de leitura: o militar vê na tela, imprime ou baixa, mas não
   edita o texto.
   ========================================================================= */

type Periodo = { rotulo: string; inicioBR: string; fimBR: string; apresBR: string };

type Memo = {
  ref: string; tipo: "memorando_ferias" | "memorando_lp";
  anoGozo: string; numeroEquipe: string; rotuloPeriodo: string;
  periodos: Periodo[];
  inicioBR: string; fimBR: string; apresentacaoBR: string;
  inicioExtenso: string; apresExtenso: string; dias: number;
  postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string;
  quadro: string; ehOficial: boolean;
  estado: "pendente" | "assinado_militar" | "concluido";
  assinaturaMilitar: { nome: string; em: string; id: string } | null;
  assinaturaChefe: { nome: string; cargo: string; em: string; id: string } | null;
  diasParaComecar: number | null;
};

type Chefe = { nome: string; funcao: string; assinatura: string; assinarGov: boolean };

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });

const PRAZO_LP = "3 (três) meses";

/** Os dados do militar no formato que o memorando oficial espera. */
function dadosDo(m: Memo): DadosMemorando {
  return {
    numero: "",              // a numeração é da seção; aqui sai "s/n"
    postoGrad: m.postoGrad,
    numeroBarra: m.numeroBarra,
    nome: m.nome,
    quadro: m.quadro,
    ehOficial: m.ehOficial,
    inicioBR: m.inicioBR,
    apresentacaoBR: m.apresentacaoBR,
    diasFerias: m.dias,
    nomeGuerra: m.nomeGuerra || undefined,
    prazoTexto: PRAZO_LP,
  };
}

/* ---------- andamento das assinaturas, sempre à vista ---------- */
function Andamento({ m }: { m: Memo }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <div className={`rounded border p-2.5 text-xs ${m.assinaturaMilitar ? "border-emerald-500/40 bg-emerald-950/25" : "border-white/10"}`}>
        <p className="mb-0.5 font-bold uppercase tracking-wide text-[#94A3B8]">1. Militar interessado (você)</p>
        {m.assinaturaMilitar ? (
          <>
            <p className="flex items-center gap-1 font-semibold text-emerald-300"><Check className="h-3 w-3" /> {m.assinaturaMilitar.nome}</p>
            <p className="text-[#94A3B8]">{dataHora(m.assinaturaMilitar.em)}</p>
            <p className="mt-0.5 font-mono text-[10px] text-[#5b6b85]">{m.assinaturaMilitar.id}</p>
          </>
        ) : <p className="text-[#5b6b85]">aguardando a sua assinatura</p>}
      </div>
      <div className={`rounded border p-2.5 text-xs ${m.assinaturaChefe ? "border-emerald-500/40 bg-emerald-950/25" : "border-white/10"}`}>
        <p className="mb-0.5 font-bold uppercase tracking-wide text-[#94A3B8]">2. Seção (P/1)</p>
        {m.assinaturaChefe ? (
          <>
            <p className="flex items-center gap-1 font-semibold text-emerald-300"><Check className="h-3 w-3" /> {m.assinaturaChefe.nome}</p>
            <p className="text-[#94A3B8]">{m.assinaturaChefe.cargo}</p>
            <p className="text-[#94A3B8]">{dataHora(m.assinaturaChefe.em)}</p>
            <p className="mt-0.5 font-mono text-[10px] text-[#5b6b85]">{m.assinaturaChefe.id}</p>
          </>
        ) : <p className="text-[#5b6b85]">aguardando a assinatura da seção</p>}
      </div>
    </div>
  );
}

export default function MeusMemorandos() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [chefe, setChefe] = useState<Chefe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [vendo, setVendo] = useState<Memo | null>(null);      // documento aberto na tela
  const [baixando, setBaixando] = useState<string | null>(null);
  const [assinando, setAssinando] = useState<Memo | null>(null);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const puxar = useCallback(async () => {
    try {
      const r = await fetch("/api/ferias/meu-memorando");
      const d = await r.json();
      if (Array.isArray(d?.memorandos)) setMemos(d.memorandos);
    } catch { /* silencioso */ }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => {
    puxar();
    fetch("/api/escala-chefe")
      .then((r) => r.json())
      .then((d) => setChefe({
        nome: String(d?.nome || ""), funcao: String(d?.funcao || ""),
        assinatura: String(d?.assinatura || ""), assinarGov: d?.assinarGov === true,
      }))
      .catch(() => { /* o documento sai sem o nome do chefe */ });
  }, [puxar]);

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
      setMsg("Memorando assinado. O P/1 já foi avisado e vai dar seguimento — você recebe um aviso quando a seção assinar.");
      puxar();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  /* Baixa o .docx montado com os MESMOS campos do memorando que a seção
     emite — por isso reaproveita os formatadores do MemorandoFerias. */
  async function baixar(m: Memo) {
    setBaixando(m.ref + m.tipo); setErro("");
    const ehLP = m.tipo === "memorando_lp";
    const d = dadosDo(m);
    try {
      const res = await fetch("/api/ferias/memorando-docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: "",
          ano: m.anoGozo,
          cidadeData: `Presidente Dutra-MA, ${hojeExtenso()}.`,
          de: "1º Ten QOEM Chefe da 1ª Seção do 18º BPM.",
          ao: `${linhaAo(d)}.`,
          assunto: ehLP ? `Concessão de Licença-Prêmio (${PRAZO_LP}).` : `Concessão de Férias (${m.dias} dias).`,
          inicioExtenso: `<strong><u>${dataExtenso(m.inicioBR)}</u></strong>`,
          apresExtenso: `<strong><u>${dataExtenso(m.apresentacaoBR)}, às 07h30min</u></strong>`,
          dias: String(m.dias),
          prazo: PRAZO_LP,
          exercicio: String(Number(m.anoGozo) - 1),
          variante: ehLP ? "licenca" : "ferias",
          observacao: OBS_PADRAO,
          assinaturaAo: linhaAssinaturaDestino(d),
          nomeCmt: chefe?.nome || "",
          cargoCmt: chefe?.funcao || "",
          assinaturaChefe: chefe && !chefe.assinarGov ? chefe.assinatura : "",
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
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

  if (carregando) return <p className="py-6 text-center text-sm text-[#94A3B8]">Carregando memorandos…</p>;
  if (memos.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
        <FileSignature className="h-5 w-5 text-[#D4AF37]" /> Meus memorandos
      </h2>
      <p className="mb-3 text-sm text-[#94A3B8]">
        Quando a sua equipe de férias se aproximar, assine aqui o seu memorando.
      </p>

      {/* como funciona — bem explicado, o militar não precisa perguntar nada */}
      <ol className="mb-4 grid gap-2 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-3 text-xs text-[#cdd9ea] sm:grid-cols-3">
        <li className="flex gap-2"><span className="font-bold text-[#D4AF37]">1.</span> Você confere o documento e clica em <b>Assinar memorando</b> (confirma com a sua senha).</li>
        <li className="flex gap-2"><span className="font-bold text-[#D4AF37]">2.</span> O P/1 e os auxiliares recebem o aviso na hora e o chefe da seção assina.</li>
        <li className="flex gap-2"><span className="font-bold text-[#D4AF37]">3.</span> Você recebe o aviso no celular de que ficou pronto — aí é só baixar.</li>
      </ol>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}
      {erro && !assinando && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          <span>{erro}</span>
          <button onClick={() => setErro("")} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="space-y-3">
        {memos.map((m) => {
          const chave = m.ref + m.tipo;
          const faltaMinha = m.estado === "pendente";
          return (
            <div key={chave} className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
              {/* cabeçalho do cartão */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white">
                    {m.tipo === "memorando_lp" ? "Licença-Prêmio" : "Férias"} {m.anoGozo}
                    <span className="ml-2 text-xs font-normal text-[#94A3B8]">Equipe {m.numeroEquipe}</span>
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {m.periodos.map((p, i) => (
                      <li key={i} className="text-xs text-[#94A3B8]">
                        {p.rotulo}: <b className="text-[#cdd9ea]">{p.inicioBR}</b> a <b className="text-[#cdd9ea]">{p.fimBR || "—"}</b>
                        {p.apresBR ? ` · apresentação ${p.apresBR}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
                {m.estado === "concluido" ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> assinado pelos dois
                  </span>
                ) : m.estado === "assinado_militar" ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-300">
                    <Clock className="h-3.5 w-3.5" /> aguardando a seção
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-[#D4AF37]/20 px-2.5 py-1 text-[11px] font-bold uppercase text-[#D4AF37]">
                    <AlertCircle className="h-3.5 w-3.5" /> falta a sua assinatura
                  </span>
                )}
              </div>

              {/* o que fazer agora */}
              <p className="mb-3 rounded bg-white/[.03] px-2.5 py-2 text-xs text-[#cdd9ea]">
                {faltaMinha && (
                  <>
                    <b>O que fazer agora:</b> clique em <b>Ver memorando</b> para conferir na tela (sem baixar) e
                    depois em <b>Assinar memorando</b>.
                    {m.diasParaComecar !== null && m.diasParaComecar >= 0 && m.diasParaComecar <= 60 && (
                      <> Suas férias começam em <b>{m.diasParaComecar} dia(s)</b>.</>
                    )}
                  </>
                )}
                {m.estado === "assinado_militar" && (
                  <><b>Você já assinou.</b> O P/1 foi avisado e a seção vai assinar. Quando isso acontecer, você
                  recebe um aviso no celular e no sininho.</>
                )}
                {m.estado === "concluido" && (
                  <><b>Documento pronto.</b> Assinado por você e pela seção — pode ver na tela ou baixar quando precisar.</>
                )}
              </p>

              {/* botões */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setVendo(m)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#cdd9ea] transition hover:border-[#D4AF37] hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5" /> Ver memorando (sem baixar)
                </button>

                {faltaMinha && (
                  <button
                    onClick={() => { setAssinando(m); setSenha(""); setErro(""); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#1a1205] transition hover:brightness-110"
                  >
                    <FileSignature className="h-3.5 w-3.5" /> Assinar memorando
                  </button>
                )}

                <button
                  onClick={() => baixar(m)}
                  disabled={baixando === chave}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#cdd9ea] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-60"
                >
                  {baixando === chave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {baixando === chave ? "Gerando…" : "Baixar memorando"}
                </button>
              </div>

              <Andamento m={m} />
            </div>
          );
        })}
      </div>

      {/* o memorando oficial na tela — só leitura (imprimir/PDF e Word na barra) */}
      {vendo && (
        <MemorandoFerias
          dados={dadosDo(vendo)}
          ano={vendo.anoGozo}
          variante={vendo.tipo === "memorando_lp" ? "licenca" : "ferias"}
          tipoAssinatura={vendo.tipo}
          refAssinatura={vendo.ref}
          somenteLeitura
          onFechar={() => setVendo(null)}
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
              {assinando.tipo === "memorando_lp" ? "Licença-Prêmio" : "Férias"} {assinando.anoGozo} ·{" "}
              {assinando.inicioBR} a {assinando.fimBR || "—"}
            </p>
            <p className="mb-3 rounded bg-white/[.04] px-2.5 py-2 text-xs text-[#cdd9ea]">
              Ao assinar, você dá ciência do período. O P/1 é avisado na hora e a seção completa a assinatura.
            </p>
            <label className="mb-1 block text-xs font-medium text-[#cdd9ea]" htmlFor="senha-memo">Confirme sua senha</label>
            <input
              id="senha-memo" type="password" value={senha} autoFocus
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarAssinatura(); }}
              placeholder="sua senha do SIGEP"
              className="mb-3 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-[#D4AF37]"
            />
            {erro && <p className="mb-3 text-xs text-red-300">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setAssinando(null); setErro(""); }}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#94A3B8] hover:text-white">
                Cancelar
              </button>
              <button onClick={confirmarAssinatura} disabled={enviando || !senha.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#1a1205] hover:brightness-110 disabled:opacity-50">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar e assinar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
