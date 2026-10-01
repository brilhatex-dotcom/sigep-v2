"use client";

import { Fragment, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileCheck2,
  Loader2,
  FileStack,
  Download,
  AlertTriangle,
  ExternalLink,
  Send,
  CheckCircle2,
  Clock,
  ChevronDown,
  Link2,
  Zap,
  Check,
  Lock,
  ChevronRight,
  FileBadge,
} from "lucide-react";
import { LINKS_OFICIAIS, LINK_CERTIDAO_UNIFICADA, ORDENS_UNIFICADA, faltasDidaticas } from "@/lib/certidoes";
import { LIMITE_CERTIDAO_BYTES as LIMITE_BYTES } from "@/lib/promocaoUpload";
import { confirmar } from "@/components/Avisos";

type Item = {
  ordem: number;
  orgao: string;
  descricao: string;
  link: string;
  linkRotulo: string;
  enviada: boolean;
  nomeArquivo: string | null;
  // preenchida de uma vez pela Certidão Unificada da Justiça Federal (itens 4 a 8)
  pelaUnificada: boolean;
};

/* =========================================================================
   OS TRÊS PASSOS — cada um abre com uma FAIXA que muda de cor com o andamento,
   para o militar ver de longe onde está:
     · dourada  -> é o passo da vez;
     · verde    -> concluído;
     · azul     -> enviado, esperando o P/1;
     · cinza    -> ainda não liberou (depende do passo anterior).
   ========================================================================= */
type EstadoPasso = "feito" | "atual" | "espera" | "bloqueado";

const COR_FAIXA: Record<EstadoPasso, string> = {
  feito: "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white",
  atual: "bg-gradient-to-r from-[#D4AF37] via-[#e8c55a] to-amber-500 text-[#1a1205]",
  espera: "bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-500 text-white",
  bloqueado: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 text-slate-200",
};
const COR_MOLDURA: Record<EstadoPasso, string> = {
  feito: "border-emerald-500/40",
  atual: "border-[#D4AF37]/70 shadow-[0_10px_30px_-12px_rgba(212,175,55,0.55)]",
  espera: "border-sky-500/40",
  bloqueado: "border-white/10",
};

function FaixaPasso({ numero, titulo, dica, estado, situacao }: {
  numero: number; titulo: string; dica: string; estado: EstadoPasso; situacao: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${COR_FAIXA[estado]}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/20 text-lg font-black ring-2 ring-white/30">
        {estado === "feito" ? <Check className="h-5 w-5" strokeWidth={3} />
          : estado === "bloqueado" ? <Lock className="h-4 w-4" />
          : numero}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] opacity-80">{numero}º passo</p>
        <p className="text-base font-bold leading-tight">{titulo}</p>
        <p className="text-[11px] opacity-80">{dica}</p>
      </div>
      <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold sm:inline-flex">
        {estado === "atual" && <span className="h-2 w-2 animate-pulse rounded-full bg-current" />}
        {situacao}
      </span>
    </div>
  );
}

function dataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

export default function MinhasCertidoes({
  itens,
  total,
  pdfUnificadoKey,
  efetivoId,
  enviadoP1Em,
  recebidoP1Em,
  children,
}: {
  itens: Item[];
  total: number;
  pdfUnificadoKey: string | null;
  efetivoId: string;
  enviadoP1Em: string | null;
  recebidoP1Em: string | null;
  // o que mais a página quiser mostrar depois da lista (ex.: a declaração individual)
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(itens);
  const [unificadoKey, setUnificadoKey] = useState(pdfUnificadoKey);
  // o item sendo enviado, ou "unificada" (a Certidão Unificada, itens 4 a 8)
  const [enviando, setEnviando] = useState<number | "unificada" | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [linksAbertos, setLinksAbertos] = useState(false);
  const [enviadoP1, setEnviadoP1] = useState<string | null>(enviadoP1Em);
  const [recebidoP1, setRecebidoP1] = useState<string | null>(recebidoP1Em);
  const [enviandoP1, setEnviandoP1] = useState(false);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const inputUnificada = useRef<HTMLInputElement | null>(null);
  // oficial tem o TRF da 6ª Região à parte (a unificada vai só até o TRF5)
  const ehOficial = lista.some((i) => i.ordem === 9);
  const unificadaEnviada = ORDENS_UNIFICADA.every((o) => lista.find((i) => i.ordem === o)?.pelaUnificada);

  const totalEnviadas = lista.filter((i) => i.enviada).length;
  const completo = totalEnviadas >= total;
  /* O que falta, em português — e sem "envie as 8 certidões": com a Certidão
     Unificada a Federal (TRF1 a TRF5) é um arquivo só. */
  const faltas = faltasDidaticas(lista.filter((i) => !i.enviada).map((i) => i.ordem));
  const textoFaltas = faltas.join("; ");
  // Depois de enviado ao P/1, trava o reenvio/troca para nao bagunçar o que ja foi protocolado.
  const travado = !!enviadoP1;

  /* Envio em dois passos: a API devolve uma URL assinada e o PDF sobe DIRETO
     para o R2, sem passar pela Vercel — que corta requisicao acima de ~4,5 MB
     e fazia certidao digitalizada falhar sem explicacao. Depois de subir, o
     segundo passo grava a certidao no banco. Mesmo caminho dos anexos do
     chat. */
  /* `alvo` é o número do item, ou "unificada": a Certidão Unificada da Justiça
     Federal sobe UMA vez e vale pelos itens 4 a 8 (TRF1 a TRF5). */
  async function enviar(alvo: number | "unificada", file: File) {
    const unificada = alvo === "unificada";
    const ordem = unificada ? 0 : alvo;
    setErro("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Envie um arquivo PDF.");
      return;
    }
    if (file.size > LIMITE_BYTES) {
      setErro(`"${file.name}" tem ${(file.size / 1048576).toFixed(1)} MB. O limite é ${LIMITE_BYTES / 1048576} MB.`);
      return;
    }
    setEnviando(alvo);
    setProgresso(0);

    try {
      // 1) pede a URL assinada
      const r1 = await fetch("/api/promocoes/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unificada ? { unificada: true, tam: file.size } : { ordem, tam: file.size }),
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok) {
        setErro(d1.erro || "Falha ao preparar o envio.");
        return;
      }

      // 2) manda o PDF direto para o R2 (com barra de progresso)
      await new Promise<void>((ok, falha) => {
        const x = new XMLHttpRequest();
        x.open("PUT", d1.url, true);
        x.setRequestHeader("Content-Type", "application/pdf");
        x.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100));
        };
        x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : falha(new Error("HTTP " + x.status)));
        x.onerror = () => falha(new Error("rede"));
        x.send(file);
      });

      // 3) registra no banco
      const r2 = await fetch("/api/promocoes/upload/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          unificada
            ? { unificada: true, key: d1.key, nomeArquivo: file.name, tam: file.size }
            : { ordem, key: d1.key, nomeArquivo: file.name, tam: file.size }
        ),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) {
        setErro(d2.erro || "Falha ao registrar a certidão.");
        return;
      }

      const preenchidas = unificada ? ORDENS_UNIFICADA : [ordem];
      setLista((l) =>
        l.map((i) =>
          preenchidas.includes(i.ordem)
            ? { ...i, enviada: true, nomeArquivo: file.name, pelaUnificada: unificada }
            : i
        )
      );
      setUnificadoKey(null); // mudou uma certidao, invalida o unificado
    } catch {
      setErro("Erro de conexão ao enviar. Confira a internet e tente de novo.");
    } finally {
      setEnviando(null);
      setProgresso(null);
    }
  }

  async function gerarUnificado() {
    setErro("");
    setGerando(true);
    try {
      const res = await fetch("/api/promocoes/unificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      setGerando(false);
      if (!res.ok) {
        setErro(j.erro || "Falha ao gerar.");
        return;
      }
      setUnificadoKey(j.key);
      router.refresh();
    } catch {
      setGerando(false);
      setErro("Erro de conexão ao gerar.");
    }
  }

  async function enviarAoP1() {
    setErro("");
    if (!completo || !unificadoKey) return;
    if (!await confirmar(
      "Confirmar o envio das certidões ao P/1?\n\n" +
      "O P/1 receberá seu PDF unificado para análise. " +
      "Após enviar, as certidões ficam travadas para conferência."
    )) return;
    setEnviandoP1(true);
    try {
      const res = await fetch("/api/promocoes/status-p1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "enviar" }),
      });
      const j = await res.json().catch(() => ({}));
      setEnviandoP1(false);
      if (!res.ok) { setErro(j.error || "Falha ao enviar ao P/1."); return; }
      setEnviadoP1(j.status?.enviadoEm ?? new Date().toISOString());
      router.refresh();
    } catch {
      setEnviandoP1(false);
      setErro("Erro de conexão ao enviar ao P/1.");
    }
  }

  // onde o militar está em cada passo
  const passo1: EstadoPasso = completo ? "feito" : "atual";
  const passo2: EstadoPasso = unificadoKey ? "feito" : completo ? "atual" : "bloqueado";
  const passo3: EstadoPasso = recebidoP1 ? "feito" : enviadoP1 ? "espera"
    : completo && unificadoKey ? "atual" : "bloqueado";
  const trilha: { n: number; rotulo: string; estado: EstadoPasso }[] = [
    { n: 1, rotulo: "Enviar as certidões", estado: passo1 },
    { n: 2, rotulo: "Gerar o PDF", estado: passo2 },
    { n: 3, rotulo: "Enviar ao P/1", estado: passo3 },
  ];

  return (
    <div className="space-y-5">
      {/* A trilha dos três passos, de relance */}
      <div className="ui-card flex flex-wrap items-center gap-2 p-3">
        {trilha.map((t, k) => (
          <Fragment key={t.n}>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${COR_FAIXA[t.estado]}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-[11px]">
                {t.estado === "feito" ? <Check className="h-3 w-3" strokeWidth={3} /> : t.n}
              </span>
              {t.n}º passo · {t.rotulo}
            </span>
            {k < trilha.length - 1 && <ChevronRight className="h-4 w-4 text-[#94A3B8]" />}
          </Fragment>
        ))}
      </div>

      {erro && (
        <p className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}

      {/* ============ 1º PASSO: enviar as certidões ============ */}
      <section className={`overflow-hidden rounded-xl border bg-[#0F1B2D] ${COR_MOLDURA[passo1]}`}>
        <FaixaPasso
          numero={1}
          titulo="Envie as suas certidões"
          dica={ehOficial
            ? "As 3 estaduais, a Certidão Unificada (TRF1 a TRF5) e a do TRF da 6ª Região, em PDF."
            : "As 3 estaduais e a Certidão Unificada (TRF1 a TRF5), em PDF."}
          estado={passo1}
          situacao={completo ? "Concluído" : `${totalEnviadas} de ${total} itens prontos`}
        />
        <div className="space-y-3 p-4">
      {/* Progresso */}
      <div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${completo ? "bg-emerald-500" : "bg-[#D4AF37]"}`}
            style={{ width: `${(totalEnviadas / total) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-right text-[11px] text-[#94A3B8]">
          {totalEnviadas} de {total} itens prontos
          {!completo && " — a Certidão Unificada sozinha completa os 5 da Justiça Federal"}
        </p>
      </div>

      {/* Links oficiais (orientacao) */}
      <div className="overflow-hidden rounded-lg border border-white/10">
        <button
          onClick={() => setLinksAbertos((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/5"
        >
          <Link2 className="h-4 w-4 text-[#D4AF37]" />
          Onde emitir as certidões (sites oficiais)
          <ChevronDown className={`ml-auto h-4 w-4 text-[#94A3B8] transition ${linksAbertos ? "rotate-180" : ""}`} />
        </button>
        {linksAbertos && (
          <div className="border-t border-white/10 px-4 py-3">
            <p className="mb-3 text-xs text-[#94A3B8]">
              As certidões atualizadas de nada consta devem ser emitidas nos sites oficiais
              dos órgãos do Poder Judiciário:
            </p>
            <ul className="space-y-2">
              {LINKS_OFICIAIS.map((l) => (
                <li key={l.titulo + l.url} className={l.destaque
                  ? "flex flex-wrap items-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/10 p-2"
                  : "flex flex-wrap items-center gap-2"}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={l.destaque
                      ? "inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-xs font-bold text-[#1a1205] transition hover:brightness-110"
                      : "inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-2.5 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10"}
                  >
                    {l.destaque ? <Zap className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />} {l.titulo}
                  </a>
                  {l.obs && <span className={l.destaque ? "text-[11px] font-medium text-[#f3df9d]" : "text-[11px] text-[#94A3B8]"}>{l.obs}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {travado && (
        <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-[#94A3B8]">
          <Clock className="h-4 w-4 shrink-0 text-[#D4AF37]" />
          Certidões enviadas ao P/1 — travadas para conferência. Se precisar trocar algum
          arquivo, peça ao P/1 para reabrir.
        </p>
      )}

      {/* Lista das certidoes */}
      <div className="overflow-hidden rounded-lg border border-white/10">
        <ul className="divide-y divide-white/5">
          {lista.map((i) => (
            <Fragment key={i.ordem}>
            {/* Justiça Federal: a Certidão Unificada primeiro, em destaque —
                um pedido só no CJF gera do TRF1 ao TRF5 e vale pelos itens 4 a 8 */}
            {i.ordem === ORDENS_UNIFICADA[0] && (
              <li className="border-y border-[#D4AF37]/40 bg-[#D4AF37]/[.08] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-[#1a1205]">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                      Justiça Federal — o jeito mais rápido
                    </p>
                    <p className="text-sm font-semibold text-white">
                      Certidão Unificada da Justiça Federal (TRF1 a TRF5)
                    </p>
                    <p className="mt-0.5 text-xs text-[#E8EEF6]">
                      É <b>uma certidão só</b>, emitida num pedido só no site do Conselho da Justiça Federal, que vale
                      pelas cinco regiões. Envie o PDF aqui uma vez e ele preenche os itens 4 a 8 abaixo.
                      {ehOficial && " A do TRF da 6ª Região (item 9) é emitida à parte."}
                    </p>
                    {unificadaEnviada && (
                      <p className="mt-1 truncate text-xs text-emerald-400">
                        {lista.find((x) => x.ordem === ORDENS_UNIFICADA[0])?.nomeArquivo} — vale pelos itens 4 a 8
                      </p>
                    )}
                    <a
                      href={LINK_CERTIDAO_UNIFICADA}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-[#1a1205] transition hover:brightness-110"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Emitir a Certidão Unificada
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {unificadaEnviada && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                        <FileCheck2 className="h-3.5 w-3.5" /> Enviada
                      </span>
                    )}
                    <input
                      ref={inputUnificada}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) enviar("unificada", f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => inputUnificada.current?.click()}
                      disabled={enviando === "unificada" || travado}
                      title={travado ? "Enviado ao P/1 — peça reabertura para trocar" : "Vale pelos itens 4 a 8"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/50 px-3 py-1.5 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-40"
                    >
                      {enviando === "unificada" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {enviando === "unificada"
                        ? progresso === null ? "Enviando..." : `${progresso}%`
                        : unificadaEnviada ? "Trocar" : "Enviar a unificada"}
                    </button>
                  </div>
                </div>
              </li>
            )}
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                {i.ordem}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{i.orgao}</p>
                <p className="text-xs text-[#94A3B8]">{i.descricao}</p>
                {i.enviada && i.nomeArquivo && (
                  <p className="mt-0.5 truncate text-xs text-emerald-400">
                    {i.pelaUnificada ? "pela Certidão Unificada" : i.nomeArquivo}
                  </p>
                )}
                <a
                  href={i.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#D4AF37]/90 hover:text-[#D4AF37] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> {i.linkRotulo}
                </a>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {i.enviada ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    <FileCheck2 className="h-3.5 w-3.5" /> Enviada
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-[#94A3B8]">
                    Falta
                  </span>
                )}

                <input
                  ref={(el) => { inputs.current[i.ordem] = el; }}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) enviar(i.ordem, f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => inputs.current[i.ordem]?.click()}
                  disabled={enviando === i.ordem || travado}
                  title={travado ? "Enviado ao P/1 — peça reabertura para trocar" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40"
                >
                  {enviando === i.ordem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {enviando === i.ordem
                    ? progresso === null ? "Enviando..." : `${progresso}%`
                    : i.enviada ? "Trocar" : "Enviar"}
                </button>
              </div>
            </li>
            </Fragment>
          ))}
        </ul>
      </div>
        </div>
      </section>

      {/* ============ 2º PASSO: gerar o PDF unificado ============ */}
      <section className={`overflow-hidden rounded-xl border bg-[#0F1B2D] ${COR_MOLDURA[passo2]}`}>
        <FaixaPasso
          numero={2}
          titulo="Gere o PDF unificado"
          dica="Junta todas as certidões num arquivo só, na ordem oficial."
          estado={passo2}
          situacao={passo2 === "feito" ? "PDF gerado" : passo2 === "atual" ? "Liberado — gere agora" : "Libera ao terminar o 1º passo"}
        />
      <div className="p-5">
        {unificadoKey ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <FileStack className="h-6 w-6 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">PDF unificado gerado</p>
              <p className="text-xs text-[#94A3B8]">Todas as suas certidões reunidas num único arquivo, na ordem oficial.</p>
            </div>
            <a
              href={`/api/promocoes/download?key=${encodeURIComponent(unificadoKey)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <Download className="h-4 w-4" /> Baixar PDF
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <FileStack className="h-6 w-6 text-[#94A3B8]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Gerar PDF unificado</p>
              <p className="text-xs text-[#94A3B8]">
                {completo
                  ? "Tudo pronto. Junte as certidões num único PDF na ordem oficial."
                  : `Falta no 1º passo: ${textoFaltas}.`}
              </p>
            </div>
            <button
              onClick={gerarUnificado}
              disabled={!completo || gerando || travado}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white disabled:opacity-40"
            >
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileStack className="h-4 w-4" />}
              {gerando ? "Gerando..." : "Gerar PDF unificado"}
            </button>
          </div>
        )}
      </div>
      </section>

      {/* ============ 3º PASSO: enviar ao P/1 ============ */}
      <section className={`overflow-hidden rounded-xl border bg-[#0F1B2D] ${COR_MOLDURA[passo3]}`}>
        <FaixaPasso
          numero={3}
          titulo="Envie ao P/1"
          dica="O P/1 recebe o seu PDF, confere e confirma aqui."
          estado={passo3}
          situacao={
            passo3 === "feito" ? "Recebido pelo P/1"
              : passo3 === "espera" ? "Enviado — aguardando o P/1"
              : passo3 === "atual" ? "Pronto para enviar"
              : "Libera depois do PDF"
          }
        />
      <div className="p-5">
        {recebidoP1 ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">
                P/1 confirmou o recebimento
              </p>
              <p className="text-xs text-[#94A3B8]">
                Recebido pelo P/1 em {dataHora(recebidoP1)}. Suas certidões estão protocoladas.
              </p>
            </div>
          </div>
        ) : enviadoP1 ? (
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-6 w-6 shrink-0 text-[#D4AF37]" />
            <div>
              <p className="text-sm font-semibold text-white">Enviado ao P/1 — aguardando recebimento</p>
              <p className="text-xs text-[#94A3B8]">
                Você enviou em {dataHora(enviadoP1)}. Assim que o P/1 confirmar o recebimento,
                aparecerá aqui.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Send className="h-6 w-6 text-[#D4AF37]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Enviar ao P/1</p>
              <p className="text-xs text-[#94A3B8]">
                {completo && unificadoKey
                  ? "Tudo pronto. Envie o PDF unificado ao P/1 para análise."
                  : completo
                  ? "Falta o 2º passo: gere o PDF unificado."
                  : "Termine o 1º passo e gere o PDF no 2º passo."}
              </p>
            </div>
            <button
              onClick={enviarAoP1}
              disabled={!completo || !unificadoKey || enviandoP1}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviandoP1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviandoP1 ? "Enviando..." : "Enviar ao P/1"}
            </button>
          </div>
        )}
      </div>
      </section>

      {/* Oficiais e subtenentes: a declaração individual (fora da
          sequência dos passos — vai junto para o SEI) */}
      {children && (
        <section className="overflow-hidden rounded-xl border border-violet-400/40 bg-[#0F1B2D]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-violet-700 via-violet-600 to-fuchsia-600 px-4 py-3 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/20 ring-2 ring-white/30">
              <FileBadge className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] opacity-80">Oficiais e subtenentes</p>
              <p className="text-base font-bold leading-tight">Declaração individual</p>
              <p className="text-[11px] opacity-80">Gere a sua e o PDF único (declaração + certidões) que vai para o SEI.</p>
            </div>
          </div>
          <div className="p-3">{children}</div>
        </section>
      )}
    </div>
  );
}
