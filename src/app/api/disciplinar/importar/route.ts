import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { importar } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

/* POST /api/disciplinar/importar  { tipo, itens: [...] }  -> importa em lote (admin).
   Pula os que já existem com o mesmo tipo+número. */

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const tipo = String(b?.tipo || "");
    const itens = Array.isArray(b?.itens) ? b.itens : [];
    if (!tipo) return NextResponse.json({ error: "tipo obrigatorio" }, { status: 400 });
    if (itens.length === 0) return NextResponse.json({ error: "Nada para importar" }, { status: 400 });
    if (itens.length > 2000) return NextResponse.json({ error: "Limite de 2000 por vez" }, { status: 400 });
    const quem = String((session.user as any).name || (session.user as any).login || "importação");
    const r = await importar(tipo, itens, quem);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[POST /api/disciplinar/importar]", err);
    return NextResponse.json({ error: "Falha ao importar" }, { status: 500 });
  }
}
