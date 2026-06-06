"use client";

import { useState } from "react";
import { AlertTriangle, X, HeartPulse, Plane } from "lucide-react";

export type Alerta = {
  chave: string;
  tipo: "jms_vencendo" | "ferias_vencidas";
  nivel: "critico" | "atencao";
  texto: string;
};

// Banner de alertas no topo. Cada alerta pode ser dispensado (X),
// o que grava no banco e nao volta mais.
export default function BannerAlertas({ alertas }: { alertas: Alerta[] }) {
  const [lista, setLista] = useState(alertas);

  async function dispensar(a: Alerta) {
    setLista((l) => l.filter((x) => x.chave !== a.chave));
    try {
      await fetch("/api/alertas/dispensar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: a.chave, tipo: a.tipo }),
      });
    } catch {
      /* se falhar, ao recarregar o alerta reaparece - aceitavel */
    }
  }

  if (lista.length === 0) return null;

  return (
    <div className="mb-5 space-y-2 print:hidden">
      {lista.map((a) => {
        const critico = a.nivel === "critico";
        const Icone = a.tipo === "jms_vencendo" ? HeartPulse : Plane;
        return (
          <div
            key={a.chave}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              critico
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            <span className="text-base">{critico ? "🚨" : "⚠️"}</span>
            <Icone className="h-4 w-4 shrink-0 opacity-80" />
            <span className="flex-1">{a.texto}</span>
            <button
              onClick={() => dispensar(a)}
              className="rounded p-1 transition hover:bg-white/10"
              aria-label="Dispensar alerta"
              title="Dispensar (não mostrar de novo)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
