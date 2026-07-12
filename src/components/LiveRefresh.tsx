"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/* Atualizacao ao vivo (global).
   Chama router.refresh() periodicamente e ao focar/reexibir a aba, para que
   mudancas feitas em outro PC aparecam sem precisar dar F5. Vale para todas as
   telas renderizadas no servidor (avisos, efetivo, dashboard, ferias...).
   O Next preserva o estado dos client components, entao formularios em
   preenchimento NAO sao apagados. */
export default function LiveRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  const ultimo = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      const agora = Date.now();
      if (agora - ultimo.current < 4000) return; // evita rajadas (foco + timer juntos)
      ultimo.current = agora;
      router.refresh();
    };
    const iv = setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    const onVis = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalMs]);
  return null;
}
