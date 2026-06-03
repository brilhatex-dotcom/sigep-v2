import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { periodoAtivo } from "@/lib/promocoes";

function ehAdmin(p: string | null | undefined) {
  return (p ?? "").toLowerCase() === "admin";
}

// POST: adiciona TODO o efetivo como participante do periodo ativo
// (os que ainda nao estao). Equivale ao botao "Todos Aptos".
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período aberto." }, { status: 400 });
  }

  try {
    const efetivo = await prisma.efetivo.findMany({ select: { id: true } });
    const jaTem = await prisma.participantePromocao.findMany({
      where: { periodoId: periodo.id },
      select: { efetivoId: true },
    });
    const set = new Set(jaTem.map((p) => p.efetivoId));
    const novos = efetivo
      .filter((e) => !set.has(e.id))
      .map((e) => ({ periodoId: periodo.id, efetivoId: e.id }));

    if (novos.length) {
      await prisma.participantePromocao.createMany({
        data: novos,
        skipDuplicates: true,
      });
    }
    return NextResponse.json({ adicionados: novos.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao adicionar efetivo." }, { status: 400 });
  }
}
