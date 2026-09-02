import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirChatSilencioso } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/lida
   POST { com } -> marca como lidas as mensagens que essa pessoa me mandou.

   Existe para o botão "Marcar como lida" da NOTIFICAÇÃO: dá para limpar a
   mensagem pelo próprio aviso do celular, sem precisar abrir o sistema. O
   Service Worker chama com credentials:"include", então vem com a sessão
   normal — ninguém marca conversa dos outros.

   Devolve `naoLidas` (o total que sobrou) para o Service Worker acertar a
   bolinha no ícone do app. */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const b = await req.json().catch(() => ({}));
    const com = String((b as any)?.com || "").trim();
    if (!com) return NextResponse.json({ error: "Informe a conversa" }, { status: 400 });

    await prisma.chatMensagem.updateMany({
      where: { de: com, para: eu, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    // some também o "marcar como não lida" feito à mão
    try {
      await prisma.chatConversa.updateMany({
        where: { login: eu, com, naoLida: true },
        data: { naoLida: false },
      });
    } catch { /* sem a tabela ainda: segue */ }

    const naoLidas = await prisma.chatMensagem.count({
      where: { para: eu, lidaEm: null, apagadaEm: null },
    });

    return NextResponse.json({ ok: true, naoLidas });
  } catch (err) {
    console.error("[POST /api/chat/lida]", err);
    return NextResponse.json({ error: "Falha ao marcar como lida" }, { status: 500 });
  }
}
