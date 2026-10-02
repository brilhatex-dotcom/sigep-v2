"use client";

import { useEffect, useRef } from "react";

/* =========================================================================
   SINCRONIA ENTRE AS ABAS

   O problema que isto resolve: cada aba aberta do SIGEP era um sistema
   sozinho. Três abas = três relógios batendo no servidor pelas MESMAS
   informações, e ainda assim desencontradas — a escala de uma aba podia
   estar 15 segundos à frente da outra, no mesmo computador.

   Aqui as abas passam a conversar por BroadcastChannel, que é uma conversa
   dentro do próprio navegador: não passa pela internet, não toca no banco,
   não custa nada e chega na hora.

   Como funciona:

   1. UMA ABA É A LÍDER. Só ela pergunta ao servidor. As demais ficam
      caladas, escutando.
   2. A líder REPARTE o que recebeu com as outras, instantaneamente. Todas
      ficam idênticas no mesmo instante — não "quase ao mesmo tempo".
   3. Se a líder for fechada, outra assume em segundos, sozinha.
   4. Quando alguém MEXE em alguma coisa (salva a escala, lê o chat), avisa
      as demais na hora, sem esperar o próximo tique.

   O ganho: com três abas abertas, o servidor recebe UM terço das perguntas
   e as três telas ficam mais sincronizadas do que antes.

   Se o navegador não tiver BroadcastChannel, cada aba vira líder de si mesma
   e tudo continua funcionando como antes — mais pedidos, mas nada quebra.
   ========================================================================= */

export type Pulso = {
  escala: { dias: string; cad: string } | null;
  // carimbo de mudança do sistema (lib/prisma): mudou = alguém gravou algo
  v?: string;
  notificacoes?: { id: string; texto: string; em: string; href?: string }[] | null;
};

/* O que uma aba avisa às outras quando o usuário mexe em algo. */
export type Assunto = "escala" | "notificacoes" | "chat";

const CANAL = "sigep-sincronia";
const RAPIDO_MS = 3000;          // carimbo de mudança (+ escala, se aberta)
const NOTIF_MS = 60000;          // notificações do sino (consultas caras)
const ANUNCIO_MS = 1500;         // de quanto em quanto a líder diz "estou aqui"
const SEM_LIDER_MS = 4000;       // sem notícia da líder por este tempo: assumo
const INTERESSE_MS = 5000;       // "tem escala aberta aqui" vale por este tempo
export const OCIOSO_MS = 15 * 60 * 1000;  // 15 min parado = ninguém na frente

/* A batida rápida traz o CARIMBO DE MUDANÇA do sistema (lib/prisma): quando
   alguém grava algo em qualquer PC, ele muda, e as telas abertas recarregam na
   hora (components/LiveRefresh) e o sino se atualiza. O carimbo é minúsculo e
   o servidor o guarda 2 s na memória — perguntar de 3 em 3 s quase não toca no
   banco.

   A assinatura da escala, que essa mesma batida também traz, só interessa a
   quem está com uma tela de ESCALA aberta: a aba que tem escala avisa as
   outras ("tenho interesse"), e só então a líder pede essa parte. */

type Msg =
  | { t: "lider"; id: string }
  | { t: "abdica"; id: string }
  | { t: "pulso"; dados: Pulso }
  | { t: "mudou"; o: Assunto }
  | { t: "escala" };

/* ---------------- estado do módulo (um por aba) ---------------- */

const meuId = Math.random().toString(36).slice(2) + Date.now().toString(36);
let canal: BroadcastChannel | null = null;
let souLider = false;
let ultimoLiderEm = 0;
let ultimaAtividade = Date.now();
let ligado = false;

let tRapido: any = null;
let tNotif: any = null;
let tAnuncio: any = null;
let tEleicao: any = null;

let telasDeEscala = 0;     // telas de escala montadas NESTA aba
let querEscalaAte = 0;     // alguém (esta aba ou outra) tem escala aberta até lá
const querEscala = () => Date.now() < querEscalaAte;

const assinantes = new Set<(p: Pulso) => void>();
const ouvintesMudanca = new Set<(o: Assunto) => void>();
let ultimoPulso: Pulso | null = null;
let buscando = false;

const enviar = (m: Msg) => { try { canal?.postMessage(m); } catch { /* aba fechando */ } };
const entregar = (p: Pulso) => { ultimoPulso = p; for (const f of assinantes) { try { f(p); } catch { /* assinante cuida do seu */ } } };

const ativo = () =>
  typeof document !== "undefined" && !document.hidden && Date.now() - ultimaAtividade <= OCIOSO_MS;

/* ---------------- a busca (só a líder faz) ---------------- */

/* Sessão caiu/expirou: não adianta insistir de 2 em 2 segundos levando 401.
   Espera um minuto antes de tentar de novo — tempo de a pessoa entrar outra
   vez, sem transformar a tela de login num martelo contra o servidor. */
let bloqueadoAte = 0;

let ultimoV: string | null = null;   // último carimbo de mudança visto

async function buscar(comNotif: boolean) {
  if (buscando || !ativo() || Date.now() < bloqueadoAte) return;
  buscando = true;
  let mudouAlgo = false;
  try {
    const q = new URLSearchParams();
    if (comNotif) q.set("notif", "1");
    if (!querEscala()) q.set("escala", "0");   // o servidor pula a parte da escala
    const r = await fetch("/api/pulso" + (q.toString() ? "?" + q : ""));
    if (r.status === 401 || r.status === 403) { bloqueadoAte = Date.now() + 60000; return; }
    if (!r.ok) return;
    const d = (await r.json()) as Pulso;
    /* Sem notificações na resposta rápida, mantém as que já tínhamos — senão
       o sino apagaria e reacenderia a cada 2 segundos. */
    const p: Pulso = comNotif ? d : { ...d, notificacoes: ultimoPulso?.notificacoes ?? null };
    // alguém gravou algo desde o último pulso: o sino também se atualiza já
    if (d.v) { mudouAlgo = !comNotif && ultimoV !== null && d.v !== ultimoV; ultimoV = d.v; }
    entregar(p);
    enviar({ t: "pulso", dados: p });   // reparte com as outras abas
  } catch { /* rede caiu: o próximo tique tenta de novo */ }
  finally { buscando = false; }
  if (mudouAlgo) buscar(true);
}

/* ---------------- eleição da líder ---------------- */

function assumir() {
  if (souLider) return;
  souLider = true;
  enviar({ t: "lider", id: meuId });
  tAnuncio = setInterval(() => { if (souLider) enviar({ t: "lider", id: meuId }); }, ANUNCIO_MS);
  tRapido = setInterval(() => buscar(false), RAPIDO_MS);
  tNotif = setInterval(() => buscar(true), NOTIF_MS);
  buscar(true);   // ao assumir, puxa tudo de uma vez
}

function largar() {
  if (!souLider) return;
  souLider = false;
  clearInterval(tAnuncio); clearInterval(tRapido); clearInterval(tNotif);
  tAnuncio = tRapido = tNotif = null;
}

function aoReceber(m: Msg) {
  if (!m || typeof m !== "object") return;
  if (m.t === "lider") {
    ultimoLiderEm = Date.now();
    /* Duas líderes ao mesmo tempo (abas abertas no mesmo instante): quem tem
       o id maior sai de cena. A comparação é a mesma nas duas pontas, então
       sempre sobra exatamente uma. */
    if (souLider && m.id < meuId) largar();
  } else if (m.t === "abdica") {
    ultimoLiderEm = 0;               // a líder fechou: eleição já
  } else if (m.t === "pulso") {
    if (m.dados?.v) ultimoV = m.dados.v;
    entregar(m.dados);               // veio pronto de outra aba: nada a pedir
  } else if (m.t === "mudou") {
    for (const f of ouvintesMudanca) { try { f(m.o); } catch { /* ignora */ } }
    if (souLider) buscar(m.o === "notificacoes");   // confirma no servidor já
  } else if (m.t === "escala") {
    querEscalaAte = Date.now() + INTERESSE_MS;      // outra aba está com a escala aberta
  }
}

function ligar() {
  if (ligado || typeof window === "undefined") return;
  ligado = true;

  try { canal = new BroadcastChannel(CANAL); canal.onmessage = (e) => aoReceber(e.data); }
  catch { canal = null; }   // navegador sem suporte: cada aba cuida de si

  const marcar = () => {
    const voltou = Date.now() - ultimaAtividade > OCIOSO_MS;
    ultimaAtividade = Date.now();
    if (voltou && souLider) buscar(true);   // voltou depois de um tempo: atualiza já
  };
  for (const e of ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"]) {
    window.addEventListener(e, marcar, { passive: true });
  }
  const aoVoltar = () => { if (!document.hidden) marcar(); };
  document.addEventListener("visibilitychange", aoVoltar);
  window.addEventListener("focus", aoVoltar);
  window.addEventListener("pagehide", () => { if (souLider) enviar({ t: "abdica", id: meuId }); });

  /* Com uma tela de escala montada aqui, renova o interesse e avisa as outras
     abas — a líder pode ser outra. */
  setInterval(() => {
    if (telasDeEscala > 0) { querEscalaAte = Date.now() + INTERESSE_MS; enviar({ t: "escala" }); }
  }, ANUNCIO_MS);

  /* Sem BroadcastChannel não há com quem conversar: esta aba é a líder. */
  if (!canal) { assumir(); return; }

  tEleicao = setInterval(() => {
    if (!ativo()) { largar(); return; }             // ociosa não lidera nem pergunta
    if (souLider) return;
    if (Date.now() - ultimoLiderEm > SEM_LIDER_MS) assumir();
  }, ANUNCIO_MS);

  // Espera um instante para ouvir uma líder já existente antes de se candidatar.
  setTimeout(() => { if (!souLider && Date.now() - ultimoLiderEm > SEM_LIDER_MS) assumir(); }, 600);
}

/* ---------------- o que as telas usam ---------------- */

/* Recebe cada pulso (assinaturas da escala e, de minuto em minuto, o sino).
   A tela não precisa saber se veio do servidor ou da aba ao lado.

   Telas de ESCALA passam { escala: true }: é o que liga a batida rápida (a
   assinatura da escala) enquanto elas estiverem abertas. */
export function usePulso(aoPulso: (p: Pulso) => void, opcoes: { escala?: boolean } = {}) {
  const ref = useRef(aoPulso);
  ref.current = aoPulso;
  const escala = !!opcoes.escala;
  useEffect(() => {
    ligar();
    const f = (p: Pulso) => ref.current(p);
    assinantes.add(f);
    if (escala) {
      telasDeEscala++;
      querEscalaAte = Date.now() + INTERESSE_MS;
      enviar({ t: "escala" });
      if (souLider) buscar(false);     // a assinatura já, sem esperar o tique
    }
    if (ultimoPulso) f(ultimoPulso);   // já tem algo na mão: entrega na hora
    return () => {
      assinantes.delete(f);
      if (escala) telasDeEscala = Math.max(0, telasDeEscala - 1);
    };
  }, [escala]);
}

/* Ouve o aviso de que ALGUÉM (outra aba) mexeu em alguma coisa. */
export function useMudancaDeOutraAba(aoMudar: (o: Assunto) => void) {
  const ref = useRef(aoMudar);
  ref.current = aoMudar;
  useEffect(() => {
    ligar();
    const f = (o: Assunto) => ref.current(o);
    ouvintesMudanca.add(f);
    return () => { ouvintesMudanca.delete(f); };
  }, []);
}

/* Avisa as outras abas que esta acabou de mexer em algo — o que faz a mudança
   aparecer nelas na hora, sem esperar o tique. */
export function avisarMudanca(o: Assunto) {
  ligar();
  enviar({ t: "mudou", o });
  if (souLider) buscar(o === "notificacoes");
}
