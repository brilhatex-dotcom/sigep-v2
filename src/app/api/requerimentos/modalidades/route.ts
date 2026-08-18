import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* /api/requerimentos/modalidades
   Modalidades PERSONALIZADAS que o admin cadastra na hora, direto da tela
   "Escolha a modalidade" — sem precisar mexer em código.

   O formulario impresso e fixo (nao ha como criar um quadrinho novo no
   papel), entao toda modalidade personalizada cai no quadrinho "OUTROS",
   igual ja acontecia com armamento/material belico. O nome que o admin digita
   aqui e o mesmo que aparece entre parenteses ao lado de "OUTROS".

   GET  -> { modalidades }         qualquer usuario logado (para escolher)
   POST { nome, amparo }  -> cria  (admin)
   DELETE ?id=            -> remove (admin) */
const CHAVE = "requerimentos_modalidades_custom";

type ModalidadeCustom = { id: string; nome: string; amparo: string; criadoPor: string; criadoEm: string };

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function ler(v?: string | null): ModalidadeCustom[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

async function salvar(lista: ModalidadeCustom[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Modalidades de requerimento cadastradas pelo admin" },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  return NextResponse.json({ modalidades: lista });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const nome = String(b?.nome || "").trim().toUpperCase();
    const amparo = String(b?.amparo || "").trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome da modalidade." }, { status: 400 });

    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    if (lista.some((m) => m.nome === nome)) {
      return NextResponse.json({ error: "Já existe uma modalidade personalizada com esse nome." }, { status: 409 });
    }
    const nova: ModalidadeCustom = {
      id: crypto.randomUUID(), nome, amparo,
      criadoPor: (session.user as any).name || (session.user as any).email || "admin",
      criadoEm: new Date().toISOString().slice(0, 10),
    };
    lista.push(nova);
    await salvar(lista);
    return NextResponse.json({ ok: true, modalidade: nova });
  } catch (err) {
    console.error("[POST /api/requerimentos/modalidades]", err);
    return NextResponse.json({ error: "Falha ao salvar a modalidade" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor).filter((m) => m.id !== id);
  await salvar(lista);
  return NextResponse.json({ ok: true });
}
