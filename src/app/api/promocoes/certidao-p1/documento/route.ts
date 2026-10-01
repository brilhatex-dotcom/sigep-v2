import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { gerarCertidaoP1Docx, gerarCertidaoP1Pdf, nomeArquivoDoMilitar } from "@/lib/certidaoP1";
import { lerEstado, emitidaDe } from "@/lib/certidaoP1Db";

export const dynamic = "force-dynamic";

/* GET /api/promocoes/certidao-p1/documento?efetivoId=X&formato=pdf|docx

   A certidão do P/1 daquele militar, com o número e a data com que foi
   emitida (sempre a mesma, por mais que se baixe de novo). O PDF é a peça que
   a tela junta, no navegador, com as certidões das regiões. Só o P/1. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }

  const url = new URL(req.url);
  const efetivoId = (url.searchParams.get("efetivoId") || "").trim();
  const formato = url.searchParams.get("formato") === "docx" ? "docx" : "pdf";
  if (!efetivoId) return NextResponse.json({ error: "Policial não informado." }, { status: 400 });

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const e = await lerEstado();
    const em = emitidaDe(e, periodo.id, efetivoId);
    if (!em) return NextResponse.json({ error: "Certidão ainda não emitida para este policial." }, { status: 400 });

    const f = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { id: true, nome: true, nomeGuerra: true, postoGrad: true, matricula: true, quadro: true },
    });
    if (!f) return NextResponse.json({ error: "Policial não encontrado." }, { status: 404 });

    const dados = {
      numero: em.numero,
      ano: em.ano,
      portaria: e.portaria,
      nome: f.nome || f.nomeGuerra || "",
      nomeGuerra: f.nomeGuerra,
      postoGrad: f.postoGrad,
      matricula: f.matricula,
      idPmma: f.id,
      quadro: f.quadro,
      data: em.data,
    };
    const nome = `Certidao P1 - ${nomeArquivoDoMilitar(f.postoGrad, f.nome || f.nomeGuerra || f.id)}`;

    const corpo = formato === "docx" ? await gerarCertidaoP1Docx(dados) : await gerarCertidaoP1Pdf(dados);
    const tipo = formato === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
    // nome com acento: o "filename*" (RFC 5987) leva o certo, o "filename" um sem acento
    const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
    return new NextResponse(new Uint8Array(corpo), {
      status: 200,
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `attachment; filename="${ascii}.${formato}"; filename*=UTF-8''${encodeURIComponent(nome)}.${formato}`,
      },
    });
  } catch (err) {
    console.error("[GET /api/promocoes/certidao-p1/documento]", err);
    return NextResponse.json({ error: "Falha ao gerar a certidão." }, { status: 500 });
  }
}
