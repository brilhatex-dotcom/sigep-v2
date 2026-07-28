import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/chat/presenca — batida de presenca do usuario logado.
   O cliente chama a cada ~25 s enquanto a aba esta visivel. Quem bateu
   ponto nos ultimos 70 s aparece como ONLINE para os outros. */

export async function POST() {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;
  if (!login) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await prisma.chatPresenca.upsert({
      where: { login },
      update: { visto: new Date() },
      create: { login, visto: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/chat/presenca]", err);
    return NextResponse.json({ ok: false });
  }
}
