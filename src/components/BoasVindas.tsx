"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight, Bell, CalendarDays, ChevronLeft, ChevronRight, Contact, FileSignature, Medal,
  MessageSquare, Pause, Play, Shield, Sun, Volume2, VolumeX, X,
} from "lucide-react";

/* =========================================================================
   BOAS-VINDAS AO SIGEP — a apresentação do primeiro acesso.

   Funciona como um vídeo curto: slides que passam sozinhos, com a barra de
   progresso em cima (como os "stories" do celular), e um botão "Ouvir" que
   NARRA cada slide em português do Brasil com a voz do próprio aparelho —
   sem arquivo de vídeo para baixar, o que pesa no 4G do quartel.

   O policial não é obrigado a assistir: fecha a qualquer momento (X, "Pular",
   tecla Esc). Aparece uma vez por pessoa (ver boasVindasDb.ts).

   O conteúdo fala do que o POLICIAL encontra no menu — não das telas do P/1.
   ========================================================================= */

type Slide = { Icone: typeof Shield; titulo: string; texto: string; itens?: string[] };

const SLIDES: Slide[] = [
  {
    Icone: Shield,
    titulo: "Bem-vindo ao SIGEP",
    texto: "O SIGEP é o Sistema de Gestão de Pessoal do 18º Batalhão: uma ferramenta de apoio administrativo da unidade. Ele reúne num lugar só o que antes ficava espalhado em papel, planilha e mensagem — e deixa você acompanhar a sua vida funcional pelo celular.",
  },
  {
    Icone: Contact,
    titulo: "Sua ficha e seus dados",
    texto: "Em Ficha Individual você confere e atualiza os seus dados: pessoais, de contato, bancários e a sua foto. Dados certos evitam problema em pagamento, convocação e documento.",
  },
  {
    Icone: CalendarDays,
    titulo: "Sua escala de serviço",
    texto: "Em Escala de Serviço e Meu Mapa de Escala você vê quando está de serviço. E em Permutas pede a troca de um serviço com um colega: ele dá o concordo e o P/1 defere, tudo pelo sistema.",
    itens: ["Escala de Serviço", "Meu Mapa de Escala", "Permutas"],
  },
  {
    Icone: Sun,
    titulo: "Férias, cursos e JOE",
    texto: "Em Minhas Férias você vê a sua equipe, o período e baixa o memorando. Em Cursos e em JOE acompanha o que é com você.",
    itens: ["Minhas Férias", "Cursos", "JOE"],
  },
  {
    Icone: FileSignature,
    titulo: "Requerimentos e assinatura",
    texto: "Em Requerimentos você monta documentos já preenchidos com os seus dados — como o de premiação por apreensão de arma de fogo — e assina pelo próprio SIGEP, com a sua senha. Sai um carimbo com QR, que qualquer um confere em Verificar Documento.",
    itens: ["Requerimentos", "Verificar Documento"],
  },
  {
    Icone: Medal,
    titulo: "Promoções",
    texto: "Em Promoções e Certidões você envia as suas certidões, o sistema gera o PDF unificado e você manda ao P/1 — e acompanha quando ele recebe.",
  },
  {
    Icone: Bell,
    titulo: "Fique de olho no sino",
    texto: "O sino, lá em cima, e o aviso que aparece quando você entra mostram o que está esperando por você: uma assinatura, uma permuta, um documento. E no Chat você fala com a unidade. Dúvidas? Procure o P/1. Bom serviço!",
    itens: ["Sino de avisos", "Chat"],
  },
];

const SEGUNDOS = 9;   // por slide, sem narração

const ICONE_ITEM: Record<string, typeof Shield> = {
  "Escala de Serviço": CalendarDays, "Meu Mapa de Escala": CalendarDays, Permutas: ArrowLeftRight,
  "Minhas Férias": Sun, Cursos: Medal, JOE: CalendarDays, Requerimentos: FileSignature,
  "Verificar Documento": Shield, "Sino de avisos": Bell, Chat: MessageSquare,
};

export default function BoasVindas({ nome, aoFechar }: { nome?: string; aoFechar: () => void }) {
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(true);
  const [ouvir, setOuvir] = useState(false);
  const [progresso, setProgresso] = useState(0);   // 0..1 do slide atual
  const fim = i === SLIDES.length - 1;
  const temVoz = typeof window !== "undefined" && "speechSynthesis" in window;
  const falando = useRef(false);

  const parar = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
    falando.current = false;
  }, []);
  const fechar = useCallback(() => { parar(); aoFechar(); }, [parar, aoFechar]);

  const ir = useCallback((n: number) => {
    parar();
    setProgresso(0);
    setI(Math.max(0, Math.min(SLIDES.length - 1, n)));
  }, [parar]);

  // ---- sem narração: o tempo empurra o slide ----
  useEffect(() => {
    if (!tocando || ouvir) return;
    const passo = 100;
    const t = setInterval(() => {
      setProgresso((p) => {
        const n = p + passo / (SEGUNDOS * 1000);
        if (n >= 1) {
          if (i < SLIDES.length - 1) { setI(i + 1); return 0; }
          setTocando(false);
          return 1;
        }
        return n;
      });
    }, passo);
    return () => clearInterval(t);
  }, [tocando, ouvir, i]);

  // ---- com narração: a voz lê o slide e, ao terminar, passa para o próximo ----
  useEffect(() => {
    if (!ouvir || !tocando || !temVoz) return;
    parar();
    const s = SLIDES[i];
    const u = new SpeechSynthesisUtterance(`${i === 0 && nome ? `Olá, ${nome}. ` : ""}${s.titulo}. ${s.texto}`);
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
        if (i < SLIDES.length - 1) { setProgresso(0); setI((x) => x + 1); } else setTocando(false);
      }, 700);
    };
    falando.current = true;
    window.speechSynthesis.speak(u);
    return () => { clearInterval(barra); };
  }, [ouvir, tocando, i, temVoz, parar, nome]);

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

  const s = SLIDES[i];
  const Icone = s.Icone;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="boas-vindas-titulo"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#13223a] to-[#0b1626] shadow-2xl">
        {/* barras de progresso, uma por slide */}
        <div className="flex gap-1 px-4 pt-3">
          {SLIDES.map((_, k) => (
            <button key={k} onClick={() => ir(k)} aria-label={`Ir para o slide ${k + 1}`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[#D4AF37] transition-[width] duration-150"
                style={{ width: `${k < i ? 100 : k === i ? Math.round(progresso * 100) : 0}%` }} />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-[#94A3B8]">
          <span>SIGEP · 18º BPM — {i + 1} de {SLIDES.length}</span>
          <button onClick={fechar} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10 hover:text-white" aria-label="Pular a apresentação">
            Pular <X className="h-4 w-4" />
          </button>
        </div>

        {/* o slide */}
        <div key={i} className="animate-[fadeIn_.45s_ease] px-6 pb-4 pt-4 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#D4AF37]/15 ring-2 ring-[#D4AF37]/40">
            <Icone className="h-10 w-10 text-[#D4AF37]" />
          </div>
          <h2 id="boas-vindas-titulo" className="mb-2 text-2xl font-extrabold text-white">
            {i === 0 && nome ? `Olá, ${nome}!` : s.titulo}
          </h2>
          {i === 0 && nome && <p className="-mt-1 mb-2 text-sm font-semibold text-[#D4AF37]">{s.titulo}</p>}
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-[#cbd5e1]">{s.texto}</p>
          {s.itens && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {s.itens.map((it) => {
                const I = ICONE_ITEM[it] || Shield;
                return (
                  <span key={it} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">
                    <I className="h-3.5 w-3.5 text-[#D4AF37]" /> {it}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* controles */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
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
          <button onClick={fim ? fechar : () => ir(i + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#1a1205] hover:brightness-110">
            {fim ? "Começar a usar" : "Próximo"} {!fim && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>,
    document.body,
  );
}
