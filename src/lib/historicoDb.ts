import { prisma } from "@/lib/prisma";

/* =========================================================================
   HISTÓRICO POLICIAL MILITAR — TABELA CRIADA EM RUNTIME

   O deploy não roda `db push` (ver README), então tabela nova declarada só no
   schema.prisma não existiria em produção. Como no chat e nas promoções, ela
   é criada aqui na primeira vez que a rota roda.

   Uma LINHA por militar, com o conteúdo inteiro em JSON. O histórico é um
   documento — as seções são texto corrido transcrito de boletim ("BG nº 134
   de 22/07/2022, publicou que foi promovido…"), não campos com formato fixo.
   Guardar como texto por seção é o que deixa o P/1 escrever exatamente o que
   o papel precisa, sem o sistema atrapalhar.
   ========================================================================= */

let pronto: Promise<void> | null = null;

export function garantirHistorico(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "historico_policial" (
           "efetivo_id"     TEXT NOT NULL,
           "dados"          TEXT NOT NULL DEFAULT '{}',
           "atualizado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "atualizado_por" TEXT,
           CONSTRAINT "historico_policial_pkey" PRIMARY KEY ("efetivo_id")
         )`
      );
    })().catch((e) => {
      pronto = null; // não deixa o erro grudado: a próxima chamada tenta de novo
      throw e;
    });
  }
  return pronto;
}

export type LinhaHistorico = { efetivo_id: string; dados: string; atualizado_em: Date; atualizado_por: string | null };

export async function lerHistorico(efetivoId: string): Promise<LinhaHistorico | null> {
  await garantirHistorico();
  const rows: LinhaHistorico[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "historico_policial" WHERE "efetivo_id" = $1`, efetivoId,
  );
  return rows[0] || null;
}

export async function salvarHistorico(efetivoId: string, dados: unknown, por: string): Promise<void> {
  await garantirHistorico();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "historico_policial" ("efetivo_id","dados","atualizado_em","atualizado_por")
     VALUES ($1,$2,CURRENT_TIMESTAMP,$3)
     ON CONFLICT ("efetivo_id") DO UPDATE
       SET "dados" = EXCLUDED."dados",
           "atualizado_em" = CURRENT_TIMESTAMP,
           "atualizado_por" = EXCLUDED."atualizado_por"`,
    efetivoId, JSON.stringify(dados ?? {}), por,
  );
}

/* Quem já tem histórico começado — para a tela listar sem abrir um por um. */
export async function listarHistoricos(): Promise<{ efetivoId: string; atualizadoEm: Date; atualizadoPor: string | null }[]> {
  await garantirHistorico();
  const rows: LinhaHistorico[] = await prisma.$queryRawUnsafe(
    `SELECT "efetivo_id","dados","atualizado_em","atualizado_por" FROM "historico_policial" ORDER BY "atualizado_em" DESC`,
  );
  return rows.map((r) => ({ efetivoId: r.efetivo_id, atualizadoEm: r.atualizado_em, atualizadoPor: r.atualizado_por }));
}
