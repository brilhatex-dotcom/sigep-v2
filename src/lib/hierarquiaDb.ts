import { prisma } from "@/lib/prisma";
import { compararAntiguidade } from "@/lib/antiguidade";

/* Põe uma lista em ORDEM DE HIERARQUIA quando ela só traz o ID do militar
   (as listas guardadas em Config: adiados, redução judicial...). A régua é a
   de lib/antiguidade, com posto, data da promoção e barra lidos da ficha.
   Quem não tem ficha vai para o fim, pelo nome; empate mantém a ordem. */
export async function emHierarquiaPorId<T>(
  lista: T[], idDe: (x: T) => string, nomeDe: (x: T) => string = () => "",
): Promise<T[]> {
  const ids = Array.from(new Set(lista.map(idDe).filter(Boolean)));
  const fichas = ids.length
    ? await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: { id: true, postoGrad: true, dataPromocao: true, numeroBarra: true, nome: true },
      })
    : [];
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const regua = (x: T) => porId.get(idDe(x)) ?? { nome: nomeDe(x) };
  return lista
    .map((x, i) => ({ x, i }))
    .sort((a, b) => compararAntiguidade(regua(a.x), regua(b.x)) || a.i - b.i)
    .map((o) => o.x);
}
