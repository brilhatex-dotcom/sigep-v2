import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { urlAssinada } from "@/lib/r2";

export const dynamic = "force-dynamic";

/* /api/chat/anexo?key=...
   Devolve uma URL temporaria para baixar o anexo. So libera se o usuario
   logado for o remetente OU o destinatario da mensagem que carrega essa
   chave — ninguem baixa anexo de conversa alheia. */

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key obrigatoria" }, { status: 400 });

  try {
    const msg = await prisma.chatMensagem.findFirst({
      where: { arqKey: key, OR: [{ de: eu }, { para: eu }] },
      select: { id: true, arqNome: true },
    });
    if (!msg) return NextResponse.json({ error: "Anexo nao encontrado" }, { status: 404 });

    const url = await urlAssinada(key, 600);
    return NextResponse.json({ url, nome: msg.arqNome });
  } catch (err) {
    console.error("[GET /api/chat/anexo]", err);
    return NextResponse.json({ error: "Falha ao abrir o anexo" }, { status: 500 });
  }
}
