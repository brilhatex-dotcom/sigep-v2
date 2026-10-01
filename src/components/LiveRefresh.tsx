"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Atualização "ao vivo" (global), agora econômica.

   Antes: router.refresh() de 20 em 20 segundos em TODA tela, para mudanças
   feitas em outro PC aparecerem sozinhas. Só que cada refresh re-renderiza a
   página NO SERVIDOR — ou seja, refaz TODAS as consultas da tela no banco. No
   Dashboard isso era a ficha completa de todos os militares: perto de 1 MB por
   refresh, 180 refreshes por hora de uso. Era o maior gasto do "network
   transfer" do Neon (cota de 5 GB/mês).

   Agora a tela atualiza:
     · quando a pessoa VOLTA para ela (trocou de aba/janela, desbloqueou o
       celular) depois de pelo menos 3 minutos fora;
     · e, com alguém mexendo nela, no máximo de 10 em 10 minutos.
   O que a própria pessoa faz aparece na hora (as ações já atualizam a página);
   o que outro PC mudou aparece ao voltar, ao navegar ou nesse ciclo. Telas que
   precisam de tempo real de verdade (a escala) têm o próprio pulso, leve.

   O Next preserva o estado dos client components no refresh, então
   formulários em preenchimento NÃO são apagados. */

const FORA_MIN_MS = 3 * 60 * 1000;   // ficou pelo menos isto fora da tela
const CICLO_MS = 10 * 60 * 1000;     // com alguém na frente, no máximo isto
const OCIOSO_MS = 15 * 60 * 1000;    // parado há mais que isto = ninguém na frente
const EVENTOS = ["mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

export default function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let ultimaAtividade = Date.now();
    let ultimoRefresh = Date.now();
    // aberta já em segundo plano (ex.: nova aba): conta como "fora" desde agora
    let saiuEm: number | null = document.hidden ? Date.now() : null;

    const refrescar = () => { ultimoRefresh = Date.now(); router.refresh(); };
    const marcar = () => { ultimaAtividade = Date.now(); };

    const aoMudar = () => {
      if (document.hidden) {
        if (saiuEm === null) saiuEm = Date.now();
        return;
      }
      const saiu = saiuEm;
      saiuEm = null;
      marcar();
      if (saiu !== null && Date.now() - saiu >= FORA_MIN_MS) refrescar();
    };

    const iv = setInterval(() => {
      if (document.hidden) return;
      const agora = Date.now();
      if (agora - ultimaAtividade > OCIOSO_MS) return;   // ninguém na frente
      if (agora - ultimoRefresh >= CICLO_MS) refrescar();
    }, 60 * 1000);

    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true });
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      clearInterval(iv);
      for (const e of EVENTOS) window.removeEventListener(e, marcar);
      document.removeEventListener("visibilitychange", aoMudar);
    };
  }, [router]);

  return null;
}
