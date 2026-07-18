import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada } from "@/lib/escalaEscopo";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/publicacoes
   Arquivo das escalas emitidas (historico oficial do que foi publicado).
   Guarda um snapshot da escala do dia + brasoes + chefe na tabela Config
   (chave "publicacoes"), para poder rebaixar exatamente a versao publicada.
   GET            -> { publicacoes: Meta[] }  (so metadados)
   GET ?id=...    -> { publicacao: RegistroCompleto }
   POST           -> publica { dataEscala, tipo, escala, brasoes, chefe } (admin)
   DELETE ?id=... -> remove (admin)
   ========================================================================= */

const CHAVE = "publicacoes";
const LIMITE = 800; // mantem no maximo os N mais recentes

type Registro = {
  id: string; dataEscala: string; tipo: string;
  publicadoEm: string; publicadoPor: string;
  escala: any; brasoes?: any; chefe?: any;
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}
function ler(valor?: string | null): Registro[] {
  try { const a = valor ? JSON.parse(valor) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Registro[], chave: string) {
  const valor = JSON.stringify(lista.slice(0, LIMITE));
  await prisma.config.upsert({
    where: { chave },
    update: { valor },
    create: { chave, valor, descricao: "Escalas publicadas (arquivo)" },
  });
}

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
  const lista = ler(row?.valor);

  if (id) {
    const p = lista.find((r) => r.id === id);
    if (!p) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
    return NextResponse.json({ publicacao: p });
  }
  // so metadados (sem o snapshot pesado)
  const meta = lista.map(({ id, dataEscala, tipo, publicadoEm, publicadoPor }) => ({ id, dataEscala, tipo, publicadoEm, publicadoPor }));
  meta.sort((a, b) => (b.publicadoEm || "").localeCompare(a.publicadoEm || ""));
  return NextResponse.json({ publicacoes: meta });
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  const session = await getServerSession(authOptions);
  try {
    const b = await req.json();
    if (!b?.escala || !b.escala.data) {
      return NextResponse.json({ error: "Escala invalida" }, { status: 400 });
    }
    const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
    const lista = ler(row?.valor);
    const registro: Registro = {
      id: crypto.randomUUID(),
      dataEscala: String(b.escala.data),
      tipo: String(b.escala.tipo || "normal"),
      publicadoEm: new Date().toISOString(),
      publicadoPor: String((session?.user as any)?.name || (session?.user as any)?.login || "—"),
      escala: b.escala, brasoes: b.brasoes || null, chefe: b.chefe || null,
    };
    lista.unshift(registro);
    await salvar(lista, ctx.chave);
    return NextResponse.json({ ok: true, id: registro.id });
  } catch (err) {
    console.error("[POST /api/publicacoes]", err);
    return NextResponse.json({ error: "Falha ao publicar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
  const lista = ler(row?.valor).filter((r) => r.id !== id);
  await salvar(lista, ctx.chave);
  return NextResponse.json({ ok: true });
}
