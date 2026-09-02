import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirChatSilencioso } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/presenca — batida de presenca do usuario logado.
   O cliente chama a cada ~25 s enquanto a aba esta visivel. Quem bateu
   ponto nos ultimos 70 s aparece como ONLINE para os outros.

   POST { olhando? } — diz QUAL conversa esta aberta na tela agora. Com isso o
   servidor deixa de mandar notificacao de uma conversa que a pessoa esta
   lendo no exato momento (o balao ja aparece sozinho). */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;
  if (!login) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  let olhando: string | null = null;
  try {
    const b = await req.json();
    const v = typeof b?.olhando === "string" ? b.olhando.trim() : "";
    olhando = v || null;
  } catch { /* batida sem corpo: segue como "nenhuma conversa aberta" */ }

  try {
    await garantirChatSilencioso();
    await prisma.chatPresenca.upsert({
      where: { login },
      update: { visto: new Date(), olhando },
      create: { login, visto: new Date(), olhando },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/chat/presenca]", err);
    return NextResponse.json({ ok: false });
  }
}
