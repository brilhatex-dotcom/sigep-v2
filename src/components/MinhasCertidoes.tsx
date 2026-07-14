"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";
import { LINKS_OFICIAIS } from "@/lib/certidoes";

type Item = {
  ordem: number;
  orgao: string;
  descricao: string;
  link: string;
  linkRotulo: string;
  enviada: boolean;
  nomeArquivo: string | null;
};

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
}: {
  itens: Item[];
  total: number;
  pdfUnificadoKey: string | null;
  efetivoId: string;
  enviadoP1Em: string | null;
  recebidoP1Em: string | null;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(itens);
  const [unificadoKey, setUnificadoKey] = useState(pdfUnificadoKey);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [linksAbertos, setLinksAbertos] = useState(false);
  const [enviadoP1, setEnviadoP1] = useState<string | null>(enviadoP1Em);
  const [recebidoP1, setRecebidoP1] = useState<string | null>(recebidoP1Em);
  const [enviandoP1, setEnviandoP1] = useState(false);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  const totalEnviadas = lista.filter((i) => i.enviada).length;
  const completo = totalEnviadas >= total;
  // Depois de enviado ao P/1, trava o reenvio/troca para nao bagunçar o que ja foi protocolado.
  const travado = !!enviadoP1;

  async function enviar(ordem: number, file: File) {
    setErro("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Envie um arquivo PDF.");
      return;
    }
    setEnviando(ordem);
    const fd = new FormData();
    fd.append("ordem", String(ordem));
    fd.append("arquivo", file);

    try {
      const res = await fetch("/api/promocoes/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      setEnviando(null);
      if (!res.ok) {
        setErro(j.erro || "Falha no envio.");
        return;
      }
      setLista((l) =>
        l.map((i) =>
          i.ordem === ordem ? { ...i, enviada: true, nomeArquivo: file.name } : i
        )
      );
      setUnificadoKey(null); // mudou uma certidao, invalida o unificado
    } catch {
      setEnviando(null);
      setErro("Erro de conexão ao enviar.");
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
    if (!confirm(
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

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="ui-card p-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-white">Progresso</span>
          <span className="text-[#94A3B8]">{totalEnviadas} de {total} enviadas</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#D4AF37] transition-all"
            style={{ width: `${(totalEnviadas / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Links oficiais (orientacao) */}
      <div className="ui-card overflow-hidden">
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
                <li key={l.titulo + l.url} className="flex flex-wrap items-center gap-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-2.5 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {l.titulo}
                  </a>
                  {l.obs && <span className="text-[11px] text-[#94A3B8]">{l.obs}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {erro && (
        <p className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}

      {travado && (
        <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-[#94A3B8]">
          <Clock className="h-4 w-4 shrink-0 text-[#D4AF37]" />
          Certidões enviadas ao P/1 — travadas para conferência. Se precisar trocar algum
          arquivo, peça ao P/1 para reabrir.
        </p>
      )}

      {/* Lista das certidoes */}
      <div className="ui-card overflow-hidden">
        <ul className="divide-y divide-white/5">
          {lista.map((i) => (
            <li key={i.ordem} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                {i.ordem}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{i.orgao}</p>
                <p className="text-xs text-[#94A3B8]">{i.descricao}</p>
                {i.enviada && i.nomeArquivo && (
                  <p className="mt-0.5 truncate text-xs text-emerald-400">{i.nomeArquivo}</p>
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
                  {i.enviada ? "Trocar" : "Enviar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* PDF unificado */}
      <div className="ui-card p-5">
        {unificadoKey ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <FileStack className="h-6 w-6 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">PDF unificado gerado</p>
              <p className="text-xs text-[#94A3B8]">As {total} certidões reunidas num único arquivo, na ordem oficial.</p>
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
                  : `Envie as ${total} certidões para liberar a geração.`}
              </p>
            </div>
            <button
              onClick={gerarUnificado}
              disabled={!completo || gerando || travado}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileStack className="h-4 w-4" />}
              {gerando ? "Gerando..." : "Gerar PDF unificado"}
            </button>
          </div>
        )}
      </div>

      {/* Enviar ao P/1 + status de recebimento */}
      <div className="ui-card p-5">
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
                  ? "Gere o PDF unificado antes de enviar ao P/1."
                  : `Envie as ${total} certidões e gere o PDF unificado para liberar o envio.`}
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
    </div>
  );
}
