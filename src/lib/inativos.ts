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
// garante a coluna "tipo" (tabela criada em runtime pelo Controle) — uma vez
// por processo, e não a cada tela que lista o efetivo
let colunaTipo: Promise<void> | null = null;
function garantirColunaTipo(): Promise<void> {
  if (!colunaTipo) {
    colunaTipo = prisma.$executeRawUnsafe(
      `ALTER TABLE cc_acesso ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'saida'`
    ).then(() => undefined, () => { colunaTipo = null; });
  }
  return colunaTipo;
}

export async function idsInativos(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    await garantirColunaTipo();
    /* A ÚLTIMA movimentação de cada militar, já filtrada no banco: só voltam
       os que saíram (antes vinha uma linha por militar com movimentação, e a
       filtragem era feita aqui). */
    const rows: { efetivo_id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT efetivo_id FROM (
         SELECT DISTINCT ON (efetivo_id) efetivo_id, tipo
           FROM cc_acesso
          WHERE efetivo_id <> ''
          ORDER BY efetivo_id, data DESC, criado_em DESC
       ) ultima
       WHERE tipo = 'saida'`
    );
    for (const r of rows) set.add(r.efetivo_id);
  } catch {
    /* tabela ainda não existe -> ninguém inativo */
  }
  return set;
}

/* Quem saiu da unidade, com a DATA da saída (a da última movimentação, que é
   uma saída). Usado pelo plano de férias: quem sai DEPOIS que o plano foi
   publicado continua nele. */
export async function saidasComData(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    await garantirColunaTipo();
    const rows: { efetivo_id: string; data: string }[] = await prisma.$queryRawUnsafe(
      `SELECT efetivo_id, data FROM (
         SELECT DISTINCT ON (efetivo_id) efetivo_id, tipo, data
           FROM cc_acesso
          WHERE efetivo_id <> ''
          ORDER BY efetivo_id, data DESC, criado_em DESC
       ) ultima
       WHERE tipo = 'saida'`
    );
    for (const r of rows) mapa.set(r.efetivo_id, String(r.data || ""));
  } catch { /* sem a tabela: ninguém saiu */ }
  return mapa;
}

export async function estaInativo(id: string): Promise<boolean> {
  if (!id) return false;
  return (await idsInativos()).has(id);
}

/* Helper para filtrar uma lista de militares (qualquer objeto com .id). */
export function semInativos<T extends { id: string }>(lista: T[], inativos: Set<string>): T[] {
  return inativos.size ? lista.filter((m) => !inativos.has(m.id)) : lista;
}
