import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notificacoesPermutas } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* /api/permutas/notificacoes -> notificacoes de permuta que exigem ACAO deste
   usuario. A regra mora em @/lib/notificacoes, compartilhada com /api/pulso —
   assim o sino ve exatamente a mesma coisa pelos dois caminhos. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  return NextResponse.json({ notificacoes: await notificacoesPermutas(session.user as any) });
}
