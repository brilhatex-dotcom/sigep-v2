import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removerDoR2 } from "@/lib/r2";
import { periodoAtivo } from "@/lib/promocoes";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { chaveCertidaoUnificada } from "@/lib/promocaoUpload";

export const dynamic = "force-dynamic";

/* POST /api/promocoes/upload/excluir
   { ordem, efetivoId? }          -> exclui a certidão daquele item
   { unificada: true, efetivoId? } -> exclui a Certidão Unificada (e os itens
                                     4 a 8 que ela preenchia)

   O arquivo sai do R2 quando nenhum item usa mais ele (os itens 4 a 8 podem
   apontar todos para a unificada). O PDF unificado que já existia deixa de
   valer, como na troca de uma certidão. Quem fica sem nenhuma certidão some
   da lista do P/1 (ela só mostra quem tem pelo menos uma). */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período de promoção aberto." }, { status: 400 });
  }

  try {
    const b = await req.json().catch(() => ({}));
    const unificada = b?.unificada === true;
    const ordem = parseInt(String(b?.ordem ?? ""), 10);

    // admin pode mexer na ficha de outro; policial só na própria
    const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
    const efetivoId = ehAdmin && b?.efetivoId ? String(b.efetivoId) : session.user.refEfetivo;
    if (!efetivoId) {
      return NextResponse.json({ erro: "Seu usuário não está vinculado a uma ficha de efetivo." }, { status: 400 });
    }
    if (!unificada && !(ordem >= 1)) {
      return NextResponse.json({ erro: "Certidão inválida." }, { status: 400 });
    }

    // mesma trava do envio: o que já foi para o P/1 não muda sem reabrir
    const st = await statusP1(periodo.id, efetivoId);
    if (st?.enviadoEm) {
      return NextResponse.json(
        { erro: "Estas certidões já foram enviadas ao P/1 e estão travadas. Peça ao P/1 para reabrir antes de excluir." },
        { status: 409 }
      );
    }

    const participante = await prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      include: { certidoes: { select: { id: true, ordem: true, r2Key: true } } },
    });
    if (!participante) return NextResponse.json({ ok: true, restantes: 0 });

    const chaveUnif = chaveCertidaoUnificada(periodo.id, efetivoId);
    const alvo = unificada
      ? participante.certidoes.filter((c) => c.r2Key === chaveUnif)
      : participante.certidoes.filter((c) => c.ordem === ordem);
    if (!alvo.length) return NextResponse.json({ erro: "Essa certidão já não está no sistema." }, { status: 404 });

    await prisma.certidaoEnviada.deleteMany({ where: { id: { in: alvo.map((c) => c.id) } } });

    // apaga do R2 o arquivo que ninguém mais usa
    const ficam = participante.certidoes.filter((c) => !alvo.some((a) => a.id === c.id));
    const chavesAlvo = Array.from(new Set(alvo.map((c) => c.r2Key)));
    for (const k of chavesAlvo) {
      if (!ficam.some((c) => c.r2Key === k)) { try { await removerDoR2(k); } catch { /* fica órfão, sem prejuízo */ } }
    }

    // o PDF unificado antigo tinha esta certidão: deixa de valer
    if (participante.pdfUnificado) {
      await prisma.participantePromocao.update({
        where: { id: participante.id },
        data: { pdfUnificado: null, geradoEm: null },
      });
      try { await removerDoR2(participante.pdfUnificado); } catch { /* idem */ }
    }

    return NextResponse.json({ ok: true, ordens: alvo.map((c) => c.ordem), restantes: ficam.length });
  } catch (e) {
    console.error("[POST /api/promocoes/upload/excluir]", e);
    return NextResponse.json({ erro: "Falha ao excluir a certidão." }, { status: 500 });
  }
}
