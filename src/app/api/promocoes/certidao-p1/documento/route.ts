import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { periodoAtivo } from "@/lib/promocoes";
import { gerarCertidaoP1Docx, gerarCertidaoP1Pdf, nomeArquivoDoMilitar } from "@/lib/certidaoP1";
import { lerEstado, emitidaDe, dadosDaCertidao } from "@/lib/certidaoP1Db";
import { acessoCertidao } from "@/lib/certidaoP1Acesso";

export const dynamic = "force-dynamic";

/* GET /api/promocoes/certidao-p1/documento?efetivoId=X&formato=pdf|docx[&ver=1]

   A certidão do P/1 daquele militar, com o número, a data e os ajustes com
   que foi emitida (sempre a mesma, por mais que se baixe de novo). O PDF é a
   peça que a tela junta, no navegador, com as certidões das regiões.
   ver=1 -> abre no navegador (visualizar) em vez de baixar.

   P/1 (qualquer militar) ou o próprio oficial/subtenente (a dele). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const efetivoId = (url.searchParams.get("efetivoId") || "").trim();
  const formato = url.searchParams.get("formato") === "docx" ? "docx" : "pdf";
  const ver = url.searchParams.get("ver") === "1" && formato === "pdf";
  if (!efetivoId) return NextResponse.json({ error: "Policial não informado." }, { status: 400 });

  const acesso = await acessoCertidao(efetivoId);
  if (!acesso) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!acesso.p1 && !acesso.proprio) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

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

    const dados = dadosDaCertidao(f, em, e);
    const nome = `Certidao P1 - ${nomeArquivoDoMilitar(f.postoGrad, dados.nome || f.id)}`;

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
        "Content-Disposition": `${ver ? "inline" : "attachment"}; filename="${ascii}.${formato}"; filename*=UTF-8''${encodeURIComponent(nome)}.${formato}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/promocoes/certidao-p1/documento]", err);
    return NextResponse.json({ error: "Falha ao gerar a certidão." }, { status: 500 });
  }
}
