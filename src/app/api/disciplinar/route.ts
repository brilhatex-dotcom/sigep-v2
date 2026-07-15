import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listar, criar, atualizar, remover } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/disciplinar
   Procedimentos disciplinares (FATD, Sindicancia, IPS, IPM). Agora cada
   procedimento e UMA LINHA na tabela disciplinar_procedimento (via lib
   disciplinarDb) — dois admins nao se sobrescrevem mais. O formato das
   respostas continua igual ao anterior (a tela nao muda).
   GET ?tipo=fatd -> { itens }        POST -> cria (admin)
   PUT ?id=...    -> atualiza (admin)  DELETE ?id=... -> remove (admin)
   ========================================================================= */

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const tipo = new URL(req.url).searchParams.get("tipo") || "";
  try {
    const itens = await listar(tipo || undefined);
    return NextResponse.json({ itens });
  } catch (err) {
    console.error("[GET /api/disciplinar]", err);
    return NextResponse.json({ error: "Falha ao consultar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const quem = String((session.user as any).name || (session.user as any).login || "—");
    const reg = await criar(b, quem);
    return NextResponse.json({ ok: true, id: reg.id });
  } catch (err) {
    console.error("[POST /api/disciplinar]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    const b = await req.json();
    const ok = await atualizar(id, b);
    if (!ok) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/disciplinar]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    await remover(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/disciplinar]", err);
    return NextResponse.json({ error: "Falha ao remover" }, { status: 500 });
  }
}
