import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { alertasSeguranca } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* /api/seguranca/alertas — contas BLOQUEADAS nas ultimas 24h (so admin).
   A regra mora em @/lib/notificacoes, compartilhada com /api/pulso. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  return NextResponse.json({ notificacoes: await alertasSeguranca(session.user as any) });
}
