import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { idsInativos, semInativos } from "@/lib/inativos";
import { compararAntiguidade } from "@/lib/antiguidade";
import { conferirInclusoes, comObservacao, observacaoPara, anoDaBarra } from "@/lib/inclusaoBarra";

export const dynamic = "force-dynamic";

/* /api/efetivo/inclusao   (só o P/1)
   GET                                   -> quem está com a data de inclusão em
                                            branco (ou fora do ano da barra), com
                                            a sugestão pelos colegas da barra
   POST { acao: "aplicar", itens: [{ id, data }] } -> grava a data de inclusão
   POST { acao: "anotar", ids: [...] }            -> anota na ficha que a data
                                                     está em branco
   Ver lib/inclusaoBarra. */

async function soP1() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") return NextResponse.json({ error: "Somente o P/1." }, { status: 403 });
  return null;
}

const SELECAO = {
  id: true, postoGrad: true, nome: true, nomeGuerra: true, numeroBarra: true,
  dataPromocao: true, dataIncorp: true, observacoes: true,
} as const;

export async function GET() {
  const barrado = await soP1();
  if (barrado) return barrado;
  const [fichas, inativos] = await Promise.all([prisma.efetivo.findMany({ select: SELECAO }), idsInativos()]);
  const ativos = semInativos(fichas, inativos);
  const porId = new Map(ativos.map((f) => [f.id, f]));
  // em ordem de hierarquia, como tudo no sistema
  const itens = conferirInclusoes(ativos).sort((a, b) => compararAntiguidade(porId.get(a.id)!, porId.get(b.id)!));
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  const barrado = await soP1();
  if (barrado) return barrado;
  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");

  if (acao === "aplicar") {
    const itens: { id: string; data: string }[] = (Array.isArray(b?.itens) ? b.itens : [])
      .map((x: any) => ({ id: String(x?.id || ""), data: String(x?.data || "") }))
      .filter((x: { id: string; data: string }) => x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.data))
      .slice(0, 300);
    if (!itens.length) return NextResponse.json({ error: "Nenhuma data válida para gravar." }, { status: 400 });
    let feitos = 0;
    for (const it of itens) {
      const antes = await prisma.efetivo.findUnique({ where: { id: it.id }, select: SELECAO });
      if (!antes) continue;
      await prisma.efetivo.update({
        where: { id: it.id },
        data: { dataIncorp: it.data, ultimaAtualizacao: new Date().toISOString() },
      });
      feitos++;
      await registrar({
        acao: "efetivo_data_inclusao", alvo: it.id,
        alvoNome: [antes.postoGrad, antes.nomeGuerra || antes.nome].filter(Boolean).join(" "),
        detalhe: `Data de inclusão ${antes.dataIncorp ? `corrigida (era ${antes.dataIncorp})` : "preenchida"} para ${it.data}` +
          (anoDaBarra(antes.numeroBarra) ? ` — conferida pela barra ${antes.numeroBarra}.` : "."),
        antes: { dataIncorp: antes.dataIncorp }, depois: { dataIncorp: it.data },
      });
    }
    return NextResponse.json({ ok: true, feitos });
  }

  if (acao === "anotar") {
    const ids: string[] = (Array.isArray(b?.ids) ? b.ids : []).map((x: any) => String(x || "")).filter(Boolean).slice(0, 300);
    if (!ids.length) return NextResponse.json({ error: "Nenhum militar escolhido." }, { status: 400 });
    let feitos = 0;
    for (const id of ids) {
      const antes = await prisma.efetivo.findUnique({ where: { id }, select: SELECAO });
      if (!antes) continue;
      const texto = observacaoPara(antes.dataIncorp);
      const nova = comObservacao(antes.observacoes, texto);
      if (nova === (antes.observacoes || "").trim()) continue;
      await prisma.efetivo.update({ where: { id }, data: { observacoes: nova, ultimaAtualizacao: new Date().toISOString() } });
      feitos++;
      await registrar({
        acao: "efetivo_obs_inclusao", alvo: id,
        alvoNome: [antes.postoGrad, antes.nomeGuerra || antes.nome].filter(Boolean).join(" "),
        detalhe: `Anotou na ficha: ${texto}`,
      });
    }
    return NextResponse.json({ ok: true, feitos });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
