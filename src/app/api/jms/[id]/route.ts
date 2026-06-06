import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

// PUT { jmsDataInicio?, jmsDataRetorno?, jmsMotivo?, situacao? }
// Edicao rapida do JMS de um militar (pelo id do efetivo).
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const efetivo = await prisma.efetivo.update({
      where: { id: params.id },
      data: {
        jmsDataInicio: body.jmsDataInicio !== undefined ? body.jmsDataInicio : undefined,
        jmsDataRetorno: body.jmsDataRetorno !== undefined ? body.jmsDataRetorno : undefined,
        jmsMotivo: body.jmsMotivo !== undefined ? body.jmsMotivo : undefined,
        situacao: body.situacao !== undefined ? body.situacao : undefined,
      },
    });
    return NextResponse.json({ ok: true, id: efetivo.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao atualizar JMS." }, { status: 500 });
  }
}
