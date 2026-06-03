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
} from "lucide-react";

type Item = {
  ordem: number;
  orgao: string;
  descricao: string;
  enviada: boolean;
  nomeArquivo: string | null;
};

export default function MinhasCertidoes({
  itens,
  total,
  pdfUnificadoKey,
  efetivoId,
}: {
  itens: Item[];
  total: number;
  pdfUnificadoKey: string | null;
  efetivoId: string;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(itens);
  const [unificadoKey, setUnificadoKey] = useState(pdfUnificadoKey);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  const totalEnviadas = lista.filter((i) => i.enviada).length;
  const completo = totalEnviadas >= total;

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

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-sigep-navy">Progresso</span>
            <span className="text-gray-500">
              {totalEnviadas} de {total} enviadas
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-sigep-dourado transition-all"
              style={{ width: `${(totalEnviadas / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {erro && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}

      {/* Lista das certidoes */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <ul className="divide-y divide-gray-50">
          {lista.map((i) => (
            <li
              key={i.ordem}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sigep-cinza text-sm font-bold text-sigep-navy">
                {i.ordem}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sigep-navy">{i.orgao}</p>
                <p className="text-xs text-gray-500">{i.descricao}</p>
                {i.enviada && i.nomeArquivo && (
                  <p className="mt-0.5 truncate text-xs text-emerald-600">
                    {i.nomeArquivo}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {i.enviada ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    <FileCheck2 className="h-3.5 w-3.5" /> Enviada
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                    Falta
                  </span>
                )}

                <input
                  ref={(el) => {
                    inputs.current[i.ordem] = el;
                  }}
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
                  disabled={enviando === i.ordem}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {enviando === i.ordem ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {i.enviada ? "Trocar" : "Enviar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* PDF unificado */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        {unificadoKey ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <FileStack className="h-6 w-6 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-sigep-navy">
                PDF unificado gerado
              </p>
              <p className="text-xs text-gray-500">
                As 8 certidões reunidas num único arquivo, na ordem oficial.
              </p>
            </div>
            <a
              href={`/api/promocoes/download?key=${encodeURIComponent(unificadoKey)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sigep-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-sigep-azul"
            >
              <Download className="h-4 w-4" /> Baixar PDF
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <FileStack className="h-6 w-6 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-sigep-navy">
                Gerar PDF unificado
              </p>
              <p className="text-xs text-gray-500">
                {completo
                  ? "Tudo pronto. Junte as 8 num único PDF na ordem oficial."
                  : `Envie as ${total} certidões para liberar a geração.`}
              </p>
            </div>
            <button
              onClick={gerarUnificado}
              disabled={!completo || gerando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sigep-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-sigep-azul disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gerando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileStack className="h-4 w-4" />
              )}
              {gerando ? "Gerando..." : "Gerar PDF unificado"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
