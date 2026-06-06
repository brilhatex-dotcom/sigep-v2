"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

// Slide-over lateral (drawer) reutilizavel. Sem bibliotecas.
// Fecha no ESC e no clique do fundo. some na impressao.
export default function SlideOver({
  aberto,
  titulo,
  onFechar,
  children,
  largura = "max-w-md",
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    if (aberto) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [aberto, onFechar]);

  return (
    <div
      className={`fixed inset-0 z-50 print:hidden ${
        aberto ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!aberto}
    >
      {/* fundo */}
      <div
        onClick={onFechar}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          aberto ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* painel */}
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute right-0 top-0 flex h-full w-full ${largura} flex-col border-l border-white/10 bg-[#0F1B2D] shadow-2xl transition-transform duration-300 ${
          aberto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-bold text-white">{titulo}</h2>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
