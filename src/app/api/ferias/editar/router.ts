import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/ferias/editar
// body: { numeroEquipe, anoGozo, p1Inicio, p1Fim, p1Apres, p2Inicio?, p2Fim?, p2Apres? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const {
      numeroEquipe, anoGozo,
      p1Inicio, p1Fim, p1Apres,
      p2Inicio, p2Fim, p2Apres,
    } = await req.json();

    if (!numeroEquipe || !anoGozo || !p1Inicio || !p1Fim || !p1Apres) {
      return NextResponse.json({ erro: "Dados do 1º período são obrigatórios." }, { status: 400 });
    }

    // Valida que as datas são ISO válidas (YYYY-MM-DD)
    const reISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!reISO.test(p1Inicio) || !reISO.test(p1Fim) || !reISO.test(p1Apres)) {
      return NextResponse.json({ erro: "Formato de data inválido. Use AAAA-MM-DD." }, { status: 400 });
    }

    const equipe = await prisma.equipeFerias.findUnique({
      where: { numeroEquipe_anoGozo: { numeroEquipe: String(numeroEquipe), anoGozo: String(anoGozo) } },
    });
    if (!equipe) {
      return NextResponse.json({ erro: "Equipe não encontrada." }, { status: 404 });
    }

    await prisma.equipeFerias.update({
      where: { numeroEquipe_anoGozo: { numeroEquipe: String(numeroEquipe), anoGozo: String(anoGozo) } },
      data: {
        periodo1Inicio: p1Inicio,
        periodo1Fim: p1Fim,
        periodo1Apres: p1Apres,
        periodo2Inicio: p2Inicio || null,
        periodo2Fim: p2Fim || null,
        periodo2Apres: p2Apres || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao salvar." }, { status: 500 });
  }
}
