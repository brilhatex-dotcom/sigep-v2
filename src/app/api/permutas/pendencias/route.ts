import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pendenciasDe } from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

/* /api/permutas/pendencias -> { total } de permutas que exigem AÇÃO deste
   usuario (para o alerta do sininho). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ total: 0 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";
  try {
    const total = await pendenciasDe(meuId, admin);
    return NextResponse.json({ total });
  } catch {
    return NextResponse.json({ total: 0 });
  }
}
