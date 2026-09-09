import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notificacoesFerias } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* /api/ferias/notificacoes — memorandos de ferias/LP aguardando assinatura.
   A regra mora em @/lib/notificacoes, compartilhada com /api/pulso. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  return NextResponse.json({ notificacoes: await notificacoesFerias(session.user as any) });
}
