import { prisma } from "@/lib/prisma";

/* O "suas certidões foram recebidas pelo P/1" aparece UMA vez na tela do
   policial. Aqui fica qual recebimento ele já viu: se o P/1 reabrir e der o
   recebido de novo, a data muda e o aviso volta.

   Tabela própria (e não o mapa de status do P/1 na Config): é gravada no
   login de cada policial, e o mapa é um JSON só para todos — duas gravações
   ao mesmo tempo apagariam uma à outra. Criada em runtime (o deploy não roda
   `db push`). */

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS aviso_certidoes (
        periodo_id text NOT NULL,
        efetivo_id text NOT NULL,
        recebido_em text NOT NULL,
        visto_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (periodo_id, efetivo_id)
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export async function recebimentoVisto(periodoId: string, efetivoId: string): Promise<string | null> {
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT recebido_em FROM aviso_certidoes WHERE periodo_id = $1 AND efetivo_id = $2`, periodoId, efetivoId);
    return rows[0]?.recebido_em ?? null;
  } catch { return null; }
}

export async function marcarRecebimentoVisto(periodoId: string, efetivoId: string, recebidoEm: string): Promise<void> {
  await garantir();
  await prisma.$executeRawUnsafe(
    `INSERT INTO aviso_certidoes (periodo_id, efetivo_id, recebido_em) VALUES ($1, $2, $3)
     ON CONFLICT (periodo_id, efetivo_id) DO UPDATE SET recebido_em = EXCLUDED.recebido_em, visto_em = CURRENT_TIMESTAMP`,
    periodoId, efetivoId, recebidoEm);
}
