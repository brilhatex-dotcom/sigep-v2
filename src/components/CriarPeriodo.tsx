"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

export default function CriarPeriodo() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [dataAlvo, setDataAlvo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Dê um nome ao período (ex.: Promoção 01/08/2026).");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/promocoes/periodo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, dataAlvo }),
      });
      const j = await res.json().catch(() => ({}));
      setSalvando(false);
      if (!res.ok) {
        setErro(j.erro || "Falha ao criar.");
        return;
      }
      router.refresh();
    } catch {
      setSalvando(false);
      setErro("Erro de conexão.");
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-semibold text-sigep-navy">
        Abrir período de promoção
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Nenhum período aberto. Crie um para começar a receber as certidões.
      </p>

      <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Promoção 01/08/2026"
        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sigep-dourado"
      />

      <label className="mb-1 block text-sm font-medium text-gray-700">
        Data alvo (opcional)
      </label>
      <input
        type="date"
        value={dataAlvo}
        onChange={(e) => setDataAlvo(e.target.value)}
        className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sigep-dourado"
      />

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      <button
        onClick={criar}
        disabled={salvando}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sigep-navy py-2.5 font-semibold text-white transition hover:bg-sigep-azul disabled:opacity-60"
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {salvando ? "Criando..." : "Abrir período"}
      </button>
    </div>
  );
}
