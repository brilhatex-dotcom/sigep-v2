import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lotacaoLimpa } from "@/lib/formatarLotacao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/lotacoes
   GET -> lista (unica, ordenada) das lotacoes que JA existem no efetivo,
          ja sem o prefixo numerico. Usada para o autocomplete no formulario.
   ========================================================================= */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ lotacoes: [] });

  try {
    const linhas = await prisma.efetivo.findMany({
      select: { lotacao: true },
      where: { lotacao: { not: null } },
    });

    const set = new Set<string>();
    for (const l of linhas) {
      const limpa = lotacaoLimpa(l.lotacao);
      if (limpa) set.add(limpa);
    }
    const lotacoes = Array.from(set).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ lotacoes });
  } catch (err) {
    console.error("[GET /api/lotacoes]", err);
    return NextResponse.json({ lotacoes: [] });
  }
}
