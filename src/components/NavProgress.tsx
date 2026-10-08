"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* BARRA DE CARREGAMENTO GLOBAL.
   Toda tela vai ao banco a cada visita e o Next mantém a tela ATUAL na frente
   até a nova ficar pronta. Antes a barra só corria nos itens do menu; links
   dentro das telas (cartões, "ver ficha", abas de ano...) ficavam mudos e o
   usuário achava que o clique não pegou. Aqui qualquer link interno acende a
   barra NO MESMO INSTANTE do clique; ela some quando o endereço muda. */

function Barra() {
  const pathname = usePathname();
  const busca = useSearchParams();
  const [carregando, setCarregando] = useState(false);

  // Chegou: o endereço mudou, então a tela nova está na frente.
  useEffect(() => { setCarregando(false); }, [pathname, busca]);

  useEffect(() => {
    const aoClicar = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      let destino: URL;
      try { destino = new URL(a.href, location.href); } catch { return; }
      if (destino.origin !== location.origin) return;
      if (destino.pathname.startsWith("/api/")) return;
      // mesma tela (ou só a âncora #) não navega
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      setCarregando(true);
    };
    // fase de captura: acende antes de qualquer outro tratamento do clique
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  /* Rede de segurança: se a navegação morrer no caminho (erro, sessão caída),
     ninguém fica com a barra correndo para sempre. */
  useEffect(() => {
    if (!carregando) return;
    const t = setTimeout(() => setCarregando(false), 15000);
    return () => clearTimeout(t);
  }, [carregando]);

  return carregando ? <div className="nav-progresso" role="progressbar" aria-label="Carregando a tela" /> : null;
}

export default function NavProgress() {
  // useSearchParams pede Suspense para não derrubar a renderização estática
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
