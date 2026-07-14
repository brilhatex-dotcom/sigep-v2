import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SITUACOES_PADRAO, type SituacaoItem } from "@/lib/situacoesPadrao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/situacoes
   Lista de situacoes do efetivo (nome + se conta como afastamento), salva na
   tabela Config (chave "situacoes"). Assim o admin adiciona/edita situacoes
   novas (ex.: Prisao Provisoria) e vale em todos os PCs.
   GET  -> { situacoes: SituacaoItem[] }
   POST -> salva { situacoes } (somente admin)
   ========================================================================= */

const CHAVE = "situacoes";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function normalizar(lista: any): SituacaoItem[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: SituacaoItem[] = [];
  for (const it of lista) {
    const nome = String(it?.nome ?? "").trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ nome, afastamento: it?.afastamento !== false }); // padrao: conta como afastamento
  }
  return out;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const parsed = row?.valor ? normalizar(JSON.parse(row.valor)) : [];
    return NextResponse.json({ situacoes: parsed.length ? parsed : SITUACOES_PADRAO });
  } catch {
    return NextResponse.json({ situacoes: SITUACOES_PADRAO });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o administrador" }, { status: 403 });
  }
  try {
    const b = await req.json();
    const situacoes = normalizar(b?.situacoes);
    if (situacoes.length === 0) {
      return NextResponse.json({ error: "Informe ao menos uma situacao" }, { status: 400 });
    }
    const valor = JSON.stringify(situacoes);
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Situacoes do efetivo (nome + afastamento)" },
    });
    return NextResponse.json({ ok: true, situacoes });
  } catch (err) {
    console.error("[POST /api/situacoes]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
