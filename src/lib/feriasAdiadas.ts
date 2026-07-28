import { prisma } from "@/lib/prisma";

/* =========================================================================
   Férias ADIADAS — militares que optaram por NÃO gozar as férias do plano
   agora. Ao ser marcado, o militar deixa de ficar ausente: ele NÃO entra
   como "de férias" em nenhuma tela (escala, organograma, efetivo, lotação,
   antiguidade, dashboard) e volta ao serviço normal.

   Obs.: a chave de Config continua "ferias_postergados" (nome antigo) para
   não perder o que já foi marcado; o que o usuário vê é sempre "Adiado".
   ========================================================================= */
export const CHAVE_ADIADAS = "ferias_postergados";

export async function idsFeriasAdiadas(): Promise<Set<string>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_ADIADAS } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    if (!Array.isArray(lista)) return new Set();
    return new Set(lista.map((p: any) => String(p?.idPmma || "")).filter(Boolean));
  } catch {
    return new Set();
  }
}
