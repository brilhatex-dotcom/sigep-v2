import { prisma } from "@/lib/prisma";

/* =========================================================================
   HISTÓRICO DAS PROMOÇÕES LANÇADAS PELO LISTÃO — TABELA CRIADA EM RUNTIME

   O deploy não roda `db push` (ver README), então uma tabela nova declarada
   só no schema.prisma não existiria em produção e a tela quebraria inteira.
   Como já é feito no chat e na permuta, a tabela é criada aqui, na primeira
   vez que a rota roda, com CREATE TABLE IF NOT EXISTS.

   Guardar o histórico não é enfeite: é o que permite DESFAZER um lote inteiro
   quando o P/1 perceber que promoveu alguém por engano — sem ele, o posto
   anterior estaria perdido.
   ========================================================================= */

let pronto: Promise<void> | null = null;

export function garantirPromocoes(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "promocoes_lancadas" (
           "id"                     TEXT NOT NULL,
           "Lote"                   TEXT NOT NULL,
           "Efetivo_ID"             TEXT NOT NULL,
           "Nome"                   TEXT,
           "Posto_Anterior"         TEXT,
           "Posto_Novo"             TEXT,
           "Data_Promocao_Anterior" TEXT,
           "Data_Promocao"          TEXT,
           "Referencia"             TEXT,
           "Criterio"               TEXT,
           "Ord_Listao"             INTEGER,
           "Aplicado_Por"           TEXT,
           "Aplicado_Em"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "Desfeito_Em"            TIMESTAMP(3),
           "Desfeito_Por"           TEXT,
           CONSTRAINT "promocoes_lancadas_pkey" PRIMARY KEY ("id")
         )`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "promocoes_lancadas_lote_idx" ON "promocoes_lancadas" ("Lote")`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "promocoes_lancadas_efetivo_idx" ON "promocoes_lancadas" ("Efetivo_ID")`
      );
    })().catch((e) => {
      // não deixa o erro grudado: a próxima chamada tenta de novo
      pronto = null;
      throw e;
    });
  }
  return pronto;
}
