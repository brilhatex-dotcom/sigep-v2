import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obterOuAtribuirNumero } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

/* POST /api/disciplinar/numero { id, peca }  -> devolve { numero } (atribui na 1ª vez).
   peca: "instauracao" | "prorrogacao" | "escrivao". Admin. */

const PECAS = ["instauracao", "prorrogacao", "escrivao"];

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
    const id = String(b?.id || "");
    const peca = String(b?.peca || "");
    if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    if (!PECAS.includes(peca)) return NextResponse.json({ error: "peca invalida" }, { status: 400 });
    const numero = await obterOuAtribuirNumero(id, peca);
    if (!numero) return NextResponse.json({ error: "Procedimento nao encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, numero });
  } catch (err) {
    console.error("[POST /api/disciplinar/numero]", err);
    return NextResponse.json({ error: "Falha ao numerar" }, { status: 500 });
  }
}
