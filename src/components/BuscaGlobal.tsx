"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// Busca global: ao enviar, leva para a lista de efetivo ja filtrada.
// (A pagina /efetivo aceita ?q= para filtrar.)
export default function BuscaGlobal() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function buscar() {
    const termo = q.trim();
    if (termo) router.push(`/efetivo?q=${encodeURIComponent(termo)}`);
  }

  return (
    <div className="relative hidden flex-1 md:block md:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && buscar()}
        placeholder="Buscar militar, matrícula..."
        className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#D4AF37]/50"
      />
    </div>
  );
}
