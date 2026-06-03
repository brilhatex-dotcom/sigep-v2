import { prisma } from "@/lib/prisma";

// Retorna o periodo de promocao ativo (o mais recente marcado ativo),
// ou null se nao houver nenhum aberto.
export async function periodoAtivo() {
  return prisma.periodoPromocao.findFirst({
    where: { ativo: true },
    orderBy: { criadoEm: "desc" },
  });
}

// Define o status a partir da quantidade de certidoes enviadas.
export function statusPorQtd(qtd: number, total: number): "completo" | "parcial" | "nao_iniciou" {
  if (qtd >= total) return "completo";
  if (qtd > 0) return "parcial";
  return "nao_iniciou";
}
