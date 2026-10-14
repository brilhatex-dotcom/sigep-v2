import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pendenciasPecunia } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* GET /api/requerimentos/premiacao/pendentes

   Os requerimentos de premiação em que ESTE policial ainda precisa fazer
   alguma coisa (informar a conta e/ou assinar). É o que alimenta o aviso que
   aparece logo depois do login (components/AvisoAoEntrar) — a mesma conta do
   sino, vinda da mesma função, para os dois nunca discordarem. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const itens = await pendenciasPecunia({ login: u.login, perfil: u.perfil, refEfetivo: u.refEfetivo });
  return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
}
