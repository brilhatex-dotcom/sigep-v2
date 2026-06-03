import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

// POST: cria um periodo de promocao e o torna o unico ativo.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { nome, dataAlvo } = await req.json();
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ erro: "Informe um nome." }, { status: 400 });
    }
    // desativa os anteriores e cria o novo ativo
    await prisma.periodoPromocao.updateMany({ data: { ativo: false } });
    const periodo = await prisma.periodoPromocao.create({
      data: { nome: String(nome).trim(), dataAlvo: dataAlvo || null, ativo: true },
    });
    return NextResponse.json(periodo, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao criar período." }, { status: 400 });
  }
}
