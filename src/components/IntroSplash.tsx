"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* =========================================================================
   Abertura da tela de login — vídeo institucional do 18º BPM.

   Regra de exibição: roda UMA VEZ POR DIA em cada aparelho. Nos demais
   acessos do mesmo dia a tela de login abre direto, sem espera — quem usa
   o sistema o dia inteiro não perde tempo.

   Som: começa mudo, porque nenhum navegador deixa áudio tocar sozinho.
   Se houver faixa de áudio, aparece um botão para ligar.

   Acessibilidade: quem tem "reduzir movimento" ligado no aparelho não vê
   o vídeo. O botão "Pular" está sempre visível, e Esc/Espaço também pulam.
   ========================================================================= */

const CHAVE = "sigep_intro_vista"; // guarda a data (AAAA-MM-DD) do último dia
const LIMITE_MS = 11000;           // trava de segurança se o vídeo travar

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function IntroSplash() {
  // Começa escondido: só liga depois de conferir o localStorage no cliente,
  // senão a abertura pisca na tela de quem já viu hoje.
  const [mostrar, setMostrar] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [mudo, setMudo] = useState(true);
  const [temAudio, setTemAudio] = useState(false);
  const [pct, setPct] = useState(0);

  const video = useRef<HTMLVideoElement | null>(null);
  const encerrado = useRef(false);
  const timer = useRef<any>(null);

  const encerrar = useCallback(() => {
    if (encerrado.current) return;
    encerrado.current = true;
    clearTimeout(timer.current);
    try { localStorage.setItem(CHAVE, hojeISO()); } catch {}
    try { video.current?.pause(); } catch {}
    setSaindo(true);
    // tira do DOM depois do fade, para não segurar memória nem o vídeo
    setTimeout(() => setMostrar(false), 900);
  }, []);

  useEffect(() => {
    let jaViu = false;
    try { jaViu = localStorage.getItem(CHAVE) === hojeISO(); } catch {}
    const reduz = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (jaViu || reduz) {
      // marca mesmo assim, para não tentar de novo nas próximas telas do dia
      try { localStorage.setItem(CHAVE, hojeISO()); } catch {}
      return;
    }
    setMostrar(true);
    // trava de segurança: se o vídeo não carregar ou travar, libera o login
    timer.current = setTimeout(encerrar, LIMITE_MS);
    return () => clearTimeout(timer.current);
  }, [encerrar]);

  useEffect(() => {
    if (!mostrar) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") { e.preventDefault(); encerrar(); }
    };
    document.addEventListener("keydown", aoTeclar);
    // trava a rolagem enquanto a abertura roda
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [mostrar, encerrar]);

  if (!mostrar) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black transition-opacity duration-[850ms] ${saindo ? "pointer-events-none opacity-0" : "opacity-100"}`}
      role="presentation"
    >
      <video
        ref={video}
        className="h-full w-full object-cover"
        src="/login/intro.mp4"
        poster="/login/intro-poster.jpg"
        autoPlay
        muted={mudo}
        playsInline
        preload="auto"
        onEnded={encerrar}
        onError={encerrar}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget as any;
          const audio =
            v.mozHasAudio ||
            Boolean(v.webkitAudioDecodedByteCount) ||
            Boolean(v.audioTracks?.length);
          setTemAudio(!!audio);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setPct(Math.min(100, (v.currentTime / v.duration) * 100));
        }}
      />

      {/* escurece as bordas para o vídeo casar com a tela de login */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_86%_86%_at_50%_50%,transparent_45%,rgba(0,0,0,.75))]" />

      {temAudio && mudo && (
        <button
          type="button"
          onClick={() => {
            setMudo(false);
            const v = video.current;
            if (v) { v.muted = false; v.volume = 0.8; v.play().catch(() => {}); }
          }}
          className="absolute left-4 top-4 rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur transition hover:border-[#D4AF37] hover:text-white"
        >
          🔊 Ativar som
        </button>
      )}

      <button
        type="button"
        onClick={encerrar}
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/25 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur transition hover:border-[#D4AF37] hover:text-white"
      >
        <span className="relative block h-4 w-4">
          <svg viewBox="0 0 24 24" className="h-4 w-4 -rotate-90">
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2.5" />
            <circle
              cx="12" cy="12" r="10" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={2 * Math.PI * 10 * (1 - pct / 100)}
            />
          </svg>
        </span>
        Pular introdução
      </button>
    </div>
  );
}
