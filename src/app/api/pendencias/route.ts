import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pendenciasAoEntrar } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* GET /api/pendencias

   O que espera AÇÃO deste usuário: requerimentos de premiação, permutas
   (concordo, ciência, parecer, visto), certidões de promoção para o P/1
   conferir e memorandos de férias/LP esperando a seção. Alimenta o aviso que
   aparece logo depois do login (components/AvisoAoEntrar). Vem das mesmas
   funções do sino — os dois nunca discordam sobre o que falta. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const r = await pendenciasAoEntrar({ login: u.login, perfil: u.perfil, refEfetivo: u.refEfetivo });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
