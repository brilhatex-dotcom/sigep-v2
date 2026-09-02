import { prisma } from "@/lib/prisma";

/* =========================================================================
   COLUNAS NOVAS DO CHAT, CRIADAS EM RUNTIME

   O deploy não roda `db push` (ver README), então uma coluna nova no
   schema.prisma quebraria o chat em produção até alguém rodar na mão — e o
   Prisma seleciona TODAS as colunas declaradas, ou seja, a conversa inteira
   pararia de abrir. Para não depender disso, as colunas são criadas aqui, na
   primeira vez que uma rota do chat roda, com ADD COLUMN IF NOT EXISTS.

   É o mesmo caminho que permuta/disciplinar já usam. Roda uma vez por
   processo (a Promise fica guardada) e é seguro repetir.
   ========================================================================= */

let pronto: Promise<void> | null = null;

export function garantirChat(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      // Responder citando: guarda o id da mensagem citada.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "RespondeA" TEXT`
      );
      // Editada: quando foi editada pela última vez (nulo = nunca).
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "EditadaEm" TIMESTAMP(3)`
      );
      // Apagada para todos: a linha continua (para a conversa não "pular"),
      // mas o conteúdo deixa de ser entregue.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "ApagadaEm" TIMESTAMP(3)`
      );
      // Encaminhada: mostra a marca "Encaminhada" no balão, como no WhatsApp.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "Encaminhada" BOOLEAN NOT NULL DEFAULT false`
      );
      // Reações: JSON { login: emoji }. No 1-a-1 são no máximo duas.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "Reacoes" TEXT`
      );
      /* Como cada um organiza a conversa: fixada no topo, arquivada, marcada
         como não lida à mão e silenciada. Uma linha por (eu, outra pessoa). */
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "chat_conversa" (
           "Login"         TEXT NOT NULL,
           "Com"           TEXT NOT NULL,
           "Fixada"        BOOLEAN NOT NULL DEFAULT false,
           "Arquivada"     BOOLEAN NOT NULL DEFAULT false,
           "NaoLida"       BOOLEAN NOT NULL DEFAULT false,
           "SilenciadaAte" TIMESTAMP(3),
           CONSTRAINT "chat_conversa_pkey" PRIMARY KEY ("Login", "Com")
         )`
      );
    })().catch((e) => {
      // Se falhar (ex.: tabela ainda não existe), não trava o chat: a próxima
      // chamada tenta de novo em vez de ficar com um erro grudado.
      pronto = null;
      throw e;
    });
  }
  return pronto;
}

/* Igual ao acima, mas nunca lança: as rotas do chat já sabem se virar quando o
   banco não está pronto (a tela mostra "chat não ativado"). */
export async function garantirChatSilencioso(): Promise<void> {
  try {
    await garantirChat();
  } catch {
    /* segue sem as colunas novas — o chat básico continua funcionando */
  }
}
