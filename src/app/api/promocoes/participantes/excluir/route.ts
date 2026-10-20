import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { removerDoR2 } from "@/lib/r2";
import { apagarStatusP1 } from "@/lib/promocaoStatusP1";

export const dynamic = "force-dynamic";

/* POST /api/promocoes/participantes/excluir  { efetivoId }

   O P/1 tira um militar do período de promoção ativo — o caso é o TESTE
   (alguém enviou certidões só para experimentar) ou um envio feito por
   engano. Sai tudo do período: as certidões (e os arquivos no R2), o PDF
   unificado e o "enviado/recebido" do P/1. A ficha do militar e os Dados
   para Promoção não são tocados. Se ele precisar concorrer, envia de novo. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const b = await req.json().catch(() => ({}));
    const efetivoId = String(b?.efetivoId || "").trim();
    if (!efetivoId) return NextResponse.json({ error: "Sem o militar." }, { status: 400 });

    const p = await prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      include: { certidoes: { select: { r2Key: true } } },
    });
    if (p) {
      // arquivos primeiro; se algum falhar fica órfão no R2, sem prejuízo
      const chaves = new Set<string>(p.certidoes.map((c) => c.r2Key));
      if (p.pdfUnificado) chaves.add(p.pdfUnificado);
      for (const k of chaves) { try { await removerDoR2(k); } catch { /* órfão */ } }
      await prisma.participantePromocao.delete({ where: { id: p.id } });   // as certidões vão junto (cascade)
    }
    await apagarStatusP1(periodo.id, efetivoId);

    const m = await prisma.efetivo.findUnique({ where: { id: efetivoId }, select: { postoGrad: true, nomeGuerra: true, nome: true } });
    await registrar({
      acao: "promocao_participante_excluir", alvo: efetivoId,
      detalhe: `Excluiu ${[m?.postoGrad, m?.nomeGuerra || m?.nome].filter(Boolean).join(" ") || efetivoId} do período ${periodo.nome} (${p?.certidoes.length || 0} certidão(ões) apagada(s)).`,
    });
    return NextResponse.json({ ok: true, certidoes: p?.certidoes.length || 0 });
  } catch (err) {
    console.error("[POST /api/promocoes/participantes/excluir]", err);
    return NextResponse.json({ error: "Falha ao excluir." }, { status: 503 });
  }
}
