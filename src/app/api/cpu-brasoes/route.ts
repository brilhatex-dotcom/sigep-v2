import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/cpu-brasoes — brasoes/logomarcas da escala do CPU (clicaveis, editaveis).
   { pmma, ma, bpm } (caminho public ou data URL). Config "cpu_brasoes". */
const CHAVE = "cpu_brasoes";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    return NextResponse.json({ brasoes: row?.valor ? JSON.parse(row.valor) : null });
  } catch {
    return NextResponse.json({ brasoes: null });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P1/admin" }, { status: 403 });
  try {
    const b = await req.json();
    const br = b?.brasoes || {};
    const valor = JSON.stringify({ pmma: String(br.pmma || ""), ma: String(br.ma || ""), bpm: String(br.bpm || "") });
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Brasoes da escala do CPU" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/cpu-brasoes]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
