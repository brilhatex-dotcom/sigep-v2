import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* /api/jms/guias
   Registro das GUIAS DE ENCAMINHAMENTO MÉDICO emitidas.

   A guia tem numeracao PROPRIA e sequencial por ano (027/2026, 028/2026...).
   Ao contrario do memorando de ferias — cujo numero e derivado da posicao no
   plano — aqui o numero e GRAVADO junto com a guia no momento em que ela e
   registrada, e nunca mais recalculado: reimprimir meses depois sai com o
   mesmo numero do original protocolado, e apagar uma guia nao devolve o numero
   dela para a fila.

   O OFICIO nao passa por aqui de proposito: a numeracao dele e manual, porque
   ha outros setores alem do SIGEP emitindo oficios na mesma serie.

   GET ?ano=2026 -> { guias, proximo }    POST -> registra e devolve o numero */
const CHAVE = "jms_guias";

type Guia = {
  id: string; numero: number; ano: string;
  idPmma: string; nome: string; dataVisita: string; criadoEm: string;
};

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function ler(v?: string | null): Guia[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

async function salvar(lista: Guia[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Guias de encaminhamento medico emitidas" },
  });
}

// Proximo numero do ano = maior ja emitido + 1. Nunca reaproveita numero de
// guia apagada.
function proximoNumero(lista: Guia[], ano: string): number {
  let maior = 0;
  for (const g of lista) {
    if (g.ano === ano && typeof g.numero === "number" && g.numero > maior) maior = g.numero;
  }
  return maior + 1;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const ano = new URL(req.url).searchParams.get("ano") || String(new Date().getFullYear());
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  const doAno = lista.filter((g) => g.ano === ano).sort((a, b) => b.numero - a.numero);
  return NextResponse.json({ guias: doAno, proximo: proximoNumero(lista, ano) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    const ano = String(b?.ano || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "ano obrigatorio (AAAA)" }, { status: 400 });

    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const guia: Guia = {
      id: crypto.randomUUID(),
      numero: proximoNumero(lista, ano),
      ano,
      idPmma,
      nome: String(b?.nome || "").trim(),
      dataVisita: String(b?.dataVisita || "").trim(),
      criadoEm: new Date().toISOString().slice(0, 10),
    };
    lista.push(guia);
    await salvar(lista);
    return NextResponse.json({ ok: true, guia, proximo: proximoNumero(lista, ano) });
  } catch (err) {
    console.error("[POST /api/jms/guias]", err);
    return NextResponse.json({ error: "Falha ao registrar a guia" }, { status: 500 });
  }
}
