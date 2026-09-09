import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notificacoesChat } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* /api/chat/notificacoes — conversas com mensagem nao lida, uma linha por
   remetente. A regra mora em @/lib/notificacoes, compartilhada com /api/pulso. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  return NextResponse.json({ notificacoes: await notificacoesChat(session.user as any) });
}
