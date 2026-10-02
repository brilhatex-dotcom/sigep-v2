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

   A ficha e o registro do ANO: cada viagem guarda o ano a que pertence, e o
   historico do policial vai se acumulando exercicio a exercicio.

   GET ?idPmma=&ano= -> { viagens }   GET ?resumo=1 -> fichas feitas (por ano)
   PUT { idPmma, ano, viagens } -> substitui
   apenas as viagens daquele militar NAQUELE ano (admin) */
const CHAVE = "diarias_viagens";

type Viagem = {
  id: string; idPmma: string; ano: string;
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
  const q = new URL(req.url).searchParams;
  const idPmma = q.get("idPmma") || "";
  const ano = q.get("ano") || "";

  /* ?resumo=1 -> as fichas já feitas: cada militar com viagem gravada, por
     exercício, com quantas viagens e o total de diárias. É a lista "fichas
     feitas" da aba Controle Individual. Só o P/1. */
  if (q.get("resumo") === "1") {
    if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
    const todas = ler((await prisma.config.findUnique({ where: { chave: CHAVE }, select: { valor: true } }))?.valor);
    const grupos = new Map<string, { idPmma: string; ano: string; viagens: number; total: number }>();
    for (const v of todas) {
      if (!v.idPmma || !v.ano) continue;
      const k = `${v.idPmma}|${v.ano}`;
      const g = grupos.get(k) || { idPmma: v.idPmma, ano: v.ano, viagens: 0, total: 0 };
      g.viagens++;
      const n = parseFloat(String(v.qtd || "").replace(",", "."));
      if (!isNaN(n)) g.total += n;
      grupos.set(k, g);
    }
    const ids = Array.from(new Set(Array.from(grupos.values()).map((g) => g.idPmma)));
    const fichas = ids.length
      ? await prisma.efetivo.findMany({ where: { id: { in: ids } }, select: { id: true, postoGrad: true, nome: true, nomeGuerra: true } })
      : [];
    const ficha = new Map(fichas.map((f) => [f.id, f]));
    const itens = Array.from(grupos.values()).map((g) => ({
      ...g,
      postoGrad: ficha.get(g.idPmma)?.postoGrad || "",
      nome: (ficha.get(g.idPmma)?.nomeGuerra || ficha.get(g.idPmma)?.nome || g.idPmma).trim(),
    }));
    return NextResponse.json({ itens });
  }

  if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  const doMilitar = lista.filter((v) => v.idPmma === idPmma);
  // Anos que este militar ja tem registro, para o seletor da ficha.
  const anos = Array.from(new Set(doMilitar.map((v) => v.ano).filter(Boolean))).sort().reverse();
  return NextResponse.json({
    viagens: ano ? doMilitar.filter((v) => (v.ano || "") === ano) : doMilitar,
    anos,
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    const ano = String(b?.ano || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "ano obrigatorio (AAAA)" }, { status: 400 });
    const entrada = Array.isArray(b?.viagens) ? b.viagens : [];

    const limpa: Viagem[] = entrada.map((v: any, i: number) => ({
      id: String(v?.id || `${idPmma}-${Date.now()}-${i}`),
      idPmma,
      ano,
      bgNota: String(v?.bgNota || "").trim(),
      processo: String(v?.processo || "").trim(),
      trajeto: String(v?.trajeto || "").trim(),
      periodo: String(v?.periodo || "").trim(),
      qtd: String(v?.qtd || "").trim(),
    }));

    // Troca APENAS as linhas deste militar NESTE ano; os outros anos e os
    // demais militares ficam como estao — o historico se preserva.
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const resto = lista.filter((v) => !(v.idPmma === idPmma && (v.ano || "") === ano));
    await salvar([...resto, ...limpa]);
    return NextResponse.json({ ok: true, viagens: limpa });
  } catch (err) {
    console.error("[PUT /api/diarias/viagens]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
