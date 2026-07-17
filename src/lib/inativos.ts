import { prisma } from "@/lib/prisma";

/* =========================================================================
   Militares INATIVOS (saíram da unidade: transferência/reforma).
   Guardados numa tabela própria (efetivo_inativo) — a FICHA no efetivo NÃO é
   apagada, apenas fica OCULTA de todos os indicadores. Reversível: basta
   remover daqui (reativar). Tabela criada em runtime (o deploy não roda db
   push). Uso: carregar o conjunto de IDs e filtrar as listas em memória.
   ========================================================================= */

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) pronto = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS efetivo_inativo (
        id text PRIMARY KEY,
        desde text NOT NULL DEFAULT '',
        motivo text NOT NULL DEFAULT '',
        destino text NOT NULL DEFAULT '',
        por text NOT NULL DEFAULT '',
        criado_em text NOT NULL DEFAULT ''
      )
    `);
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

/* Conjunto de IDs inativos, para filtrar as telas. Nunca quebra: se a tabela
   ainda não existir por algum motivo, devolve conjunto vazio. */
export async function idsInativos(): Promise<Set<string>> {
  try {
    await garantir();
    const rows: { id: string }[] = await prisma.$queryRawUnsafe(`SELECT id FROM efetivo_inativo`);
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set<string>();
  }
}

export async function estaInativo(id: string): Promise<boolean> {
  if (!id) return false;
  const set = await idsInativos();
  return set.has(id);
}

export async function inativar(id: string, dados: { motivo?: string; destino?: string; por?: string }): Promise<void> {
  if (!id) return;
  await garantir();
  await prisma.$executeRawUnsafe(
    `INSERT INTO efetivo_inativo (id, desde, motivo, destino, por, criado_em)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET motivo = EXCLUDED.motivo, destino = EXCLUDED.destino`,
    id,
    new Date().toISOString().slice(0, 10),
    (dados.motivo || "").trim(),
    (dados.destino || "").trim(),
    (dados.por || "").trim(),
    new Date().toISOString(),
  );
}

export async function reativar(id: string): Promise<void> {
  if (!id) return;
  await garantir();
  await prisma.$executeRawUnsafe(`DELETE FROM efetivo_inativo WHERE id = $1`, id);
}

/* Helper para filtrar uma lista de militares (qualquer objeto com .id). */
export function semInativos<T extends { id: string }>(lista: T[], inativos: Set<string>): T[] {
  return inativos.size ? lista.filter((m) => !inativos.has(m.id)) : lista;
}
