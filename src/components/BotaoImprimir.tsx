"use client";

import { Printer } from "lucide-react";

export default function BotaoImprimir({ rotulo = "Imprimir / PDF" }: { rotulo?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-ouro px-3 py-1.5 text-sm font-medium text-ouro-texto transition hover:brightness-110 print:hidden"
    >
      <Printer className="h-4 w-4" /> {rotulo}
    </button>
  );
}
