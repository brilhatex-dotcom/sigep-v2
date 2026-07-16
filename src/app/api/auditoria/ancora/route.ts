import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { seloAtual, registrarAncora, lerAncoras, conferirAncora } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* /api/auditoria/ancora
   GET  -> { selo, ancoras }
   POST { acao: "registrar" }        -> registra uma âncora (selo atual)
   POST { acao: "conferir", hash }   -> confere se um selo salvo ainda existe */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  const [selo, ancoras] = await Promise.all([seloAtual(), lerAncoras()]);
  return NextResponse.json({ selo, ancoras });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");
  if (acao === "registrar") {
    const por = String((session.user as any).name || (session.user as any).login || "—");
    const item = await registrarAncora(por);
    return NextResponse.json({ ok: true, ancora: item });
  }
  if (acao === "conferir") {
    const r = await conferirAncora(String(b?.hash || ""));
    return NextResponse.json({ ok: true, ...r });
  }
  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
