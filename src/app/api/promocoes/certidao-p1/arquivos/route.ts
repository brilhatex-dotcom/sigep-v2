import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo, postoDoMilitar } from "@/lib/promocoes";
import { certidoesExigidas, rotuloCertidao } from "@/lib/certidoes";
import { baixarDoR2, urlAssinada } from "@/lib/r2";
import { semRepetirArquivo } from "@/lib/promocaoUpload";

export const dynamic = "force-dynamic";

/* GET /api/promocoes/certidao-p1/arquivos?efetivoId=X
     -> { arquivos: [{ ordem, rotulo, url }] }
   As certidões das regiões que o militar já mandou pelo sistema, na ordem
   oficial e só as do posto dele (oficial inclui a do TRF6), com um link
   temporário do R2. A tela baixa direto do R2 e junta no navegador — assim o
   PDF unificado não passa pela Vercel (que corta resposta acima de ~4,5 MB)
   nem gasta a cota de tráfego do banco.

   GET ...&ordem=N  -> o próprio PDF, passando por aqui. Plano B, para quando
   o navegador não consegue buscar no R2 (CORS do bucket não configurado
   para a origem). Só o P/1. */
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
  const ordemPedida = Number(url.searchParams.get("ordem") || 0);
  if (!efetivoId) return NextResponse.json({ error: "Policial não informado." }, { status: 400 });

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const exigidas = certidoesExigidas(await postoDoMilitar(efetivoId)).map((c) => c.ordem);
    const participante = await prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      select: { certidoes: { select: { ordem: true, r2Key: true }, orderBy: { ordem: "asc" } } },
    });
    const certidoes = (participante?.certidoes ?? []).filter((c) => exigidas.includes(c.ordem));

    if (ordemPedida) {
      const c = certidoes.find((x) => x.ordem === ordemPedida);
      if (!c) return NextResponse.json({ error: "Certidão não enviada." }, { status: 404 });
      const bytes = await baixarDoR2(c.r2Key);
      return new NextResponse(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": "application/pdf" } });
    }

    // a Certidao Unificada da Justica Federal (itens 4 a 8) e um arquivo so:
    // entra uma vez, no lugar do TRF1
    const unicos = semRepetirArquivo(certidoes);
    const arquivos = await Promise.all(unicos.map(async (c) => {
      const cobre = certidoes.filter((x) => x.r2Key === c.r2Key).length;
      return {
        ordem: c.ordem,
        rotulo: cobre > 1 ? "Certidão Unificada da Justiça Federal (TRF1 a TRF5)" : rotuloCertidao(c.ordem),
        url: await urlAssinada(c.r2Key, 600),
      };
    }));
    return NextResponse.json({ arquivos });
  } catch (err) {
    console.error("[GET /api/promocoes/certidao-p1/arquivos]", err);
    return NextResponse.json({ error: "Falha ao buscar as certidões." }, { status: 500 });
  }
}
