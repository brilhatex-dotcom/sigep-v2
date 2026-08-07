import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { anoDaAvulsa, numeracaoDoAno, type AvulsaBruta } from "@/lib/numeracaoMemorandos";

export const dynamic = "force-dynamic";

/* /api/ferias/avulsas
   Ferias em DATAS SOLTAS (individual), fora do plano por equipes. Salvo na
   tabela Config (chave "ferias_avulsas"). Conta como "Férias" na situacao.
   GET ?ano=2026 -> { avulsas }     POST -> cria (admin)     DELETE ?id -> remove */
const CHAVE = "ferias_avulsas";

type Avulsa = AvulsaBruta;

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function ler(v?: string | null): Avulsa[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Avulsa[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Ferias em datas soltas (individual)" },
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const ano = new URL(req.url).searchParams.get("ano") || "";
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  let saida = lista;
  if (ano) saida = saida.filter((a) => (a.inicio || "").slice(0, 4) === ano || (a.fim || "").slice(0, 4) === ano);
  saida = [...saida].sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));

  // O numero do memorando e derivado da fila do plano do ano a que a avulsa
  // pertence (ano de inicio das ferias) — nao fica gravado. Uma avulsa que
  // atravessa o reveillon aparece nas duas listagens, mas sai sempre com o
  // numero e o ano do plano em que foi numerada.
  const numeros: Record<string, number> = {};
  for (const anoPlano of new Set(saida.map(anoDaAvulsa).filter(Boolean))) {
    Object.assign(numeros, (await numeracaoDoAno(anoPlano)).avulsas);
  }

  return NextResponse.json({ avulsas: saida.map((a) => ({ ...a, numero: numeros[a.id] })) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    const inicio = String(b?.inicio || "").trim();
    const fim = String(b?.fim || "").trim();
    const reISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!idPmma || !reISO.test(inicio) || !reISO.test(fim)) {
      return NextResponse.json({ error: "Informe o militar e as datas (início e fim)." }, { status: 400 });
    }
    if (fim < inicio) return NextResponse.json({ error: "A data final deve ser após a inicial." }, { status: 400 });
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    // `criadoEm` ancora a avulsa na fila: ela entra logo depois da equipe que
    // estava de ferias nesta data. Gravado uma vez, no cadastro.
    const criadoEm = new Date().toISOString().slice(0, 10);
    lista.push({ id: crypto.randomUUID(), idPmma, nome: String(b?.nome || "").trim(), inicio, fim, obs: String(b?.obs || "").trim(), criadoEm });
    await salvar(lista);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/ferias/avulsas]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor).filter((a) => a.id !== id);
  await salvar(lista);
  return NextResponse.json({ ok: true });
}
