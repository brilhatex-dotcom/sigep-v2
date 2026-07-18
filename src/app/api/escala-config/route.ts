import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada } from "@/lib/escalaEscopo";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-config
   Guarda a configuracao do motor da escala (pools de rodizio, equipes ROTEM,
   afastamentos e datas de referencia) na tabela Config, chave "escala_cadastro".
   Assim as equipes ficam iguais em todos os computadores.
   GET  -> { cad: Cadastro | null }
   POST -> salva { cad } (somente admin/P1)
   ========================================================================= */

const CHAVE = "escala_cadastro";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
    if (!row?.valor) return NextResponse.json({ cad: null });
    try {
      return NextResponse.json({ cad: JSON.parse(row.valor) });
    } catch {
      return NextResponse.json({ cad: null });
    }
  } catch (err) {
    console.error("[GET /api/escala-config]", err);
    return NextResponse.json({ cad: null });
  }
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });

  try {
    const b = await req.json();
    if (!b || typeof b.cad !== "object" || b.cad === null) {
      return NextResponse.json({ error: "Configuracao invalida" }, { status: 400 });
    }
    const valor = JSON.stringify(b.cad);
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Equipes/afastamentos do motor da Escala de Servico" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-config]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
