"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, Loader2, Pencil, Trash2 } from "lucide-react";

type Dados = {
  id: string; modalidade: string; modelo: string; status: string;
  nomeCompleto: string; postoGrad: string; matricula: string;
  amparoLegal: string; infoAdicional: string; temDocx: boolean;
  parecer: string; criadoEm: string;
};

export default function RequerimentoDetalhe({
  dados,
  ehAdmin,
}: {
  dados: Dados;
  ehAdmin: boolean;
}) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [temDocx, setTemDocx] = useState(dados.temDocx);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  // O admin mexe em qualquer um. O policial, só enquanto está em rascunho —
  // depois de enviado, alterar por fora mudaria o que o P/1 já está vendo.
  const podeMexer = ehAdmin || dados.status === "rascunho";

  async function excluir() {
    if (!confirm(
      `Excluir este requerimento de ${dados.modalidade}?\n\n` +
      "Some da lista e o documento gerado é apagado junto. Não dá para desfazer."
    )) return;
    setErro("");
    setExcluindo(true);
    try {
      const res = await fetch(`/api/requerimentos/${dados.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error || "Falha ao excluir."); return; }
      router.push("/requerimentos");
      router.refresh();
    } catch {
      setErro("Erro de conexão ao excluir.");
    } finally {
      setExcluindo(false);
    }
  }

  async function gerar() {
    setErro(""); setGerando(true);
    try {
      const res = await fetch(`/api/requerimentos/${dados.id}/gerar`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setGerando(false);
      if (!res.ok) { setErro(d.error || "Falha ao gerar."); return; }
      setTemDocx(true);
    } catch {
      setGerando(false);
      setErro("Erro de conexão.");
    }
  }

  function baixar() {
    window.location.href = `/api/requerimentos/${dados.id}/baixar`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">{dados.modalidade}</h1>
        <p className="text-sm text-[#94A3B8]">
          {dados.postoGrad} {dados.nomeCompleto} · mat. {dados.matricula}
        </p>
      </div>

      <section className="ui-card p-6 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Amparo legal</p>
          <p className="mt-0.5 text-sm text-white">{dados.amparoLegal || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Informações adicionais</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-white">{dados.infoAdicional || "—"}</p>
        </div>
      </section>

      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>
      )}

      <section className="ui-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <FileText className="h-4 w-4 text-[#D4AF37]" /> Documento
        </h2>
        <p className="mb-4 text-[12px] text-[#94A3B8]">
          Gere o documento no formato oficial. Baixe o Word para assinar (no sistema ou via gov.br).
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={gerar} disabled={gerando}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {gerando ? "Gerando..." : (temDocx ? "Gerar novamente" : "Gerar documento")}
          </button>
          {temDocx && (
            <button onClick={baixar}
              className="inline-flex items-center gap-2 rounded-lg border border-[#2b3f63] bg-[#16243a] px-4 py-2 text-sm font-semibold text-[#E8EEF6] transition hover:border-[#D4AF37]">
              <Download className="h-4 w-4" /> Baixar Word (.docx)
            </button>
          )}
        </div>
      </section>

      {podeMexer && (
        <section className="ui-card p-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
            Corrigir ou remover
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            Ao editar, o documento já gerado é descartado — gere de novo depois de salvar, para
            sair com o texto novo.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => router.push(`/requerimentos/${dados.id}/editar`)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5">
              <Pencil className="h-4 w-4" /> Editar
            </button>
            <button onClick={excluir} disabled={excluindo}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
