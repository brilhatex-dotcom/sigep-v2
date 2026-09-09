"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAoVivo } from "@/lib/useAoVivo";

/* Atualizacao ao vivo (global).
   Chama router.refresh() periodicamente e ao voltar para a aba, para que
   mudancas feitas em outro PC aparecam sem precisar dar F5. Vale para todas as
   telas renderizadas no servidor (avisos, efetivo, dashboard, ferias...).
   O Next preserva o estado dos client components, entao formularios em
   preenchimento NAO sao apagados.

   Cada refresh destes re-renderiza a pagina NO SERVIDOR, ou seja, vai ao banco.
   Por isso o useAoVivo: passados alguns minutos sem ninguem mexer, para de
   verdade — uma aba esquecida aberta a noite toda nao segura mais o banco
   acordado (que e o que o Neon cobra). Ao primeiro toque, volta na hora. */
export default function LiveRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  const ultimo = useRef(0);

  const refresh = useCallback(() => {
    const agora = Date.now();
    if (agora - ultimo.current < 4000) return; // evita rajadas (foco + timer juntos)
    ultimo.current = agora;
    router.refresh();
  }, [router]);

  useAoVivo(refresh, intervalMs);
  return null;
}
