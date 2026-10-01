import { prisma } from "@/lib/prisma";

// Retorna o periodo de promocao ativo (o mais recente marcado ativo),
// ou null se nao houver nenhum aberto.
export async function periodoAtivo() {
  return prisma.periodoPromocao.findFirst({
    where: { ativo: true },
    orderBy: { criadoEm: "desc" },
  });
}

// Posto/graduacao da ficha: decide quantas certidoes o militar deve (o
// oficial tem tambem a do TRF da 6ª Regiao — ver lib/certidoes).
export async function postoDoMilitar(efetivoId: string): Promise<string | null> {
  const f = await prisma.efetivo.findUnique({ where: { id: efetivoId }, select: { postoGrad: true } });
  return f?.postoGrad ?? null;
}

// Define o status a partir da quantidade de certidoes enviadas.
export function statusPorQtd(qtd: number, total: number): "completo" | "parcial" | "nao_iniciou" {
  if (qtd >= total) return "completo";
  if (qtd > 0) return "parcial";
  return "nao_iniciou";
}
