"use client";

import { useState } from "react";

const OPCOES = ["Hoje", "Esta Semana", "Este Mês", "Próximo Mês", "Este Ano"] as const;
export type PeriodoFiltro = (typeof OPCOES)[number];

// Filtro temporal visual. Avisa o pai via onChange.
export default function FiltroTemporal({
  valor,
  onChange,
}: {
  valor: PeriodoFiltro;
  onChange: (v: PeriodoFiltro) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#0F1B2D] p-1 print:hidden">
      {OPCOES.map((op) => (
        <button
          key={op}
          onClick={() => onChange(op)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            valor === op
              ? "bg-[#D4AF37] text-[#1a1205]"
              : "text-[#94A3B8] hover:bg-white/5 hover:text-white"
          }`}
        >
          {op}
        </button>
      ))}
    </div>
  );
}
