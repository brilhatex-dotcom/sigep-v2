import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST { chave, tipo } -> marca o alerta como dispensado (nao volta).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  try {
    const { chave, tipo } = await req.json();
    if (!chave || !tipo) {
      return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });
    }
    await prisma.alertaDispensado.upsert({
      where: { chave: String(chave) },
      update: {},
      create: {
        chave: String(chave),
        tipo: String(tipo),
        dispensadoPor: session.user.login ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao dispensar." }, { status: 500 });
  }
}
