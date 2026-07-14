import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/disciplinar
   Procedimentos disciplinares (FATD, Sindicancia, IPS, IPM). Cada registro tem
   o controle (numero, encarregado/sindicante, portaria, envolvido, objeto,
   prazo, status...). Salvo na tabela Config (chave "disciplinar").
   GET ?tipo=fatd -> { itens }        POST -> cria (admin)
   PUT ?id=...    -> atualiza (admin)  DELETE ?id=... -> remove (admin)
   ========================================================================= */

const CHAVE = "disciplinar";
const TIPOS = ["fatd", "sindicancia", "ips", "ipm"];

type Registro = {
  id: string; tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
  status: string; obs: string; criadoEm: string; criadoPor: string;
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}
function ler(valor?: string | null): Registro[] {
  try { const a = valor ? JSON.parse(valor) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Registro[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Procedimentos disciplinares (FATD/Sindicancia/IPS/IPM)" },
  });
}
function normaliza(b: any, base?: Registro): Registro {
  const s = (v: any) => String(v ?? "").trim();
  return {
    id: base?.id || crypto.randomUUID(),
    tipo: TIPOS.includes(s(b.tipo)) ? s(b.tipo) : (base?.tipo || "fatd"),
    numero: s(b.numero), encarregado: s(b.encarregado), portaria: s(b.portaria),
    dataInstauracao: s(b.dataInstauracao), envolvido: s(b.envolvido), objeto: s(b.objeto),
    prazo: s(b.prazo), status: s(b.status) || "Em andamento", obs: s(b.obs),
    criadoEm: base?.criadoEm || new Date().toISOString(),
    criadoPor: base?.criadoPor || "",
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const tipo = new URL(req.url).searchParams.get("tipo") || "";
  const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
  let itens = ler(row?.valor);
  if (tipo) itens = itens.filter((r) => r.tipo === tipo);
  itens.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const reg = normaliza(b);
    reg.criadoPor = String((session.user as any).name || (session.user as any).login || "—");
    lista.unshift(reg);
    await salvar(lista);
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
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const i = lista.findIndex((r) => r.id === id);
    if (i < 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    lista[i] = normaliza({ ...b, tipo: lista[i].tipo }, lista[i]);
    await salvar(lista);
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
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor).filter((r) => r.id !== id);
  await salvar(lista);
  return NextResponse.json({ ok: true });
}
