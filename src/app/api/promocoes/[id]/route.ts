import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

// PATCH: arquivar (ativo=false) OU tornar esta a promoção ativa (ativo=true, desativa as outras)
// body: { acao: "ativar" | "arquivar" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  const id = params.id;

  try {
    const { acao } = await req.json();

    if (acao === "ativar") {
      // torna esta a única ativa (arquiva as demais)
      await prisma.periodoPromocao.updateMany({ data: { ativo: false } });
      const p = await prisma.periodoPromocao.update({
        where: { id },
        data: { ativo: true },
      });
      return NextResponse.json(p);
    }

    if (acao === "arquivar") {
      // apenas desativa; mantém participantes e certidões (R2) intactos
      const p = await prisma.periodoPromocao.update({
        where: { id },
        data: { ativo: false },
      });
      return NextResponse.json(p);
    }

    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao atualizar período." }, { status: 400 });
  }
}
