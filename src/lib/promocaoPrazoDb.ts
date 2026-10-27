import { prisma } from "@/lib/prisma";
import type { StatusP1 } from "@/lib/promocaoStatusP1";
import { envioEncerrado, mensagemEncerrado, type PrazoEnvio } from "@/lib/promocaoPrazo";

/* O prazo de envio das certidões no banco (regras em lib/promocaoPrazo).
   Config.chave = "promocao_prazo_envio"
   Config.valor = JSON: { [periodoId]: { ate, definidoEm, por } } */

export const CHAVE_PRAZO = "promocao_prazo_envio";

async function lerTodos(): Promise<Record<string, PrazoEnvio>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_PRAZO } });
    const v = row?.valor ? JSON.parse(row.valor) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function prazoDoPeriodo(periodoId: string): Promise<PrazoEnvio | null> {
  const p = (await lerTodos())[periodoId];
  return p?.ate ? p : null;
}

export async function salvarPrazo(periodoId: string, ate: string | null, por: string): Promise<PrazoEnvio> {
  const todos = await lerTodos();
  const novo: PrazoEnvio = { ate, definidoEm: new Date().toISOString(), por };
  todos[periodoId] = novo;
  const valor = JSON.stringify(todos);
  await prisma.config.upsert({
    where: { chave: CHAVE_PRAZO },
    update: { valor },
    create: { chave: CHAVE_PRAZO, valor, descricao: "Prazo de envio das certidões de promoção, por período" },
  });
  return novo;
}

/* Para as rotas do policial: a mensagem de recusa, ou null se pode seguir.
   O P/1 (admin) nunca é barrado. */
export async function barradoPeloPrazo(
  periodoId: string, st: StatusP1 | null, admin: boolean,
): Promise<string | null> {
  if (admin) return null;
  const prazo = await prazoDoPeriodo(periodoId);
  return envioEncerrado(prazo, st) ? mensagemEncerrado(prazo!) : null;
}
