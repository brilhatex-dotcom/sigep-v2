import { prisma } from "@/lib/prisma";

/* Ferias em datas soltas (Config "ferias_avulsas"). Retorna o conjunto de
   ID_PMMA que estao de ferias avulsa HOJE, para somar em montarIdsEmFerias e
   refletir "Férias" na situacao (dashboard, lotacao, efetivo, organograma...). */
export async function idsFeriasAvulsasHoje(hoje: Date): Promise<Set<string>> {
  const set = new Set<string>();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    if (!Array.isArray(lista)) return set;
    for (const a of lista) {
      const ini = String(a?.inicio || ""), fim = String(a?.fim || ""), id = String(a?.idPmma || "");
      if (id && ini && fim && ini <= hojeISO && hojeISO <= fim) set.add(id);
    }
  } catch { /* ignora */ }
  return set;
}
