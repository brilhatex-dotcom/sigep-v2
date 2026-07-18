import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aplicarPermutasNaEscala } from "@/lib/permutaPedidos";
import { chaveEscopada } from "@/lib/escalaEscopo";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-dias
   Guarda os DIAS ja gerados/editados da escala diaria (o que antes ficava
   no localStorage "sigep_escalas") na tabela Config, chave "escala_dias".
   Assim os dias salvos aparecem em todos os computadores.
   GET  -> { escalas: Record<dataISO, Escala> }
   POST -> salva { escalas } (somente admin/P1)
   ========================================================================= */

const CHAVE = "escala_dias";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    // Só na SEDE: lança na escala as permutas já autorizadas que ainda não
    // entraram. As permutas são da sede — não se aplicam à escala do interior.
    if (ctx.escopo === null) {
      try { await aplicarPermutasNaEscala(); } catch { /* nao bloqueia a escala */ }
    }

    const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
    if (!row?.valor) return NextResponse.json({ escalas: {} });
    try {
      return NextResponse.json({ escalas: JSON.parse(row.valor) });
    } catch {
      return NextResponse.json({ escalas: {} });
    }
  } catch (err) {
    console.error("[GET /api/escala-dias]", err);
    return NextResponse.json({ escalas: {} });
  }
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });

  try {
    const b = await req.json();
    if (!b || typeof b.escalas !== "object" || b.escalas === null) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
    }
    const valor = JSON.stringify(b.escalas);
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Dias gerados/editados da Escala de Servico" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-dias]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
