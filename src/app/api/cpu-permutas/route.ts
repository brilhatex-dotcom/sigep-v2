import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/cpu-permutas — edicoes da escala semanal do CPU por dia:
   { [dataISO]: { nome?, fone?, permuta? } } (tudo editavel, sobrepoe o rodizio).
   Salva na tabela Config (chave "cpu_permutas"). Compartilhado em todos os PCs.
   Compat: valores string antigos viram { permuta }. */
const CHAVE = "cpu_permutas";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}
function normalizar(obj: any): Record<string, { nome?: string; fone?: string; permuta?: string }> {
  const out: Record<string, { nome?: string; fone?: string; permuta?: string }> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [iso, v] of Object.entries(obj)) {
    if (typeof v === "string") { const s = v.trim(); if (s) out[iso] = { permuta: s }; continue; }
    if (v && typeof v === "object") {
      const o: any = v;
      const item: { nome?: string; fone?: string; permuta?: string } = {};
      if (typeof o.nome === "string" && o.nome.trim()) item.nome = o.nome.trim();
      if (typeof o.fone === "string" && o.fone.trim()) item.fone = o.fone.trim();
      if (typeof o.permuta === "string" && o.permuta.trim()) item.permuta = o.permuta.trim();
      if (Object.keys(item).length) out[iso] = item;
    }
  }
  return out;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    return NextResponse.json({ permutas: normalizar(row?.valor ? JSON.parse(row.valor) : {}) });
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
    const valor = JSON.stringify(normalizar(b?.permutas));
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Edicoes da escala semanal do CPU" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/cpu-permutas]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
