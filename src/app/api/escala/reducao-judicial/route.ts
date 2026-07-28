import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/escala/reducao-judicial
   Redução de escala por DETERMINAÇÃO JUDICIAL. Cada militar tem um percentual
   MÁXIMO de serviços que pode cobrir no mês (ex.: 50 = só metade). O motor da
   escala distribui automaticamente até esse teto; o escalante ainda pode
   escalar além (com confirmação). Salvo em Config "reducao_judicial".
     GET  -> { reducoes: [{ idPmma, nome, percentual }] }
     POST (admin) { idPmma, nome?, percentual } -> define/atualiza (0/vazio remove) */
const CHAVE = "reducao_judicial";

type Reducao = { idPmma: string; nome: string; percentual: number };

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function ler(v?: string | null): Reducao[] {
  try {
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a)
      ? a.filter((x) => x && x.idPmma).map((x) => ({ idPmma: String(x.idPmma), nome: String(x.nome || ""), percentual: Number(x.percentual) || 0 }))
      : [];
  } catch { return []; }
}
async function salvar(lista: Reducao[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Reducao de escala por determinacao judicial (percentual/mes por militar)" },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  return NextResponse.json({ reducoes: lista });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "Informe o militar." }, { status: 400 });
    let pct = Math.round(Number(b?.percentual));
    if (!Number.isFinite(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));
    let lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    lista = lista.filter((r) => r.idPmma !== idPmma); // idempotente
    if (pct > 0 && pct < 100) lista.push({ idPmma, nome: String(b?.nome || "").trim(), percentual: pct });
    await salvar(lista);
    return NextResponse.json({ ok: true, percentual: pct });
  } catch (err) {
    console.error("[POST /api/escala/reducao-judicial]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
