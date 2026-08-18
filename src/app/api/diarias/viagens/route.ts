import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/diarias/viagens
   Viagens da FICHA DE CONTROLE INDIVIDUAL DE DIÁRIAS, por militar.

   Diferente da Ficha de Credor — que se monta inteira a partir do cadastro do
   efetivo e por isso nao precisa ser guardada — estas linhas (BG/Nota,
   processo, trajeto, periodo, qtd) nao existem em nenhum outro lugar. Sem
   gravar, a ficha se perderia ao fechar a tela e nao haveria "controle"
   nenhum. Ficam na tabela Config, chave "diarias_viagens", no mesmo molde das
   ferias avulsas.

   GET ?idPmma=  -> { viagens }        PUT { idPmma, viagens } -> substitui (admin) */
const CHAVE = "diarias_viagens";

type Viagem = {
  id: string; idPmma: string;
  bgNota: string; processo: string; trajeto: string; periodo: string; qtd: string;
};

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function ler(v?: string | null): Viagem[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

async function salvar(lista: Viagem[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Viagens da ficha de controle individual de diarias" },
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const idPmma = new URL(req.url).searchParams.get("idPmma") || "";
  if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  return NextResponse.json({ viagens: lista.filter((v) => v.idPmma === idPmma) });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
    const entrada = Array.isArray(b?.viagens) ? b.viagens : [];

    const limpa: Viagem[] = entrada.map((v: any, i: number) => ({
      id: String(v?.id || `${idPmma}-${Date.now()}-${i}`),
      idPmma,
      bgNota: String(v?.bgNota || "").trim(),
      processo: String(v?.processo || "").trim(),
      trajeto: String(v?.trajeto || "").trim(),
      periodo: String(v?.periodo || "").trim(),
      qtd: String(v?.qtd || "").trim(),
    }));

    // Troca APENAS as linhas deste militar; as dos outros ficam como estao.
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    await salvar([...lista.filter((v) => v.idPmma !== idPmma), ...limpa]);
    return NextResponse.json({ ok: true, viagens: limpa });
  } catch (err) {
    console.error("[PUT /api/diarias/viagens]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
