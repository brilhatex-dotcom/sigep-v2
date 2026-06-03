import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST { efetivoId, anoGozo, novaEquipe } -> troca o militar de equipe.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { efetivoId, anoGozo, novaEquipe } = await req.json();
    if (!efetivoId || !anoGozo || !novaEquipe) {
      return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });
    }

    // a equipe destino precisa existir naquele ano
    const destino = await prisma.equipeFerias.findUnique({
      where: { numeroEquipe_anoGozo: { numeroEquipe: String(novaEquipe), anoGozo: String(anoGozo) } },
    });
    if (!destino) {
      return NextResponse.json({ erro: "Equipe destino não existe nesse ano." }, { status: 400 });
    }

    const membro = await prisma.membroFerias.findFirst({
      where: { idPmma: String(efetivoId), anoGozo: String(anoGozo) },
    });
    if (!membro) {
      return NextResponse.json({ erro: "Militar não está no plano deste ano." }, { status: 404 });
    }

    await prisma.membroFerias.update({
      where: { id: membro.id },
      data: { numeroEquipe: String(novaEquipe) },
    });
    // reflete no campo EquipeFerias da ficha
    await prisma.efetivo.update({
      where: { id: String(efetivoId) },
      data: { equipeFerias: String(novaEquipe) },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha na permuta." }, { status: 500 });
  }
}
