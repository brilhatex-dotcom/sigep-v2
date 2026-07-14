import { prisma } from "@/lib/prisma";

/* =========================================================================
   Status de envio das certidões ao P/1 — guardado na tabela Config (sem
   alterar o schema/tabelas em producao, seguindo o padrao do projeto).

   Config.chave = "promocao_status_p1"
   Config.valor = JSON: { [`${periodoId}:${efetivoId}`]: { enviadoEm, recebidoEm } }
   ========================================================================= */

export const CHAVE_STATUS_P1 = "promocao_status_p1";

export type StatusP1 = { enviadoEm?: string | null; recebidoEm?: string | null };
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
