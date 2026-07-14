import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/cpu-permutas — permutas da escala semanal do CPU: { [dataISO]: substituto }.
   Salva na tabela Config (chave "cpu_permutas"). Compartilhado em todos os PCs. */
const CHAVE = "cpu_permutas";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const permutas = row?.valor ? JSON.parse(row.valor) : {};
    return NextResponse.json({ permutas: permutas && typeof permutas === "object" ? permutas : {} });
  } catch {
    return NextResponse.json({ permutas: {} });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P1/admin" }, { status: 403 });
  try {
    const b = await req.json();
    const p = b?.permutas;
    if (!p || typeof p !== "object") return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
    const limpo: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) { const nome = String(v || "").trim(); if (nome) limpo[k] = nome; }
    const valor = JSON.stringify(limpo);
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Permutas da escala semanal do CPU" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/cpu-permutas]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
