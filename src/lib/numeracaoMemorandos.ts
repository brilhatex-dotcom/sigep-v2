import { prisma } from "@/lib/prisma";
import { montarFila, type Fila } from "@/lib/filaMemorandos";

/* Carrega do banco os dados do ano e monta a fila unica dos memorandos de
   ferias (plano por equipes + avulsas intercaladas). A regra de ordenacao fica
   em lib/filaMemorandos; aqui so buscamos os dados. */

export const CHAVE_AVULSAS = "ferias_avulsas";

export type AvulsaBruta = {
  id: string;
  idPmma: string;
  nome: string;
  inicio: string;
  fim: string;
  obs: string;
  criadoEm?: string; // data do cadastro (ISO), que ancora a avulsa na fila
};

export type NumeracaoAno = Fila;

export function lerAvulsas(valor?: string | null): AvulsaBruta[] {
  try {
    const a = valor ? JSON.parse(valor) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export async function carregarAvulsas(): Promise<AvulsaBruta[]> {
  const row = await prisma.config.findUnique({ where: { chave: CHAVE_AVULSAS } });
  return lerAvulsas(row?.valor);
}

// Ano do plano a que a avulsa pertence = ano de INICIO das ferias. Um periodo
// que atravessa o reveillon fica na fila do ano em que comecou.
export function anoDaAvulsa(a: AvulsaBruta): string {
  return (a.inicio || "").slice(0, 4);
}

// Data que ancora a avulsa na fila: a data do cadastro, que e quando o
// memorando e gerado. Avulsas antigas, sem esse registro, usam o inicio das
// ferias.
export function ancoraDaAvulsa(a: AvulsaBruta): string {
  return a.criadoEm || a.inicio || "";
}

export async function numeracaoDoAno(ano: string): Promise<NumeracaoAno> {
  const [equipes, membros, todasAvulsas] = await Promise.all([
    prisma.equipeFerias.findMany({ where: { anoGozo: ano } }),
    prisma.membroFerias.findMany({ where: { anoGozo: ano } }),
    carregarAvulsas(),
  ]);

  const ids = Array.from(new Set(membros.map((m) => m.idPmma)));
  const fichas = ids.length
    ? await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: { id: true, postoGrad: true, nome: true },
      })
    : [];
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));

  return montarFila(
    equipes.map((e) => ({ numeroEquipe: e.numeroEquipe, periodo1Inicio: e.periodo1Inicio })),
    membros.map((m) => ({
      idPmma: m.idPmma,
      numeroEquipe: m.numeroEquipe,
      postoGrad: mapaFicha.get(m.idPmma)?.postoGrad ?? null,
      nome: mapaFicha.get(m.idPmma)?.nome ?? null,
    })),
    todasAvulsas
      .filter((a) => anoDaAvulsa(a) === ano)
      .map((a) => ({ id: a.id, ancora: ancoraDaAvulsa(a) }))
  );
}
