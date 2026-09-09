"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, HeartPulse, FileText, ChevronDown } from "lucide-react";

// Acoes rapidas no header. Por enquanto leva as paginas certas
// (criar militar, JMS no dashboard, certidoes). Modais entram depois.
export default function AcoesRapidas({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  if (!isAdmin) return null;

  const acoes = [
    { rotulo: "Novo Militar", Icone: UserPlus, href: "/efetivo/novo" },
    { rotulo: "Promoções / Certidões", Icone: FileText, href: "/promocoes" },
    { rotulo: "Plano de Férias", Icone: HeartPulse, href: "/ferias" },
  ];

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-ouro px-3 py-2 text-sm font-semibold text-ouro-texto transition hover:brightness-110"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden lg:inline">Ações</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-painel py-1 shadow-2xl">
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              onClick={() => {
                setAberto(false);
                router.push(a.href);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-apagado transition hover:bg-white/5 hover:text-white"
            >
              <a.Icone className="h-4 w-4 text-ouro" />
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
