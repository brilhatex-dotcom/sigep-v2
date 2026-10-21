"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown, Check, CheckCircle2, Clock, ExternalLink, FileStack, Landmark, Lightbulb, Medal, PartyPopper,
  PlayCircle, Pointer, Send, Upload, Zap,
} from "lucide-react";
import Apresentacao, { type SlideApresentacao } from "@/components/Apresentacao";

/* =========================================================================
   PASSO A PASSO DO ENVIO DAS CERTIDÕES — em slides, na tela das certidões.

   Pedido do P/1: a tropa tem dificuldade com informática, então o caminho
   tem de ser o mais claro possível. Cada slide mostra o BOTÃO DESENHADO
   igual ao da tela, com a mãozinha "toque aqui" em cima dele — o policial
   reconhece o mesmo botão logo abaixo. E dá para ouvir (narração).

   Abre sozinho:
     · logo depois do primeiro acesso (troca de senha -> ?passo-a-passo=1);
     · na primeira visita do policial a esta tela, neste aparelho, enquanto
       ele ainda não enviou ao P/1.
   Depois disso, o botão "Ver o passo a passo" reabre quando quiser.

   O texto segue a tela de verdade (components/MinhasCertidoes): os mesmos
   nomes de botão, na mesma ordem dos 3 passos.
   ========================================================================= */

export type ParabensPasso = { gradDestino: string; ciclo: string } | null;

/* ------------------------------------------------- desenhos das telas */

// a mãozinha que aponta o botão desenhado
function ToqueAqui() {
  return (
    <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-[#D4AF37] px-2 py-0.5 text-[11px] font-extrabold text-[#1a1205] shadow">
      <Pointer className="h-3.5 w-3.5" /> toque aqui
    </span>
  );
}

// a "telinha": um pedaço da tela das certidões
function Tela({ legenda, children }: { legenda?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/15 bg-[#0F1B2D] p-3 shadow-inner">
      {legenda && <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#6f82a0]">{legenda}</p>}
      {children}
    </div>
  );
}

// botão dourado igual ao da tela, com a mãozinha
function BotaoOuro({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] ring-4 ring-[#D4AF37]/30">
        {icone} {texto}
      </span>
      <ToqueAqui />
    </div>
  );
}

// um item da lista de certidões
function Item({ n, orgao, descricao, link, estado, destaque }: {
  n: number; orgao: string; descricao: string; link?: string;
  estado: "falta" | "enviada"; destaque?: "link" | "enviar";
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-[#0b1626] p-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white">{orgao}</p>
        <p className="text-[11px] leading-snug text-[#94A3B8]">{descricao}</p>
        {link && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[12px] text-[#D4AF37] ${destaque === "link" ? "rounded-md px-1.5 py-0.5 font-bold ring-2 ring-[#D4AF37]" : ""}`}>
              <ExternalLink className="h-3 w-3" /> {link}
            </span>
            {destaque === "link" && <ToqueAqui />}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {estado === "enviada" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <Check className="h-3.5 w-3.5" /> Enviada
            </span>
          ) : (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-[#94A3B8]">Falta</span>
          )}
          {estado === "falta" && (
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm text-white ${destaque === "enviar" ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/40" : "border-white/15"}`}>
              <Upload className="h-4 w-4" /> Enviar
            </span>
          )}
          {destaque === "enviar" && <ToqueAqui />}
        </div>
      </div>
    </div>
  );
}

// a trilha dos 3 passos, igual à do alto da tela
function Trilha({ atual }: { atual?: 1 | 2 | 3 }) {
  const passos = ["Enviar as certidões", "Gerar o PDF", "Enviar ao P/1"];
  return (
    <div className="flex flex-col items-stretch gap-1">
      {passos.map((p, k) => (
        <div key={p}>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold ${
            atual === k + 1 ? "bg-[#D4AF37] text-[#1a1205]" : "bg-white/10 text-white"}`}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-[11px]">{k + 1}</span>
            {k + 1}º passo · {p}
          </div>
          {k < passos.length - 1 && <ArrowDown className="mx-auto my-0.5 h-3.5 w-3.5 text-[#D4AF37]/70" />}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- os slides */

function montarSlides(parabens: ParabensPasso, ehOficial: boolean): SlideApresentacao[] {
  const grad = parabens?.gradDestino || "a próxima graduação";
  return [
    {
      Icone: parabens ? PartyPopper : Medal,
      titulo: parabens ? "Você está no Limite Quantitativo" : "Envio das certidões para promoção",
      texto: parabens
        ? `Você está na lista para a promoção a ${grad}${parabens.ciclo ? ` de ${parabens.ciclo}` : ""}. Agora falta enviar as suas certidões ao P/1. São só 3 passos — veja como faz.`
        : "Veja, em 3 passos, como enviar as suas certidões ao P/1.",
      visual: <Trilha />,
    },
    {
      Icone: Landmark,
      titulo: "1º passo: as 3 certidões do TJMA",
      texto: "Toque em “Emitir no TJMA”, preencha os seus dados e baixe o PDF. Faça isso nas 3 certidões do TJMA: Ações Penais do 1º grau, Ações Penais do 2º grau e Justiça Militar Estadual.",
      visual: (
        <Tela legenda="Na tela das certidões">
          <Item n={1} orgao="TJMA" descricao="Certidão Estadual 1º Grau (Ações Penais)" link="Emitir no TJMA" estado="falta" destaque="link" />
        </Tela>
      ),
    },
    {
      Icone: Zap,
      titulo: "1º passo: a certidão da Justiça Federal",
      texto: "A Certidão Unificada é uma certidão só e vale do TRF1 ao TRF5. Toque em “Emitir a Certidão Unificada”, preencha e baixe o PDF.",
      visual: (
        <div className="space-y-2">
          <Tela legenda="Na tela das certidões">
            <BotaoOuro icone={<Zap className="h-4 w-4" />} texto="Emitir a Certidão Unificada" />
          </Tela>
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-[12.5px] leading-snug text-amber-100">
            <b className="text-amber-200">Não conseguiu a Unificada?</b> Então tire a certidão de <b>cada TRF, uma por uma</b>
            {" "}(TRF1, TRF2, TRF3, TRF4 e TRF5). Cada item da lista tem o seu botão “Emitir no TRF”.
          </div>
        </div>
      ),
      fala: "A Certidão Unificada é uma certidão só e vale do TRF1 ao TRF5. Toque em Emitir a Certidão Unificada, preencha e baixe o PDF. Não conseguiu a Unificada? Então tire a certidão de cada TRF, uma por uma: TRF1, TRF2, TRF3, TRF4 e TRF5. Cada item da lista tem o seu botão Emitir no TRF.",
    },
    {
      Icone: Upload,
      titulo: "1º passo: envie cada PDF",
      texto: "Em cada item, toque em “Enviar” e escolha o PDF no celular (costuma ficar em Downloads). A Unificada vai no botão “Enviar a unificada”. Deu certo? Aparece “Enviada”, em verde. Errou o arquivo? Toque em “Trocar” e escolha o certo.",
      visual: (
        <Tela legenda="Na tela das certidões">
          <Item n={2} orgao="TJMA" descricao="Certidão 2º Grau (Ações Penais)" estado="falta" destaque="enviar" />
          {/* o "depois", numa linha só: o slide não fica mais alto que os outros */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[#94A3B8]">
            <ArrowDown className="h-4 w-4 text-[#D4AF37]" /> deu certo:
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <Check className="h-3.5 w-3.5" /> Enviada
            </span>
          </div>
        </Tela>
      ),
    },
    {
      Icone: FileStack,
      titulo: "2º passo: gere o PDF unificado",
      texto: "Com todos os itens “Enviada”, toque em “Gerar PDF unificado”. O sistema junta todas as certidões num arquivo só, na ordem certa.",
      visual: (
        <Tela legenda="2º passo, na tela">
          <BotaoOuro icone={<FileStack className="h-4 w-4" />} texto="Gerar PDF unificado" />
        </Tela>
      ),
    },
    {
      Icone: Send,
      titulo: "3º passo: envie ao P/1",
      texto: "Confira se os PDFs estão certos e toque em “Enviar ao P/1”. Pronto! Aparece “Enviado — aguardando o P/1”. Quando o P/1 conferir, muda para “P/1 confirmou o recebimento”.",
      visual: (
        <Tela legenda="3º passo, na tela">
          <BotaoOuro icone={<Send className="h-4 w-4" />} texto="Enviar ao P/1" />
          <div className="mt-2.5 flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#D4AF37]/15 px-2.5 py-1 text-xs font-semibold text-[#f3df9d]">
              <Clock className="h-3.5 w-3.5" /> Enviado — aguardando o P/1
            </span>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> P/1 confirmou o recebimento
            </span>
          </div>
        </Tela>
      ),
      fala: "Confira se os PDFs estão certos e toque em Enviar ao P/1. Pronto! Aparece: enviado, aguardando o P/1. Quando o P/1 conferir, muda para: P/1 confirmou o recebimento.",
    },
    {
      Icone: Lightbulb,
      titulo: "Atenção",
      texto: "Fique atento ao prazo informado pelo P/1. Dúvidas? Procure o P/1. Boa sorte!",
      // a regra da trava, como o P/1 quer: antes de enviar, troca à vontade;
      // depois de enviar, só o P/1 reabre
      passos: [
        "Só vale arquivo em PDF.",
        "Antes de enviar ao P/1, você pode trocar ou excluir qualquer arquivo, quantas vezes precisar.",
        "Depois de “Enviar ao P/1”, fica travado. Para trocar algo, peça ao P/1 para reabrir.",
        ...(ehOficial ? ["Oficiais e subtenentes: enviam também a do TRF da 6ª Região e geram a Declaração individual, no fim da tela."] : []),
        "Esqueceu como faz? Toque em “Ver o passo a passo”, no alto da tela.",
      ],
      fala: `Fique atento ao prazo informado pelo P/1. Só vale arquivo em PDF. Antes de enviar ao P/1, você pode trocar ou excluir qualquer arquivo, quantas vezes precisar. Depois de enviar ao P/1, fica travado: para trocar algo, peça ao P/1 para reabrir.${
        ehOficial ? " Oficiais e subtenentes enviam também a certidão do TRF da 6ª Região e geram a Declaração individual, no fim da tela." : ""
      } Esqueceu como faz? Toque em Ver o passo a passo, no alto da tela. Dúvidas? Procure o P/1. Boa sorte!`,
    },
  ];
}

/* ------------------------------------------- o cartão e a apresentação */

export default function PassoAPassoCertidoes({ efetivoId, nome, parabens, ehOficial, jaEnviado, abrirAgora }: {
  efetivoId: string;
  nome: string;             // "Sd PM Silva"
  parabens: ParabensPasso;  // está no Limite Quantitativo (e ainda não enviou ao P/1)
  ehOficial: boolean;       // oficial/subtenente: tem o TRF6 e a declaração
  jaEnviado: boolean;       // já mandou ao P/1: não abre sozinho
  abrirAgora: boolean;      // veio da troca de senha do primeiro acesso
}) {
  const [aberto, setAberto] = useState(false);
  const chave = `sigep-passo-certidoes-visto:${efetivoId}`;

  useEffect(() => {
    let visto = false;
    try { visto = localStorage.getItem(chave) === "1"; } catch { /* sem storage: abre */ }
    if (abrirAgora || (!jaEnviado && !visto)) setAberto(true);
  }, [abrirAgora, jaEnviado, chave]);

  const fechar = () => {
    try { localStorage.setItem(chave, "1"); } catch { /* sem storage */ }
    setAberto(false);
    // tira o ?passo-a-passo=1 do endereço: recarregar a página não reabre
    if (abrirAgora) window.history.replaceState(null, "", window.location.pathname);
  };

  const grad = parabens?.gradDestino || "a próxima graduação";
  const saudacao = parabens ? `Parabéns${nome ? `, ${nome}` : ""}!` : nome ? `Olá, ${nome}!` : undefined;

  return (
    <>
      <div className={`mb-5 rounded-xl border p-4 ${parabens
        ? "border-[#D4AF37]/60 bg-gradient-to-br from-[#D4AF37]/20 to-transparent"
        : "border-white/10 bg-[#0F1B2D]"}`}>
        {parabens && (
          <p className="mb-3 text-sm leading-relaxed text-[#e7d9b0]">
            <span className="mr-1 text-base">🎉</span>
            <b className="text-white">Parabéns{nome ? `, ${nome}` : ""}!</b> Você está no <b className="text-white">Limite Quantitativo</b> para
            a promoção a <b className="text-white">{grad}</b>{parabens.ciclo ? <> de <b className="text-white">{parabens.ciclo}</b></> : null}.
            Envie as suas certidões nos 3 passos abaixo.
          </p>
        )}
        <button onClick={() => setAberto(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-base font-extrabold text-[#1a1205] shadow-lg transition hover:brightness-110 sm:w-auto">
          <PlayCircle className="h-5 w-5" /> Ver o passo a passo de como enviar
        </button>
      </div>

      {aberto && (
        <Apresentacao
          slides={montarSlides(parabens, ehOficial)}
          rotulo="Passo a passo · Certidões"
          saudacao={saudacao}
          automatico={false}
          textoFinal="Começar agora"
          rotuloPular="Fechar o passo a passo"
          alturaMinima="min-h-[min(31rem,calc(100dvh_-_13rem))] sm:min-h-[min(28.5rem,calc(100dvh_-_10rem))]"
          aoFechar={fechar}
        />
      )}
    </>
  );
}
