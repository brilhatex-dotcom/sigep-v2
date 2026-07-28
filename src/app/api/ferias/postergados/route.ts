import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/ferias/postergados
   Férias ADIADAS: militares que NÃO vão gozar as férias do plano agora.
   Marcado aqui, o militar deixa de sair de férias — ele não entra como
   ausente na escala, no organograma, no efetivo, na lotação, na antiguidade
   nem no painel "de férias hoje" — e segue no serviço normal.
   Salvo na tabela Config (chave "ferias_postergados", nome antigo mantido
   para não perder o que já foi marcado; na tela aparece "Adiado").
   Guarda tambem o EXERCICIO (ano de gozo) a que se referem as ferias que o
   militar ficou devendo — e o que alimenta o relatorio de ferias vencidas.
     GET  -> { postergados: [{ idPmma, nome, motivo, data, exercicio }] }
     POST (admin) { idPmma, nome?, motivo?, exercicio?, postergado } */
const CHAVE = "ferias_postergados";

type Postergado = { idPmma: string; nome: string; motivo: string; data: string; exercicio?: string };

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
        // Exercicio das ferias que ficaram a gozar (ano de gozo do plano).
        exercicio: String(b?.exercicio || "").trim() || String(new Date().getFullYear()),
      });
    }
    await salvar(lista);
    return NextResponse.json({ ok: true, postergado });
  } catch (err) {
    console.error("[POST /api/ferias/postergados]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
