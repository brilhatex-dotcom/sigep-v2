import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  const avisos = await prisma.aviso.findMany({ orderBy: { criadoEm: "desc" } });
  return NextResponse.json(avisos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  try {
    const { texto, cor, validade } = await req.json();
    if (!texto || !String(texto).trim()) {
      return NextResponse.json({ erro: "Informe o texto." }, { status: 400 });
    }
    const aviso = await prisma.aviso.create({
      data: {
        texto: String(texto).trim(),
        cor: ["critico", "atencao", "info"].includes(cor) ? cor : "info",
        validade: validade || null,
        criadoPor: session.user.login ?? null,
      },
    });
    return NextResponse.json(aviso, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao criar." }, { status: 500 });
  }
}
