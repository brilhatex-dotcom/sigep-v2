import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/chat/chamada/ice?id=<chamada>
   Troca dos "candidatos de rede" (ICE) — os caminhos que cada aparelho
   oferece para a conversa passar. Cada lado escreve na sua coluna e lê a
   do outro.
     POST { candidato }        -> acrescenta um caminho meu
     GET  ?desde=<n>           -> caminhos do OUTRO lado a partir do índice n */

const TETO = 60; // não deixa a lista crescer sem limite

function ler(v: string | null): any[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const b = await req.json();
    const cand = b?.candidato;
    if (!cand) return NextResponse.json({ ok: true });

    const c = await prisma.chatChamada.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "Chamada nao encontrada" }, { status: 404 });
    if (c.de !== eu && c.para !== eu) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

    const souDe = c.de === eu;
    const atual = ler(souDe ? c.iceDe : c.icePara);
    if (atual.length < TETO) atual.push(cand);
    await prisma.chatChamada.update({
      where: { id },
      data: souDe ? { iceDe: JSON.stringify(atual) } : { icePara: JSON.stringify(atual) },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const desde = Math.max(0, Number(url.searchParams.get("desde") || 0));
  if (!id) return NextResponse.json({ candidatos: [] });

  try {
    const c = await prisma.chatChamada.findUnique({ where: { id } });
    if (!c || (c.de !== eu && c.para !== eu)) return NextResponse.json({ candidatos: [] });
    // leio a coluna do OUTRO lado
    const doOutro = ler(c.de === eu ? c.icePara : c.iceDe);
    return NextResponse.json({ candidatos: doOutro.slice(desde), total: doOutro.length, estado: c.estado });
  } catch {
    return NextResponse.json({ candidatos: [] });
  }
}
