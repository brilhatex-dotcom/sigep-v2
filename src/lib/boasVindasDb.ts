import { prisma } from "@/lib/prisma";

/* Quem já viu a apresentação de boas-vindas do SIGEP — por LOGIN, no
   servidor (e não no navegador): ela aparece uma vez por pessoa, e não de
   novo a cada celular ou computador em que o policial entrar.

   Tabela criada em runtime (o deploy não roda `db push`). */

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS boas_vindas (
        login text PRIMARY KEY,
        visto_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export async function jaViuBoasVindas(login: string): Promise<boolean> {
  if (!login) return true;   // sem login não há a quem mostrar
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT 1 FROM boas_vindas WHERE login = $1`, login);
    return rows.length > 0;
  } catch { return true; }   // banco piscou: melhor não mostrar do que mostrar sempre
}

export async function marcarBoasVindas(login: string): Promise<void> {
  if (!login) return;
  await garantir();
  await prisma.$executeRawUnsafe(
    `INSERT INTO boas_vindas (login) VALUES ($1) ON CONFLICT (login) DO NOTHING`, login);
}
