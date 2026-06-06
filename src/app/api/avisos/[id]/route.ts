import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

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
    const { texto, cor, validade } = await req.json();
    const aviso = await prisma.aviso.update({
      where: { id: params.id },
      data: {
        texto: texto !== undefined ? String(texto).trim() : undefined,
        cor: cor !== undefined ? cor : undefined,
        validade: validade !== undefined ? validade || null : undefined,
      },
    });
    return NextResponse.json(aviso);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao atualizar." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  try {
    await prisma.aviso.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao remover." }, { status: 500 });
  }
}
