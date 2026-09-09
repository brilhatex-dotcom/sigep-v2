"use client";

import { useEffect, useRef } from "react";

/* =========================================================================
   ATUALIZAÇÃO AO VIVO COM PAUSA POR OCIOSIDADE

   Duas coisas de uma vez, e elas não brigam entre si:

   1. MAIS RÁPIDO enquanto a pessoa está trabalhando. A checagem ficou barata
      (só a assinatura), então dá para perguntar de 5 em 5 segundos em vez de
      15 — a escala do outro PC aparece praticamente na hora.

   2. PARA DE VEZ quando ninguém está mexendo. Aba escondida já parava; o que
      não parava era a aba ABERTA na tela com o P/1 longe do computador —
      almoço, formatura, fim de expediente com o navegador aberto a noite
      inteira. Nessas horas o sistema seguia perguntando ao banco de 15 em 15
      segundos, sem ninguém para ver a resposta.

   Isso importa porque o Neon não cobra por consulta: cobra pelo TEMPO EM QUE O
   BANCO FICA ACORDADO, e ele só dorme depois de alguns minutos sem ninguém
   falar com ele. Perguntar de 15 em 15 segundos garante que ele nunca durma.
   Parando na ociosidade, o banco dorme e a cota do mês para de escorrer.

   Ao primeiro sinal de vida (mouse, tecla, toque, voltar para a aba) volta
   na hora, e já atualiza — sem esperar o próximo ciclo.
   ========================================================================= */

export const OCIOSO_MS = 5 * 60 * 1000;   // 5 min parado = pessoa não está ali
const EVENTOS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"] as const;

/* A decisão, isolada para poder ser testada sem navegador: atualiza só com a
   aba à vista E alguém tendo mexido nos últimos minutos. */
export function deveAtualizar(agora: number, ultimaAtividade: number, abaEscondida: boolean, ociosoMs = OCIOSO_MS): boolean {
  if (abaEscondida) return false;
  return agora - ultimaAtividade <= ociosoMs;
}

export function useAoVivo(
  tarefa: () => void | Promise<void>,
  intervaloMs: number,
  opcoes: { imediato?: boolean; ociosoMs?: number } = {},
) {
  const ref = useRef(tarefa);
  ref.current = tarefa;
  const { imediato = false, ociosoMs = OCIOSO_MS } = opcoes;

  useEffect(() => {
    let ultimaAtividade = Date.now();
    let dormindo = false;

    const rodar = () => { try { ref.current(); } catch { /* a tarefa cuida dos erros dela */ } };

    const marcar = () => {
      const agora = Date.now();
      const acordouAgora = dormindo || agora - ultimaAtividade > ociosoMs;
      ultimaAtividade = agora;
      if (acordouAgora) { dormindo = false; rodar(); }   // voltou: atualiza já
    };

    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true });
    const aoVoltar = () => { if (!document.hidden) marcar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);

    const iv = setInterval(() => {
      if (!deveAtualizar(Date.now(), ultimaAtividade, document.hidden, ociosoMs)) {
        // Só marca como dormindo por ociosidade; aba escondida volta sozinha.
        if (!document.hidden) dormindo = true;
        return;
      }
      rodar();
    }, intervaloMs);

    if (imediato) rodar();

    return () => {
      clearInterval(iv);
      for (const e of EVENTOS) window.removeEventListener(e, marcar);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [intervaloMs, imediato, ociosoMs]);
}
