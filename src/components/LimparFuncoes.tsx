"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Loader2 } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";

/* Apaga o campo FUNÇÃO da ficha de todo o efetivo (fica em branco).
   Só aparece enquanto houver ficha com função preenchida. O servidor guarda
   uma cópia do que estava escrito antes de apagar. */
export default function LimparFuncoes({ total }: { total: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  if (total <= 0) return null;

  async function apagar() {
    const ok = await confirmar(
      `Apagar a FUNÇÃO da ficha de ${total} militar(es)? O campo fica em branco em todas as fichas. ` +
      "Uma cópia do que está escrito hoje fica guardada no sistema.",
      { rotuloOk: "Apagar de todos", perigo: true },
    );
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/admin/limpar-funcoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: "APAGAR" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d?.error || "Não foi possível apagar.", "erro"); return; }
      avisar(`Função apagada de ${d.comFuncao ?? total} ficha(s). Agora está em branco em todas.`, "sucesso");
      router.refresh();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setOcupado(false); }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0F1B2D] px-4 py-3">
      <span className="text-sm text-[#cbd5e1]">
        <b className="text-white">{total}</b> ficha(s) ainda com a <b className="text-white">Função</b> preenchida.
      </span>
      <button onClick={apagar} disabled={ocupado}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />} Apagar a Função de todos
      </button>
    </div>
  );
}
