import { encargoDe, lugarDoEncargo } from "@/lib/encargos";
import { ORGANOGRAMA, acharNo, pertenceAoNo, type NoOrg } from "@/lib/organograma";

/* Lugar (unidade do organograma) de um usuário a partir do encargo dele
   (Cmt/Sargenteante de CIA/DPM/Pelotão). Base para restringir o acesso à
   própria lotação: efetivo, organograma, ficha e escala do lugar.
   Retorna null quando o usuário não é comando/sargenteante de lugar. */
export type LugarUsuario = { noId: string; no: NoOrg } | null;

export async function lugarDoUsuario(refEfetivo: string | null | undefined): Promise<LugarUsuario> {
  const enc = await encargoDe(refEfetivo);
  const noId = lugarDoEncargo(enc);
  if (!noId) return null;
  const no = acharNo(noId, ORGANOGRAMA);
  return no ? { noId, no } : null;
}

// Filtra uma lista de militares para os que pertencem ao lugar do usuário.
export function filtrarPeloLugar<T extends { lotacao: string | null }>(lista: T[], lugar: LugarUsuario): T[] {
  if (!lugar) return lista;
  return lista.filter((m) => pertenceAoNo(m.lotacao, lugar.no));
}
