import { prisma } from "@/lib/prisma";

/* Quem já viu a apresentação de boas-vindas do SIGEP — por LOGIN, no
   servidor (e não no navegador): ela aparece uma vez por pessoa, e não de
   novo a cada celular ou computador em que o policial entrar.

   VERSAO: subir este número faz a apresentação aparecer de novo para quem
   viu uma versão anterior (ex.: o P/1 reescreveu os slides). A versão 1 ficou
   no ar poucos minutos; a 2 é o texto revisto.

   Tabela criada em runtime (o deploy não roda `db push`). */

export const VERSAO_BOAS_VINDAS = 2;

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS boas_vindas (
          login text PRIMARY KEY,
          visto_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
      // quem viu antes de existir a versão fica marcado como versão 1
      await prisma.$executeRawUnsafe(
        `ALTER TABLE boas_vindas ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1`);
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export async function jaViuBoasVindas(login: string): Promise<boolean> {
  if (!login) return true;   // sem login não há a quem mostrar
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM boas_vindas WHERE login = $1 AND versao >= $2`, login, VERSAO_BOAS_VINDAS);
    return rows.length > 0;
  } catch { return true; }   // banco piscou: melhor não mostrar do que mostrar sempre
}

export async function marcarBoasVindas(login: string): Promise<void> {
  if (!login) return;
  await garantir();
  await prisma.$executeRawUnsafe(
    `INSERT INTO boas_vindas (login, versao) VALUES ($1, $2)
     ON CONFLICT (login) DO UPDATE SET versao = EXCLUDED.versao, visto_em = CURRENT_TIMESTAMP`,
    login, VERSAO_BOAS_VINDAS);
}
