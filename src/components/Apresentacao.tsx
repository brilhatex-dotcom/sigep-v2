"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, Pause, Play, Shield, Volume2, VolumeX, X, type LucideIcon,
} from "lucide-react";

/* =========================================================================
   APRESENTAÇÃO EM SLIDES — o "motor" da Boas-vindas e do passo a passo das
   certidões.

   Funciona como um vídeo curto: barra de progresso em cima (como os
   "stories" do celular), setas, e um botão "Ouvir" que NARRA cada slide em
   português do Brasil com a voz do próprio aparelho — sem arquivo de vídeo
   para baixar, o que pesa no 4G do quartel.

   Fecha a qualquer momento (X, "Pular", tecla Esc). Com `automatico` os
   slides passam sozinhos; sem ele, o policial avança no próprio ritmo (é o
   caso do passo a passo, que ele precisa ler com calma).
   ========================================================================= */

/* imagem: no lugar do ícone (ex.: o brasão do Batalhão na abertura).
   selo: etiqueta acima do título (ex.: "Em breve").
   visual: o desenho da tela — botões iguais aos do SIGEP, com a seta
   mostrando onde tocar.
   passos: instruções curtas, em lista, abaixo do texto.
   fala: o que a narração lê no lugar do texto, quando ele tem símbolo que a
   voz do aparelho leria mal (⋮, setas). */
export type SlideApresentacao = {
  Icone: LucideIcon; imagem?: string; imagemAlt?: string; selo?: string;
  titulo: string; texto: string; visual?: React.ReactNode;
  itens?: string[]; passos?: string[]; fala?: string;
};

// a voz lê "P/1" como "P barra um": na narração vira "P1"
const paraFala = (s: SlideApresentacao) => (s.fala ?? s.texto).replace(/P\/1/g, "P1");

export default function Apresentacao({
  slides, aoFechar, rotulo = "SIGEP · 18º BPM", saudacao, automatico = true, segundos = 9,
  textoFinal = "Começar a usar", rotuloPular = "Pular a apresentação", iconesItens = {},
  alturaMinima = "min-h-[min(26.75rem,calc(100dvh_-_13rem))] sm:min-h-[min(21rem,calc(100dvh_-_10rem))]",
}: {
  slides: SlideApresentacao[];
  aoFechar: () => void;
  rotulo?: string;
  saudacao?: string;          // vira o título do 1º slide; o título dele desce para subtítulo
  automatico?: boolean;
  segundos?: number;          // por slide, sem narração
  textoFinal?: string;        // o botão do último slide
  rotuloPular?: string;
  iconesItens?: Record<string, LucideIcon>;
  /* Altura mínima do slide: os botões não pulam de lugar de um slide para
     outro. Vai em min(..., altura da tela - cabeçalho - botões): no celular
     de tela baixa ela encolhe, o slide rola por dentro e os botões continuam
     à vista. */
  alturaMinima?: string;
}) {
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(automatico);
  const [ouvir, setOuvir] = useState(false);
  const [progresso, setProgresso] = useState(0);   // 0..1 do slide atual
  const fim = i === slides.length - 1;
  const temVoz = typeof window !== "undefined" && "speechSynthesis" in window;
  const falando = useRef(false);
  const idTitulo = useId();

  const parar = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
    falando.current = false;
  }, []);
  const fechar = useCallback(() => { parar(); aoFechar(); }, [parar, aoFechar]);

  const ir = useCallback((n: number) => {
    parar();
    setProgresso(0);
    setI(Math.max(0, Math.min(slides.length - 1, n)));
  }, [parar, slides.length]);

  // ---- sem narração: o tempo empurra o slide ----
  useEffect(() => {
    if (!tocando || ouvir) return;
    const passo = 100;
    const t = setInterval(() => {
      setProgresso((p) => {
        const n = p + passo / (segundos * 1000);
        if (n >= 1) {
          if (i < slides.length - 1) { setI(i + 1); return 0; }
          setTocando(false);
          return 1;
        }
        return n;
      });
    }, passo);
    return () => clearInterval(t);
  }, [tocando, ouvir, i, segundos, slides.length]);

  // ---- com narração: a voz lê o slide e, ao terminar, passa para o próximo ----
  useEffect(() => {
    if (!ouvir || !tocando || !temVoz) return;
    parar();
    const s = slides[i];
    const u = new SpeechSynthesisUtterance(`${i === 0 && saudacao ? `${saudacao} ` : ""}${s.titulo}. ${paraFala(s)}`);
    u.lang = "pt-BR";
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt-br"))
      || window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (voz) u.voice = voz;
    u.rate = 1.02;
    const inicio = Date.now();
    const estimado = Math.max(4000, u.text.length * 65);
    const barra = setInterval(() => setProgresso(Math.min(0.98, (Date.now() - inicio) / estimado)), 150);
    u.onend = () => {
      clearInterval(barra);
      if (!falando.current) return;
      falando.current = false;
      setProgresso(1);
      setTimeout(() => {
        if (i < slides.length - 1) { setProgresso(0); setI((x) => x + 1); } else setTocando(false);
      }, 700);
    };
    falando.current = true;
    window.speechSynthesis.speak(u);
    return () => { clearInterval(barra); };
  }, [ouvir, tocando, i, temVoz, parar, saudacao, slides]);

  useEffect(() => () => parar(), [parar]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") ir(i + 1);
      if (e.key === "ArrowLeft") ir(i - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fechar, ir, i]);

  const s = slides[i];
  const Icone = s.Icone;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={idTitulo}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#13223a] to-[#0b1626] shadow-2xl">
        {/* barras de progresso, uma por slide */}
        <div className="flex shrink-0 gap-1 px-4 pt-3">
          {slides.map((_, k) => (
            <button key={k} onClick={() => ir(k)} aria-label={`Ir para o slide ${k + 1}`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[#D4AF37] transition-[width] duration-150"
                style={{ width: `${k < i ? 100 : k === i ? Math.round(progresso * 100) : 0}%` }} />
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between px-4 pt-2 text-[11px] text-[#94A3B8]">
          <span>{rotulo} — {i + 1} de {slides.length}</span>
          <button onClick={fechar} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10 hover:text-white" aria-label={rotuloPular}>
            Pular <X className="h-4 w-4" />
          </button>
        </div>

        {/* o slide (rola por dentro se a tela do celular for baixa demais;
            o my-auto centra sem cortar o topo quando precisa rolar) */}
        <div key={i} className={`flex min-h-0 flex-1 animate-[fadeIn_.45s_ease] flex-col overflow-y-auto px-6 pb-4 pt-4 text-center ${alturaMinima}`}>
          <div className="my-auto">
          {s.imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.imagem} alt={s.imagemAlt || ""} className="mx-auto mb-4 h-24 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,.5)]" />
          ) : s.visual ? (
            // com o desenho da tela, o ícone fica menor para sobrar espaço
            <div className="mx-auto mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 ring-2 ring-[#D4AF37]/40">
              <Icone className="h-6 w-6 text-[#D4AF37]" />
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#D4AF37]/15 ring-2 ring-[#D4AF37]/40">
              <Icone className="h-10 w-10 text-[#D4AF37]" />
            </div>
          )}
          {s.selo && (
            <span className="mx-auto mb-2 inline-flex w-fit items-center rounded-full bg-sky-400/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-sky-300 ring-1 ring-sky-400/40">
              {s.selo}
            </span>
          )}
          <h2 id={idTitulo} className="mb-2 text-2xl font-extrabold text-white">
            {i === 0 && saudacao ? saudacao : s.titulo}
          </h2>
          {i === 0 && saudacao && <p className="-mt-1 mb-2 text-sm font-semibold text-[#D4AF37]">{s.titulo}</p>}
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-[#cbd5e1]">{s.texto}</p>
          {s.visual && <div className="mx-auto mt-4 w-full max-w-md text-left">{s.visual}</div>}
          {s.passos && (
            <ul className="mx-auto mt-3 max-w-md space-y-1.5 text-left">
              {s.passos.map((p) => (
                <li key={p} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" /> {p}
                </li>
              ))}
            </ul>
          )}
          {s.itens && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {s.itens.map((it) => {
                const I = iconesItens[it] || Shield;
                return (
                  <span key={it} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">
                    <I className="h-3.5 w-3.5 text-[#D4AF37]" /> {it}
                  </span>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* controles */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => ir(i - 1)} disabled={i === 0} aria-label="Anterior"
              className="rounded-full p-2 text-[#cbd5e1] hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => { if (tocando) parar(); setTocando((v) => !v); }} aria-label={tocando ? "Pausar" : "Continuar"}
              className="rounded-full p-2 text-[#cbd5e1] hover:bg-white/10">{tocando ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
            <button onClick={() => ir(i + 1)} disabled={fim} aria-label="Próximo"
              className="rounded-full p-2 text-[#cbd5e1] hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            {temVoz && (
              <button onClick={() => { parar(); setOuvir((v) => !v); setTocando(true); setProgresso(0); }}
                className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  ouvir ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/15 text-[#cbd5e1] hover:border-[#D4AF37]/50"}`}>
                {ouvir ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {ouvir ? "Narrando" : "Ouvir"}
              </button>
            )}
          </div>
          {/* no celular, o botão principal ocupa a linha inteira (fácil de tocar) */}
          <button onClick={fim ? fechar : () => ir(i + 1)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1a1205] hover:brightness-110 sm:w-auto sm:py-2">
            {fim ? textoFinal : "Próximo"} {!fim && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>,
    document.body,
  );
}
