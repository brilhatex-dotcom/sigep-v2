"use client";

import { useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

export type Alerta = {
  chave: string;
  tipo: "jms_vencendo" | "ferias_vencidas";
  nivel: "critico" | "atencao" | "info";
  texto: string;
};

/* Banner de alertas no topo do painel. Cada alerta pode ser dispensado (X),
   o que grava no banco e nao volta mais.

   A faixa é de COR CHEIA de propósito: a versão anterior usava o fundo a 10%
   de opacidade e sumia no fundo escuro do sistema — o P/1 passava o olho e
   não via. Aqui cada nível tem a sua cor inteira, com o nome do nível escrito
   na frente, e o crítico ainda pisca devagar. */
const NIVEIS = {
  critico: { rotulo: "Crítico", classe: "bg-red-500 text-white", Icone: AlertTriangle, pisca: true },
  atencao: { rotulo: "Atenção", classe: "bg-amber-500 text-[#1a1205]", Icone: AlertTriangle, pisca: false },
  info: { rotulo: "Informativo", classe: "bg-sky-500 text-[#03202b]", Icone: Info, pisca: false },
} as const;

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
        const n = NIVEIS[a.nivel] ?? NIVEIS.atencao;
        const Icone = n.Icone;
        return (
          <div
            key={a.chave}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold shadow-lg shadow-black/30 ${n.classe}`}
          >
            <Icone className={`h-[18px] w-[18px] shrink-0 ${n.pisca ? "animate-pulse" : ""}`} strokeWidth={2.2} />
            <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider opacity-80">{n.rotulo}</span>
            <span className="flex-1">{a.texto}</span>
            <button
              onClick={() => dispensar(a)}
              className="shrink-0 rounded p-1 opacity-75 transition hover:bg-black/10 hover:opacity-100"
              aria-label="Dispensar alerta"
              title="Dispensar (não mostrar de novo)"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
