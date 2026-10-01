"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Eye, Pencil, FileText, FileStack, Download, Paperclip, AlertTriangle } from "lucide-react";
import EditarCertidaoP1 from "@/components/EditarCertidaoP1";
import type { CamposCertidao, LinhaCertidaoP1 } from "@/lib/certidaoP1Db";
import {
  salvarArquivo, baixarBytes, montarUnificado, urlDocumento, abaReservada, pdfBlob,
} from "@/lib/certidaoP1Cliente";

/* =========================================================================
   MINHA CERTIDÃO/DECLARAÇÃO DO P/1 — para oficiais e subtenentes

   O próprio militar gera a certidão de "nada consta" (Portaria nº
   040/2026-GCG), confere (Ver), ajusta o que estiver errado (Editar) e baixa o
   PDF ÚNICO: a certidão + as certidões das regiões que ele mandou aqui, já com
   o nome dele — o arquivo que vai para o SEI. O número sai da mesma sequência
   do painel do P/1.
   ========================================================================= */

type Resposta = { pode: boolean; periodo: { id: string; nome: string } | null; linha: LinhaCertidaoP1 | null };

export default function MinhaCertidaoP1() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [editando, setEditando] = useState(false);
  const [anexos, setAnexos] = useState<File[]>([]);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/promocoes/minha-certidao");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao carregar."); return; }
      setDados(d as Resposta);
    } catch {
      setErro("Erro de conexão.");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(corpo: Record<string, unknown>): Promise<{ erro: string | null; linha: LinhaCertidaoP1 | null }> {
    try {
      const r = await fetch("/api/promocoes/minha-certidao", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { erro: d.error || "Falha ao salvar.", linha: null };
      setDados(d as Resposta);
      return { erro: null, linha: (d as Resposta).linha };
    } catch {
      return { erro: "Erro de conexão.", linha: null };
    }
  }

  // gera (numera) se ainda não tinha
  async function garantir(): Promise<LinhaCertidaoP1 | null> {
    if (dados?.linha?.numero) return dados.linha;
    const { erro: e, linha } = await acao({ acao: "emitir" });
    if (e) { setErro(e); return null; }
    return linha;
  }

  async function visualizar() {
    setErro("");
    const aba = abaReservada();
    const l = await garantir();
    if (!l) { aba.fechar(); return; }
    aba.ir(urlDocumento(l.efetivoId, "pdf", true));
  }

  async function abrirEdicao() {
    setErro("");
    const l = await garantir();
    if (l?.campos) setEditando(true);
  }

  async function word() {
    setErro("");
    setOcupado("Gerando a certidão…");
    try {
      const l = await garantir();
      if (!l) return;
      const dadosDoc = await baixarBytes(urlDocumento(l.efetivoId, "docx"));
      salvarArquivo(
        new Blob([dadosDoc], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        `Certidao P1 - ${l.arquivo}.docx`,
      );
    } catch (e) {
      setErro((e as Error).message || "Falha ao gerar.");
    } finally {
      setOcupado("");
    }
  }

  async function pdfUnico(modo: "ver" | "baixar") {
    setErro("");
    const aba = modo === "ver" ? abaReservada() : null;
    setOcupado("Juntando a certidão com as suas certidões…");
    try {
      const l = await garantir();
      if (!l) { aba?.fechar(); return; }
      const blob = pdfBlob(await montarUnificado(l.efetivoId, l.arquivo, anexos));
      if (aba) aba.ir(URL.createObjectURL(blob));
      else salvarArquivo(blob, `${l.arquivo}.pdf`);
    } catch (e) {
      aba?.fechar();
      setErro((e as Error).message || "Falha ao gerar o PDF único.");
    } finally {
      setOcupado("");
    }
  }

  if (!dados?.pode) {
    return erro ? <p className="text-sm text-red-300">{erro}</p> : null;
  }
  const l = dados.linha;
  const faltam = l ? l.exigidas.filter((c) => !l.enviadas.includes(c.ordem)) : [];

  return (
    <div className="p-2">
      {/* o título vem na faixa da página ("Oficiais e subtenentes") */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#94A3B8]">
            A certidão de “nada consta” da Portaria nº 040/2026-GCG. Gere a sua, confira, ajuste o que estiver
            errado e baixe o <b className="text-white">PDF único</b> (certidão + as suas certidões das regiões),
            já com o seu nome — é o arquivo que vai para o SEI.
          </p>
          {l?.numero ? (
            <p className="mt-2 text-sm text-white">
              Certidão nº <b>{l.numero}</b>
              {l.data && <span className="text-[#94A3B8]"> · {l.data.split("-").reverse().join("/")}</span>}
              {l.ajustado && (
                <span className="ml-2 rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[11px] text-[#D4AF37]">editada</span>
              )}
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#94A3B8]">Ainda não gerada — o número sai na primeira vez que você ver, editar ou baixar.</p>
          )}
          {l && faltam.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {faltam.length > 1 ? `Faltam ${faltam.length} das suas certidões` : "Falta 1 das suas certidões"} aqui. O PDF único sai só com o que já foi enviado (e os anexos abaixo).
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={visualizar} disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
          <Eye className="h-4 w-4" /> Visualizar
        </button>
        <button onClick={abrirEdicao} disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
          <Pencil className="h-4 w-4" /> Editar
        </button>
        <button onClick={word} disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
          <FileText className="h-4 w-4" /> Word
        </button>
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:inline-block" />
        <button onClick={() => pdfUnico("ver")} disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-sm text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-40">
          <FileStack className="h-4 w-4" /> Ver PDF único
        </button>
        <button onClick={() => pdfUnico("baixar")} disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
          <Download className="h-4 w-4" /> Baixar PDF único
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
          title="PDFs a mais que entram no fim do PDF único">
          <Paperclip className="h-3.5 w-3.5" /> {anexos.length ? `${anexos.length} anexo(s)` : "Anexar PDF"}
          <input type="file" accept="application/pdf" multiple className="hidden"
            onChange={(e) => { setAnexos(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
      </div>

      {ocupado && <p className="mt-3 flex items-center gap-2 text-sm text-[#D4AF37]"><Loader2 className="h-4 w-4 animate-spin" /> {ocupado}</p>}
      {erro && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}

      {editando && l?.campos && (
        <EditarCertidaoP1
          titulo="minha certidão"
          campos={l.campos}
          ano={Number((l.numero || "").split("/")[1]) || new Date().getFullYear()}
          podeNumero={false}
          ajustado={l.ajustado}
          onSalvar={async (campos: CamposCertidao, depois) => {
            const aba = depois === "visualizar" ? abaReservada() : null;
            const { erro: e } = await acao({ acao: "editar", campos });
            if (e) { aba?.fechar(); return e; }
            aba?.ir(urlDocumento(l.efetivoId, "pdf", true));
            return null;
          }}
          onRestaurar={async () => { await acao({ acao: "restaurar" }); }}
          onFechar={() => setEditando(false)}
        />
      )}
    </div>
  );
}
