"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePulso } from "@/lib/sincronia";

/* Atualização AO VIVO entre PCs (global).

   Antes: router.refresh() de 20 em 20 segundos em TODA tela, mudasse algo ou
   não. Cada refresh re-renderiza a página NO SERVIDOR — refaz todas as
   consultas da tela no banco; no Dashboard era a ficha completa de todo o
   efetivo. Era o maior gasto do "network transfer" do Neon (5 GB/mês).

   Agora: o pulso do sistema (lib/sincronia, de 3 em 3 s) traz o CARIMBO DE
   MUDANÇA (lib/prisma), que muda sempre que alguém grava algo em qualquer PC.
   Mudou -> a tela recarrega na hora. Não mudou -> nada acontece e o banco não
   manda nada. Aba escondida que perdeu uma mudança recarrega ao voltar.

   O Next preserva o estado dos client components no refresh, então
   formulários em preenchimento NÃO são apagados. */

const INTERVALO_MIN_MS = 3000;   // rajada de gravações: no máximo um refresh a cada 3 s
/* Trava de segurança: se a tela recarregar demais num minuto (gravação em
   série, importação em lote...), passa a recarregar no máximo de 30 em 30 s
   até a poeira baixar. */
const RAJADA = 8;
const INTERVALO_RAJADA_MS = 30_000;

export default function LiveRefresh() {
  const router = useRouter();
  const visto = useRef<string | null>(null);
  const pendente = useRef(false);
  const ultimo = useRef(0);
  const recentes = useRef<number[]>([]);
  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useRef(() => {});
  recarregar.current = () => {
    if (document.hidden) { pendente.current = true; return; }   // ao voltar
    pendente.current = false;
    const agora = Date.now();
    recentes.current = recentes.current.filter((t) => agora - t < 60_000);
    const minimo = recentes.current.length >= RAJADA ? INTERVALO_RAJADA_MS : INTERVALO_MIN_MS;
    const espera = ultimo.current + minimo - agora;
    if (espera > 0) {
      if (!agendado.current) {
        agendado.current = setTimeout(() => { agendado.current = null; recarregar.current(); }, espera);
      }
      return;
    }
    ultimo.current = agora;
    recentes.current.push(agora);
    router.refresh();
  };

  usePulso((p) => {
    if (!p.v) return;
    if (visto.current === null) { visto.current = p.v; return; }   // ponto de partida
    if (p.v === visto.current) return;
    visto.current = p.v;
    recarregar.current();
  });

  useEffect(() => {
    const aoVoltar = () => { if (!document.hidden && pendente.current) recarregar.current(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      if (agendado.current) clearTimeout(agendado.current);
    };
  }, []);

  return null;
}
