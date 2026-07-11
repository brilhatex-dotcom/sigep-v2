import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   POST /api/licenca-premio/editar
   body: { numeroEquipe, anoGozo, periodoInicio, periodoFim? }
   Se periodoFim nao vier, calcula automaticamente periodoInicio + 3 MESES
   (regra oficial da Licença-Prêmio: "03 (três) meses", conforme Portaria
   nº 1066/2026-DP/4 — nao sao exatamente 90 dias corridos).
   Cria a equipe se ainda nao existir (upsert) — as 4 equipes nao precisam
   estar pre-cadastradas no banco.
   ========================================================================= */

function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const data = new Date(y, m - 1 + meses, d);
  const yy = data.getFullYear();
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { numeroEquipe, anoGozo, periodoInicio, periodoFim } = await req.json();

    if (!numeroEquipe || !anoGozo || !periodoInicio) {
      return NextResponse.json({ erro: "Equipe, ano e data de início são obrigatórios." }, { status: 400 });
    }

    const reISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!reISO.test(periodoInicio)) {
      return NextResponse.json({ erro: "Data de início inválida. Use AAAA-MM-DD." }, { status: 400 });
    }

    let fim = periodoFim && String(periodoFim).trim() ? String(periodoFim).trim() : "";
    if (!fim) {
      fim = somarMeses(periodoInicio, 3);
    } else if (!reISO.test(fim)) {
      return NextResponse.json({ erro: "Data de fim inválida. Use AAAA-MM-DD." }, { status: 400 });
    }

    await prisma.equipeLicencaPremio.upsert({
      where: { numeroEquipe_anoGozo: { numeroEquipe: String(numeroEquipe), anoGozo: String(anoGozo) } },
      create: {
        numeroEquipe: String(numeroEquipe),
        anoGozo: String(anoGozo),
        periodoInicio,
        periodoFim: fim,
      },
      update: {
        periodoInicio,
        periodoFim: fim,
      },
    });

    return NextResponse.json({ ok: true, periodoFim: fim });
  } catch (e) {
    console.error("[POST /api/licenca-premio/editar]", e);
    return NextResponse.json({ erro: "Falha ao salvar." }, { status: 500 });
  }
}
