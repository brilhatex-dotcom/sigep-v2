"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, getSession } from "next-auth/react";
import { Clock, LockKeyhole } from "lucide-react";
import { MINUTOS_INATIVIDADE } from "@/lib/sessao";

/* Relógio de INATIVIDADE visível. Conta o tempo parado; qualquer atividade
   (mouse, teclado, toque, rolagem) zera a contagem. Ao chegar a zero,
   desconecta sozinho (protege o PC compartilhado deixado aberto). O valor é o
   mesmo da sessão no servidor (lib/sessao.ts). Para o servidor não expirar
   antes do relógio, a atividade também renova o token (getSession, com folga). */

const TOTAL = MINUTOS_INATIVIDADE * 60; // segundos

export default function RelogioInatividade() {
  const [resta, setResta] = useState(TOTAL);
  const fim = useRef<number>(Date.now() + TOTAL * 1000);
  const saiu = useRef(false);
  const ultimaAtividade = useRef(0);
  const ultimoKeepAlive = useRef(Date.now());

  useEffect(() => {
    const resetar = () => { fim.current = Date.now() + TOTAL * 1000; };

    const onAtividade = () => {
      const now = Date.now();
      if (now - ultimaAtividade.current < 1000) return; // throttle de eventos
      ultimaAtividade.current = now;
      resetar();
      // Renova o token no servidor de vez em quando (evita expirar antes do
      // relógio quando a pessoa mexe muito mas navega pouco).
      if (now - ultimoKeepAlive.current > 3 * 60 * 1000) {
        ultimoKeepAlive.current = now;
        getSession().catch(() => {});
      }
    };

    const eventos: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach((e) => window.addEventListener(e, onAtividade, { passive: true }));

    const id = setInterval(() => {
      const s = Math.max(0, Math.round((fim.current - Date.now()) / 1000));
      setResta(s);
      if (s <= 0 && !saiu.current) {
        saiu.current = true;
        signOut({ callbackUrl: "/login" });
      }
    }, 1000);

    return () => {
      clearInterval(id);
      eventos.forEach((e) => window.removeEventListener(e, onAtividade));
    };
  }, []);

  const mm = String(Math.floor(resta / 60)).padStart(2, "0");
  const ss = String(resta % 60).padStart(2, "0");
  const alerta = resta <= 120;   // últimos 2 min
  const critico = resta <= 60;   // último minuto

  const cor = critico
    ? "border-red-500/60 bg-red-500/15 text-red-200"
    : alerta
    ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
    : "border-white/10 bg-white/5 text-[#94A3B8]";

  return (
    <div
      title={`Você será desconectado por inatividade em ${mm}:${ss}. Mexa o mouse ou toque na tela para continuar conectado.`}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums transition-colors ${cor} ${critico ? "animate-pulse" : ""}`}
    >
      {critico ? <LockKeyhole className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      <span className="font-semibold">{mm}:{ss}</span>
      <span className="hidden text-[11px] opacity-80 md:inline">{critico ? "saindo…" : "sessão"}</span>
    </div>
  );
}
