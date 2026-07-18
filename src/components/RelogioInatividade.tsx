"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, getSession } from "next-auth/react";
import { Clock, LockKeyhole, ShieldAlert } from "lucide-react";
import { MINUTOS_INATIVIDADE } from "@/lib/sessao";

/* Relógio de INATIVIDADE visível. Conta o tempo parado; qualquer atividade
   (mouse, teclado, toque, rolagem) zera a contagem. No último minuto aparece
   um AVISO ("sua sessão vai expirar — continuar conectado?"). Ao chegar a
   zero, desconecta sozinho (protege o PC compartilhado deixado aberto). O
   valor é o mesmo da sessão no servidor (lib/sessao.ts). */

const TOTAL = MINUTOS_INATIVIDADE * 60; // segundos
const AVISO_EM = 60;                    // mostra o aviso no último minuto

export default function RelogioInatividade() {
  const [resta, setResta] = useState(TOTAL);
  const fim = useRef<number>(Date.now() + TOTAL * 1000);
  const saiu = useRef(false);
  const ultimaAtividade = useRef(0);
  const ultimoKeepAlive = useRef(Date.now());
  // Enquanto o aviso está aberto, a atividade NÃO reinicia sozinha (evita que o
  // mouse passando por cima cancele o aviso sem a pessoa decidir).
  const [avisando, setAvisando] = useState(false);
  const avisandoRef = useRef(false);
  avisandoRef.current = avisando;

  const renovar = useCallback((pingar = true) => {
    fim.current = Date.now() + TOTAL * 1000;
    setAvisando(false);
    if (pingar) {
      const now = Date.now();
      if (now - ultimoKeepAlive.current > 60 * 1000) {
        ultimoKeepAlive.current = now;
        getSession().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const onAtividade = () => {
      if (avisandoRef.current) return; // durante o aviso, só o botão renova
      const now = Date.now();
      if (now - ultimaAtividade.current < 1000) return; // throttle
      ultimaAtividade.current = now;
      renovar();
    };

    const eventos: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach((e) => window.addEventListener(e, onAtividade, { passive: true }));

    const id = setInterval(() => {
      const s = Math.max(0, Math.round((fim.current - Date.now()) / 1000));
      setResta(s);
      if (s <= AVISO_EM && s > 0 && !avisandoRef.current) setAvisando(true);
      if (s <= 0 && !saiu.current) {
        saiu.current = true;
        signOut({ callbackUrl: "/login" });
      }
    }, 1000);

    return () => {
      clearInterval(id);
      eventos.forEach((e) => window.removeEventListener(e, onAtividade));
    };
  }, [renovar]);

  const mm = String(Math.floor(resta / 60)).padStart(2, "0");
  const ss = String(resta % 60).padStart(2, "0");
  const alerta = resta <= 120;   // últimos 2 min
  const critico = resta <= AVISO_EM;

  const cor = critico
    ? "border-red-500/60 bg-red-500/15 text-red-200"
    : alerta
    ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
    : "border-white/10 bg-white/5 text-[#94A3B8]";

  return (
    <>
      <div
        title={`Você será desconectado por inatividade em ${mm}:${ss}. Mexa o mouse ou toque na tela para continuar conectado.`}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums transition-colors ${cor} ${critico ? "animate-pulse" : ""}`}
      >
        {critico ? <LockKeyhole className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        <span className="font-semibold">{mm}:{ss}</span>
        <span className="hidden text-[11px] opacity-80 md:inline">sessão</span>
      </div>

      {avisando && resta > 0 && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-[#0F1B2D] p-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Sua sessão vai expirar</h3>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Por segurança, você será desconectado por inatividade em{" "}
              <b className="tabular-nums text-amber-300">{mm}:{ss}</b>.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => renovar(true)}
                className="flex-1 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-semibold text-[#1a1205] hover:bg-[#D4AF37]/90"
              >
                Continuar conectado
              </button>
              <button
                onClick={() => { saiu.current = true; signOut({ callbackUrl: "/login" }); }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[#cdd9ea] hover:bg-white/5"
              >
                Sair agora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
