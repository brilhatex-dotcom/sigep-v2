import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import {
  TIPO_ASSINATURA, criarPecunia, salvarPecunia, lerPecunia, listarPecunia,
  apagarPecunia, podeVer, refAssinatura, type RequerimentoPecunia,
} from "@/lib/requerimentoPecunia";
import { assinaturasDoConjunto, apagarAssinaturasDoConjunto, refsAssinadas } from "@/lib/assinaturaSigep";

export const dynamic = "force-dynamic";

/* =========================================================================
   Requerimentos de premiação pecuniária guardados: criar, reabrir, salvar.

   A assinatura fica na rota /assinar, ao lado. Aqui trata-se do documento em
   si — e da única regra que a assinatura impõe de volta ao documento:
   requerimento COM assinatura não se edita. Ou se reabre (o que derruba as
   assinaturas, à vista de todos), ou se deixa como está.
   ========================================================================= */

const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

type Quem = { login: string; nome: string; efetivoId: string | null; admin: boolean };

async function quemEh(): Promise<Quem | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  return {
    login: String(u.login || ""),
    nome: String(u.name || "").trim(),
    efetivoId: (u.refEfetivo || null) as string | null,
    admin: ehAdmin(u.perfil),
  };
}

// Só quem montou (ou o P/1) mexe no documento; os demais assinam e leem.
const podeMexer = (r: RequerimentoPecunia, q: Quem) => q.admin || (!!q.login && r.criadoPor === q.login);

/* As assinaturas como a folha precisa delas: por policial, sem o hash. */
async function assinaturasDe(id: string) {
  const arr = await assinaturasDoConjunto(TIPO_ASSINATURA, id);
  return arr.map((a) => ({
    efetivoId: String(a.ref).slice(id.length + 1),
    id: a.id, token: a.token, nome: a.nome, cargo: a.cargo, em: a.em,
  }));
}

export async function GET(req: Request) {
  const q = await quemEh();
  if (!q) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") || "";

  try {
    if (id) {
      const r = await lerPecunia(id);
      if (!r) return NextResponse.json({ error: "Requerimento não encontrado." }, { status: 404 });
      if (!podeVer(r, q.login, q.efetivoId, q.admin)) {
        return NextResponse.json({ error: "Este requerimento não é seu." }, { status: 403 });
      }
      const assinaturas = await assinaturasDe(id);
      return NextResponse.json({
        requerimento: r,
        assinaturas,
        podeMexer: podeMexer(r, q),
      });
    }

    const todos = await listarPecunia();
    const meus = todos.filter((r) => podeVer(r, q.login, q.efetivoId, q.admin));

    /* O policial abre esta lista para saber se falta ele assinar — então a
       resposta já traz isso pronto, numa consulta só. */
    const assinei = q.efetivoId
      ? await refsAssinadas(TIPO_ASSINATURA, meus.map((r) => refAssinatura(r.id, q.efetivoId!)))
      : new Set<string>();

    return NextResponse.json({
      itens: meus.map((r) => ({
        id: r.id,
        criadoEm: r.criadoEm,
        criadoPorNome: r.criadoPorNome,
        quantidade: r.dados.linhas.length,
        nomes: r.dados.linhas.map((l) => l.nome).filter(Boolean).slice(0, 4),
        souDele: !!q.efetivoId && r.dados.linhas.some((l) => l.efetivoId === q.efetivoId),
        jaAssinei: !!q.efetivoId && assinei.has(refAssinatura(r.id, q.efetivoId)),
      })),
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/premiacao]", err);
    return NextResponse.json({ error: "Falha ao ler os requerimentos." }, { status: 503 });
  }
}

/* POST — criar (sem id), salvar (com id) ou reabrir (acao:"reabrir"). */
export async function POST(req: Request) {
  const q = await quemEh();
  if (!q) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const b = await req.json();
    const id = String(b?.id || "").trim();
    const acao = String(b?.acao || "");

    if (!id) {
      const dados = b?.dados;
      if (!Array.isArray(dados?.linhas) || !dados.linhas.length) {
        return NextResponse.json({ error: "Acrescente ao menos um policial antes de guardar." }, { status: 400 });
      }
      const novo = await criarPecunia(dados, q.login, q.nome);
      await registrar({
        acao: "requerimento_pecunia_criar", alvo: novo.id,
        detalhe: `Criou o requerimento de premiação pecuniária ${novo.id} com ${novo.dados.linhas.length} policial(is).`,
      });
      return NextResponse.json({ ok: true, requerimento: novo, assinaturas: [], podeMexer: true });
    }

    const r = await lerPecunia(id);
    if (!r) return NextResponse.json({ error: "Requerimento não encontrado." }, { status: 404 });
    if (!podeMexer(r, q)) {
      return NextResponse.json({ error: "Só quem montou o requerimento (ou o P/1) pode alterá-lo." }, { status: 403 });
    }

    const assinadas = await assinaturasDoConjunto(TIPO_ASSINATURA, id);

    if (acao === "reabrir") {
      const n = await apagarAssinaturasDoConjunto(TIPO_ASSINATURA, id);
      await registrar({
        acao: "requerimento_pecunia_reabrir", alvo: id,
        detalhe: `Reabriu o requerimento ${id} para edição, cancelando ${n} assinatura(s).`,
      });
      return NextResponse.json({ ok: true, requerimento: r, assinaturas: [], podeMexer: true, canceladas: n });
    }

    /* Editar um documento já assinado quebraria o lacre de quem assinou, sem
       que ninguém percebesse até a conferência. Melhor barrar e dizer de quem
       são as assinaturas — reabrir é uma decisão, não um efeito colateral. */
    if (assinadas.length) {
      return NextResponse.json({
        error: "Este requerimento já tem assinatura. Reabra para editar — as assinaturas atuais serão canceladas.",
        assinantes: assinadas.map((a) => a.nome).filter(Boolean),
      }, { status: 409 });
    }

    const ok = await salvarPecunia(id, b?.dados);
    if (!ok) return NextResponse.json({ error: "Requerimento não encontrado." }, { status: 404 });
    const atual = await lerPecunia(id);
    return NextResponse.json({ ok: true, requerimento: atual, assinaturas: [], podeMexer: true });
  } catch (err) {
    console.error("[POST /api/requerimentos/premiacao]", err);
    return NextResponse.json({ error: "Falha ao guardar o requerimento." }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const q = await quemEh();
  if (!q) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Sem id." }, { status: 400 });

  try {
    const r = await lerPecunia(id);
    if (!r) return NextResponse.json({ ok: true });
    if (!podeMexer(r, q)) {
      return NextResponse.json({ error: "Só quem montou o requerimento (ou o P/1) pode apagá-lo." }, { status: 403 });
    }
    await apagarAssinaturasDoConjunto(TIPO_ASSINATURA, id);
    await apagarPecunia(id);
    await registrar({
      acao: "requerimento_pecunia_apagar", alvo: id,
      detalhe: `Apagou o requerimento de premiação pecuniária ${id}.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/requerimentos/premiacao]", err);
    return NextResponse.json({ error: "Falha ao apagar o requerimento." }, { status: 503 });
  }
}
