import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/ferias/postergados
   Registro (controle) dos militares que optaram por POSTERGAR / NÃO gozar as
   férias no momento. É apenas um marcador de gestão: NÃO gera afastamento e
   NÃO remove o militar de nada (escala, organograma, etc.). Salvo na tabela
   Config (chave "ferias_postergados").
     GET  -> { postergados: [{ idPmma, nome, motivo, data }] }
     POST (admin) { idPmma, nome?, motivo?, postergado } -> marca/desmarca */
const CHAVE = "ferias_postergados";

type Postergado = { idPmma: string; nome: string; motivo: string; data: string };

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function ler(v?: string | null): Postergado[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Postergado[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Militares que postergaram/nao vao gozar ferias agora (controle)" },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  return NextResponse.json({ postergados: lista });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "Informe o militar." }, { status: 400 });
    const postergado = b?.postergado !== false; // default: marcar
    let lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    lista = lista.filter((p) => p.idPmma !== idPmma); // remove entrada antiga (idempotente)
    if (postergado) {
      lista.push({
        idPmma,
        nome: String(b?.nome || "").trim(),
        motivo: String(b?.motivo || "").trim(),
        data: new Date().toISOString().slice(0, 10),
      });
    }
    await salvar(lista);
    return NextResponse.json({ ok: true, postergado });
  } catch (err) {
    console.error("[POST /api/ferias/postergados]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
