import { prisma } from "@/lib/prisma";

/* Fonte única (server-side) do Chefe do P/1 e do Comandante do 18º BPM usados
   nas peças disciplinares. É o MESMO config da Escala de Serviço
   ("escala_chefe_p1"), então trocar o chefe/cmt lá reflete aqui automaticamente. */

const CHAVE = "escala_chefe_p1";
const PADRAO = {
  chefeP1: "1º TEN QOEM PAULO SILAS BARROS DE BRITO JUNIOR",
  comandante: "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS",
};

export async function lerChefes(): Promise<{ chefeP1: string; comandante: string }> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    if (!row?.valor) return { ...PADRAO };
    const v = JSON.parse(row.valor);
    return {
      chefeP1: typeof v.nome === "string" && v.nome.trim() ? v.nome.trim() : PADRAO.chefeP1,
      comandante: typeof v.comandante === "string" && v.comandante.trim() ? v.comandante.trim() : PADRAO.comandante,
    };
  } catch {
    return { ...PADRAO };
  }
}
