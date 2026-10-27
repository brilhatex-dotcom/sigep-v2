import type { StatusP1 } from "@/lib/promocaoStatusP1";

/* =========================================================================
   PRAZO DE ENVIO DAS CERTIDÕES (por período de promoção).

   Passou do prazo, o POLICIAL não envia, não troca, não exclui, não gera o
   PDF e não envia ao P/1 — tudo travado no servidor, não só na tela. O P/1
   continua podendo tudo (conferir, receber, reabrir, mexer pela ficha).

   Exceção, um a um: depois do prazo, o P/1 REABRE (certidão para corrigir)
   ou LIBERA (o Cmt aceitou o atrasado) um militar — esse volta a poder
   mexer até enviar ao P/1 de novo.

   Arquivar o período não serve para isso: tira o período do painel do P/1,
   que ainda precisa conferir e receber.

   As regras (puras, servem à tela também) ficam aqui; o banco, em
   promocaoPrazoDb.ts.
   ========================================================================= */

export type PrazoEnvio = { ate: string | null; definidoEm?: string; por?: string };

// o horário do quartel (Maranhão, UTC-3, sem horário de verão)
const FUSO = "America/Fortaleza";

export function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

/* "2026-10-26T23:59" (o campo de data e hora da tela, no horário do
   quartel) -> instante ISO. */
export function deHorarioLocal(valor: string): string | null {
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* Encerrado para ESTE militar? Passou do prazo e o P/1 não o reabriu nem
   liberou depois do prazo. */
export function envioEncerrado(prazo: PrazoEnvio | null, st: StatusP1 | null, agora = new Date()): boolean {
  if (!prazo?.ate) return false;
  const ate = Date.parse(prazo.ate);
  if (!Number.isFinite(ate) || agora.getTime() < ate) return false;
  const excecao = [st?.reabertoEm, st?.liberadoEm]
    .map((x) => (x ? Date.parse(x) : NaN))
    .some((t) => Number.isFinite(t) && t >= ate);
  return !excecao;
}

export function mensagemEncerrado(prazo: PrazoEnvio): string {
  return `O prazo de envio das certidões terminou em ${dataHoraBR(prazo.ate!)}. Procure o P/1.`;
}
