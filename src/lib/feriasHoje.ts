import { prisma } from "@/lib/prisma";
import { hojeLocal, montarIdsEmFerias } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";

/* Quem está de FÉRIAS HOJE — juntando o plano por equipes E as férias avulsas
   (datas soltas). Usado no painel do Centro de Comando e na aba de Férias, para
   os indicadores baterem em todo lugar. Só conta quem TEM o dia de hoje dentro
   do período (por isso, se está zerado, quase sempre a data não inclui hoje). */
export type FeriasHoje = { id: string; nome: string; posto: string; origem: "equipe" | "avulsa" };

export async function militaresDeFeriasHoje(): Promise<FeriasHoje[]> {
  const hoje = hojeLocal();
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsEquipe = montarIdsEmFerias(equipes, membros, hoje);
  const idsAvulsa = await idsFeriasAvulsasHoje(hoje);
  const ids = new Set<string>([...idsEquipe, ...idsAvulsa]);
  if (ids.size === 0) return [];

  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
  });
  const mapa = new Map(fichas.map((f) => [f.id, f]));

  return [...ids]
    .map((id) => {
      const f = mapa.get(id);
      return {
        id,
        nome: (f?.nomeGuerra || f?.nome || id).trim(),
        posto: (f?.postoGrad || "").trim(),
        origem: idsAvulsa.has(id) ? ("avulsa" as const) : ("equipe" as const),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
