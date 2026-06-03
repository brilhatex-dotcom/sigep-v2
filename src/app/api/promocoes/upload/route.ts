import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarParaR2 } from "@/lib/r2";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";

// POST (multipart): campos -> ordem (1..8), arquivo (PDF), [efetivoId opcional p/ admin]
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período de promoção aberto." }, { status: 400 });
  }

  try {
    const form = await req.formData();
    const ordem = parseInt(String(form.get("ordem") ?? ""), 10);
    const arquivo = form.get("arquivo") as File | null;

    // admin pode enviar pela ficha de outro; policial so pela propria
    const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
    const efetivoIdReq = form.get("efetivoId") as string | null;
    const efetivoId = ehAdmin && efetivoIdReq ? efetivoIdReq : session.user.refEfetivo;

    if (!efetivoId) {
      return NextResponse.json(
        { erro: "Seu usuário não está vinculado a uma ficha de efetivo." },
        { status: 400 }
      );
    }
    if (!ordem || ordem < 1 || ordem > TOTAL_CERTIDOES) {
      return NextResponse.json({ erro: "Certidão inválida." }, { status: 400 });
    }
    if (!arquivo) {
      return NextResponse.json({ erro: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const ehPdf =
      arquivo.type === "application/pdf" ||
      arquivo.name.toLowerCase().endsWith(".pdf");
    if (!ehPdf) {
      return NextResponse.json({ erro: "Envie um arquivo PDF." }, { status: 400 });
    }

    // garante o participante
    const participante = await prisma.participantePromocao.upsert({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      update: {},
      create: { periodoId: periodo.id, efetivoId },
    });

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const key = `promocoes/${periodo.id}/${efetivoId}/certidao-${ordem}.pdf`;
    await enviarParaR2(key, buffer, "application/pdf");

    // grava/atualiza a certidao naquela posicao
    await prisma.certidaoEnviada.upsert({
      where: {
        participanteId_ordem: { participanteId: participante.id, ordem },
      },
      update: {
        r2Key: key,
        nomeArquivo: arquivo.name,
        tamanhoBytes: arquivo.size,
        enviadaEm: new Date(),
      },
      create: {
        participanteId: participante.id,
        ordem,
        r2Key: key,
        nomeArquivo: arquivo.name,
        tamanhoBytes: arquivo.size,
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
    console.error(e);
    return NextResponse.json({ erro: "Falha no envio." }, { status: 500 });
  }
}
