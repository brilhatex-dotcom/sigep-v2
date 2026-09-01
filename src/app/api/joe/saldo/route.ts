import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularSaldo, autorizacaoAtual, type AutorizacaoJoe } from "@/lib/joeSaldo";
import { registrar } from "@/lib/auditoria";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/joe/saldo
   Saldo da cota de JOE (Jornada Operacional Extraordinária) autorizada pelo
   CPA/I-2 por despacho — quantas vagas e quantos reais ainda dá para gastar
   no período vigente.

   GET  -> { autorizacoes: [...], saldos: [...] } — todas as autorizações já
           cadastradas, cada uma já com o saldo calculado contra os JOEs
           reais do sistema.
   POST (admin) -> cadastra uma autorização nova (o despacho que chegou).
   DELETE (admin) ?id=... -> remove uma autorização cadastrada errada.
   ========================================================================= */
const CHAVE = "joe_autorizacoes";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function ler(v?: string | null): AutorizacaoJoe[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: AutorizacaoJoe[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Cotas de JOE autorizadas por despacho do CPA/I-2 (vagas e valor por período)" },
  });
}

function hojeISO(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const autorizacoes = ler(row?.valor).sort((a, b) => b.periodoInicio.localeCompare(a.periodoInicio));

    const joesDb = await prisma.joe.findMany({ include: { inscricoes: true } });
    const joesParaSaldo = joesDb.map((j) => ({
      id: j.id,
      evento: j.evento,
      data: j.data,
      valor: j.valor || 0,
      totalAprovados: j.inscricoes.filter((i) => i.status === "aprovado").length,
    }));

    const saldos = autorizacoes.map((a) => calcularSaldo(a, joesParaSaldo));
    const atual = autorizacaoAtual(autorizacoes, hojeISO());

    return NextResponse.json({ autorizacoes, saldos, atualId: atual?.id ?? null });
  } catch (err) {
    console.error("[GET /api/joe/saldo]", err);
    return NextResponse.json({ error: "Falha ao carregar o saldo" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });

  try {
    const b = await req.json();
    const despacho = String(b?.despacho || "").trim();
    const processoSei = String(b?.processoSei || "").trim();
    const periodoInicio = String(b?.periodoInicio || "").trim();
    const periodoFim = String(b?.periodoFim || "").trim();
    const quantidade = Math.round(Number(b?.quantidade));
    const valorAutorizado = Number(b?.valorAutorizado);

    if (!despacho) return NextResponse.json({ error: "Informe o número do despacho." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodoInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(periodoFim)) {
      return NextResponse.json({ error: "Informe o início e o fim do período (AAAA-MM-DD)." }, { status: 400 });
    }
    if (periodoFim < periodoInicio) {
      return NextResponse.json({ error: "O fim do período não pode vir antes do início." }, { status: 400 });
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "Informe a quantidade de vagas autorizadas." }, { status: 400 });
    }
    if (!Number.isFinite(valorAutorizado) || valorAutorizado < 0) {
      return NextResponse.json({ error: "Informe o valor autorizado." }, { status: 400 });
    }

    const nova: AutorizacaoJoe = {
      id: crypto.randomUUID(),
      despacho, processoSei, periodoInicio, periodoFim, quantidade, valorAutorizado,
      criadoPor: (session.user as any).login || session.user.name || null,
      criadoEm: new Date().toISOString(),
    };

    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const lista = ler(row?.valor);
    lista.push(nova);
    await salvar(lista);

    try {
      await registrar({
        acao: "cadastrar_autorizacao_joe",
        alvo: nova.id,
        alvoNome: despacho,
        detalhe: `${quantidade} vaga(s) · R$ ${valorAutorizado.toFixed(2)} · ${periodoInicio} a ${periodoFim}`,
      });
    } catch {}

    return NextResponse.json({ ok: true, autorizacao: nova });
  } catch (err) {
    console.error("[POST /api/joe/saldo]", err);
    return NextResponse.json({ error: "Falha ao cadastrar a autorização" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });

  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "Informe o id." }, { status: 400 });

    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const lista = ler(row?.valor);
    const alvo = lista.find((a) => a.id === id);
    await salvar(lista.filter((a) => a.id !== id));

    if (alvo) {
      try {
        await registrar({ acao: "excluir_autorizacao_joe", alvo: id, alvoNome: alvo.despacho, detalhe: "Autorização de JOE removida" });
      } catch {}
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/joe/saldo]", err);
    return NextResponse.json({ error: "Falha ao excluir" }, { status: 500 });
  }
}
