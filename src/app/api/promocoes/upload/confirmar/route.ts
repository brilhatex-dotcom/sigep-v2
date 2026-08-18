import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { chaveCertidao } from "@/lib/promocaoUpload";

export const dynamic = "force-dynamic";

/* POST /api/promocoes/upload/confirmar
   { ordem, key, nomeArquivo, tam, efetivoId? }

   Segundo passo do envio: o PDF ja subiu direto para o R2 pela URL assinada,
   aqui a gente grava a certidao no banco. */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período de promoção aberto." }, { status: 400 });
  }

  try {
    const b = await req.json().catch(() => ({}));
    const ordem = parseInt(String(b?.ordem ?? ""), 10);
    const key = String(b?.key || "");
    const nomeArquivo = String(b?.nomeArquivo || "certidao.pdf").slice(0, 200);
    const tam = Number(b?.tam);

    const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
    const efetivoId = ehAdmin && b?.efetivoId ? String(b.efetivoId) : session.user.refEfetivo;

    if (!efetivoId) {
      return NextResponse.json(
        { erro: "Seu usuário não está vinculado a uma ficha de efetivo." },
        { status: 400 }
      );
    }
    if (!ordem || ordem < 1 || ordem > TOTAL_CERTIDOES) {
      return NextResponse.json({ erro: "Certidão inválida." }, { status: 400 });
    }

    // A chave tem que ser exatamente a que este militar receberia para esta
    // certidao — ninguem aponta a propria certidao para arquivo de outro.
    if (key !== chaveCertidao(periodo.id, efetivoId, ordem)) {
      return NextResponse.json({ erro: "Arquivo não confere com o envio." }, { status: 400 });
    }

    const st = await statusP1(periodo.id, efetivoId);
    if (st?.enviadoEm) {
      return NextResponse.json(
        { erro: "Estas certidões já foram enviadas ao P/1 e estão travadas. Peça ao P/1 para reabrir antes de trocar." },
        { status: 409 }
      );
    }

    const participante = await prisma.participantePromocao.upsert({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      update: {},
      create: { periodoId: periodo.id, efetivoId },
    });

    await prisma.certidaoEnviada.upsert({
      where: { participanteId_ordem: { participanteId: participante.id, ordem } },
      update: {
        r2Key: key,
        nomeArquivo,
        tamanhoBytes: Number.isFinite(tam) && tam > 0 ? Math.round(tam) : 0,
        enviadaEm: new Date(),
      },
      create: {
        participanteId: participante.id,
        ordem,
        r2Key: key,
        nomeArquivo,
        tamanhoBytes: Number.isFinite(tam) && tam > 0 ? Math.round(tam) : 0,
      },
    });

    // se o PDF unificado ja existia, invalida (mudou uma certidao)
    if (participante.pdfUnificado) {
      await prisma.participantePromocao.update({
        where: { id: participante.id },
        data: { pdfUnificado: null, geradoEm: null },
      });
    }

    return NextResponse.json({ ok: true, ordem });
  } catch (e) {
    console.error("[POST /api/promocoes/upload/confirmar]", e);
    return NextResponse.json({ erro: "Falha ao registrar a certidão." }, { status: 500 });
  }
}
