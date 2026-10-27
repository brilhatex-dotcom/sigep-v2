import { prisma } from "@/lib/prisma";

/* =========================================================================
   A conferência de AUTENTICIDADE de cada certidão, feita pelo P/1 no site do
   tribunal (o código de validação). O sistema não consegue fazer sozinho
   (os sites usam captcha); aqui fica quem conferiu, quando e o que deu.

   A marca vale para o CÓDIGO que foi conferido: se o militar trocar a
   certidão (código novo), a marca antiga deixa de valer na tela.
   Tabela criada em runtime (o deploy não roda `db push`).
   ========================================================================= */

export type ResultadoSite = "autentica" | "nao_confere";
export type MarcaAutenticidade = { codigo: string; resultado: ResultadoSite; por: string; em: string };

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS autenticidade_certidoes (
        periodo_id text NOT NULL,
        efetivo_id text NOT NULL,
        ordem integer NOT NULL,
        codigo text NOT NULL DEFAULT '',
        resultado text NOT NULL,
        por text NOT NULL DEFAULT '',
        em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (periodo_id, efetivo_id, ordem)
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export async function lerAutenticidades(periodoId: string): Promise<Map<string, Record<number, MarcaAutenticidade>>> {
  const mapa = new Map<string, Record<number, MarcaAutenticidade>>();
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT efetivo_id, ordem, codigo, resultado, por, em FROM autenticidade_certidoes WHERE periodo_id = $1`, periodoId);
    for (const r of rows) {
      const id = String(r.efetivo_id);
      mapa.set(id, {
        ...(mapa.get(id) || {}),
        [Number(r.ordem)]: {
          codigo: String(r.codigo), resultado: r.resultado === "nao_confere" ? "nao_confere" : "autentica",
          por: String(r.por), em: new Date(r.em).toISOString(),
        },
      });
    }
  } catch (e) { console.error("[autenticidade] ler", e); }
  return mapa;
}

// resultado null = desfazer a marca
export async function marcarAutenticidade(
  periodoId: string, efetivoId: string, ordem: number, codigo: string, resultado: ResultadoSite | null, por: string,
): Promise<void> {
  await garantir();
  if (!resultado) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM autenticidade_certidoes WHERE periodo_id = $1 AND efetivo_id = $2 AND ordem = $3`, periodoId, efetivoId, ordem);
    return;
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO autenticidade_certidoes (periodo_id, efetivo_id, ordem, codigo, resultado, por)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (periodo_id, efetivo_id, ordem)
     DO UPDATE SET codigo = EXCLUDED.codigo, resultado = EXCLUDED.resultado, por = EXCLUDED.por, em = CURRENT_TIMESTAMP`,
    periodoId, efetivoId, ordem, codigo, resultado, por);
}
