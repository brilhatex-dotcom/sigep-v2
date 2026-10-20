import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pendenciasAoEntrar } from "@/lib/notificacoes";
import { jaViuBoasVindas, marcarBoasVindas } from "@/lib/boasVindasDb";

export const dynamic = "force-dynamic";

/* GET /api/pendencias

   O que espera AÇÃO deste usuário: requerimentos de premiação, permutas
   (concordo, ciência, parecer, visto), certidões de promoção para o P/1
   conferir, memorandos de férias/LP esperando a seção, o "parabéns" de quem
   está no Limite Quantitativo e se falta ver a apresentação de boas-vindas. Alimenta o aviso que
   aparece logo depois do login (components/AvisoAoEntrar). Vem das mesmas
   funções do sino — os dois nunca discordam sobre o que falta. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const r = await pendenciasAoEntrar({ login: u.login, perfil: u.perfil, refEfetivo: u.refEfetivo });
  /* boasVindas: a apresentação do SIGEP ainda não foi vista por este login.
     DESLIGADA por ordem do P/1 até ele revisar o texto dos slides — quem
     ainda não viu continua sem marca de visto (jaViuBoasVindas), então ela
     aparece para todos quando for religada. */
  const BOAS_VINDAS_LIGADA = false;
  const viu = BOAS_VINDAS_LIGADA ? await jaViuBoasVindas(String(u.login || "")) : true;
  return NextResponse.json({ ...r, boasVindas: !viu }, { headers: { "Cache-Control": "no-store" } });
}

/* POST /api/pendencias  { boasVindasVista: true } — o policial fechou (ou
   terminou) a apresentação de boas-vindas: não mostra mais. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b?.boasVindasVista === true) await marcarBoasVindas(String((session.user as any).login || ""));
  return NextResponse.json({ ok: true });
}
