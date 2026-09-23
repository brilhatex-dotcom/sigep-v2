import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { registrar } from "@/lib/auditoria";
import { CAMPOS_PROMOCAO, lerDadosPromocao, salvarDadosPromocao } from "@/lib/dadosPromocao";

export const dynamic = "force-dynamic";

/* /api/efetivo/[id]/promocao — a seção "Dados para Promoção" da ficha.

   GET: o P/1 (e os admins) e o próprio militar — ele vê o que vai para a
        planilha da promoção dele e pode avisar o P/1 se algo estiver errado.
   PUT: só o P/1. É informação que vai assinada para a Comissão (art. 4º,
        § 2º); o militar não escreve a própria nota de CEFS. */

async function quem(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  const p1 = await podeVerP1(u.refEfetivo || null, admin);
  return { login: String(u.login || u.name || ""), p1, dono: u.refEfetivo === id };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const q = await quem(id);
  if (!q) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!q.p1 && !q.dono) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  try {
    const r = await lerDadosPromocao(id);
    return NextResponse.json({ ...r, campos: CAMPOS_PROMOCAO, podeEditar: q.p1 });
  } catch (err) {
    console.error("[GET /api/efetivo/promocao]", err);
    return NextResponse.json({ error: "Falha ao ler." }, { status: 503 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const q = await quem(id);
  if (!q) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!q.p1) return NextResponse.json({ error: "Apenas o P/1 edita os Dados para Promoção." }, { status: 403 });
  try {
    const existe = await prisma.efetivo.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: "Militar não encontrado." }, { status: 404 });
    const b = await req.json();
    const dados: Record<string, string> = {};
    for (const c of CAMPOS_PROMOCAO) if (typeof b?.dados?.[c.chave] === "string") dados[c.chave] = b.dados[c.chave];

    const antes = (await lerDadosPromocao(id)).dados;
    await salvarDadosPromocao([{ efetivoId: id, dados }], "tudo", "Editado na ficha", q.login);
    const mudou = CAMPOS_PROMOCAO
      .filter((c) => (antes[c.chave] || "") !== (dados[c.chave] || "").trim())
      .map((c) => c.rotulo);
    if (mudou.length) {
      await registrar({ acao: "ficha_dados_promocao", alvo: id, detalhe: `Dados para Promoção: ${mudou.join(", ")}.` });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/efetivo/promocao]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}
