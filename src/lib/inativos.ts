import { prisma } from "@/lib/prisma";

/* =========================================================================
   Militares INATIVOS (saíram da unidade: transferência/reforma).
   Fonte da verdade = os registros do Controle (cc_acesso). Um militar está
   INATIVO quando a sua ÚLTIMA movimentação é uma SAÍDA (sem uma CHEGADA
   posterior). Assim:
     - registrar uma Saída  -> fica inativo na hora (some dos indicadores);
     - remover essa Saída    -> volta a aparecer (reativa);
     - registrar uma Chegada -> fica ativo (voltou/novo PM).
   A ficha no efetivo NUNCA é apagada — só fica OCULTA das listas. Reversível.
   ========================================================================= */

/* Conjunto de IDs inativos. Nunca quebra: se a tabela ainda não existir,
   devolve conjunto vazio. */
export async function idsInativos(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    // garante a coluna "tipo" (tabela criada em runtime pelo Controle)
    try { await prisma.$executeRawUnsafe(`ALTER TABLE cc_acesso ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'saida'`); } catch {}
    // pega a ÚLTIMA movimentação de cada militar
    const rows: { efetivo_id: string; tipo: string }[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT ON (efetivo_id) efetivo_id, tipo
         FROM cc_acesso
        WHERE efetivo_id <> ''
        ORDER BY efetivo_id, data DESC, criado_em DESC`
    );
    for (const r of rows) if (r.tipo === "saida") set.add(r.efetivo_id);
  } catch {
    /* tabela ainda não existe -> ninguém inativo */
  }
  return set;
}

export async function estaInativo(id: string): Promise<boolean> {
  if (!id) return false;
  return (await idsInativos()).has(id);
}

/* Helper para filtrar uma lista de militares (qualquer objeto com .id). */
export function semInativos<T extends { id: string }>(lista: T[], inativos: Set<string>): T[] {
  return inativos.size ? lista.filter((m) => !inativos.has(m.id)) : lista;
}
