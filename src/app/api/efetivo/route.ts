// ==========================================================
//  /api/efetivo  — Fase 3
//  Padrao para os demais modulos. Substitui o doGet/doPost.
// ==========================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }

  const efetivo = await prisma.efetivo.findMany({
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(efetivo);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }
  // TODO (Fase 4): restringir por perfil quando mapearmos os
  // valores reais do campo Perfil (admin / comandante / etc.).

  try {
    const dados = await req.json();
    const novo = await prisma.efetivo.create({ data: dados });
    return NextResponse.json(novo, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { erro: "Nao foi possivel cadastrar" },
      { status: 400 }
    );
  }
}
