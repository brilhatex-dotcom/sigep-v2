import { prisma } from "@/lib/prisma";

/* =========================================================================
   Status de envio das certidões ao P/1 — guardado na tabela Config (sem
   alterar o schema/tabelas em producao, seguindo o padrao do projeto).

   Config.chave = "promocao_status_p1"
   Config.valor = JSON: { [`${periodoId}:${efetivoId}`]: { enviadoEm, recebidoEm, reabertoEm } }
   reabertoEm: quando o P/1 reabriu pela última vez — o policial vê o alerta
   "há certidão para corrigir" até enviar de novo.
   liberadoEm: o P/1 liberou o envio dele depois do prazo (ver promocaoPrazo).
   ========================================================================= */

export const CHAVE_STATUS_P1 = "promocao_status_p1";

export type StatusP1 = {
  enviadoEm?: string | null; recebidoEm?: string | null; reabertoEm?: string | null; liberadoEm?: string | null;
};
export type MapaStatusP1 = Record<string, StatusP1>;

function chaveDe(periodoId: string, efetivoId: string): string {
  return `${periodoId}:${efetivoId}`;
}

export async function lerMapaP1(): Promise<MapaStatusP1> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_STATUS_P1 } });
    if (!row?.valor) return {};
    const v = JSON.parse(row.valor);
    return v && typeof v === "object" ? (v as MapaStatusP1) : {};
  } catch {
    return {};
  }
}

export async function statusP1(periodoId: string, efetivoId: string): Promise<StatusP1 | null> {
  const mapa = await lerMapaP1();
  return mapa[chaveDe(periodoId, efetivoId)] ?? null;
}

export async function salvarStatusP1(
  periodoId: string,
  efetivoId: string,
  patch: StatusP1
): Promise<StatusP1> {
  const mapa = await lerMapaP1();
  const k = chaveDe(periodoId, efetivoId);
  const atual = mapa[k] ?? {};
  const novo: StatusP1 = { ...atual, ...patch };
  mapa[k] = novo;
  const valor = JSON.stringify(mapa);
  await prisma.config.upsert({
    where: { chave: CHAVE_STATUS_P1 },
    update: { valor },
    create: { chave: CHAVE_STATUS_P1, valor, descricao: "Envio/recebimento das certidões de promoção ao P/1" },
  });
  return novo;
}

/* Tira o militar do mapa (exclusão do participante pelo P/1): sem isto o
   "enviado"/"recebido" de um teste ficaria valendo se ele voltasse a enviar. */
export async function apagarStatusP1(periodoId: string, efetivoId: string): Promise<void> {
  const mapa = await lerMapaP1();
  const k = chaveDe(periodoId, efetivoId);
  if (!(k in mapa)) return;
  delete mapa[k];
  await prisma.config.upsert({
    where: { chave: CHAVE_STATUS_P1 },
    update: { valor: JSON.stringify(mapa) },
    create: { chave: CHAVE_STATUS_P1, valor: JSON.stringify(mapa), descricao: "Envio/recebimento das certidões de promoção ao P/1" },
  });
}
