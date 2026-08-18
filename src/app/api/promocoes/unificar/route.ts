import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { baixarDoR2, enviarParaR2 } from "@/lib/r2";
import { unirPdfs } from "@/lib/pdf";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";
import { statusP1 } from "@/lib/promocaoStatusP1";

// POST: junta as 8 certidoes (ordem oficial) num PDF unico, salva no
// R2 e guarda a chave no participante.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período aberto." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
    const efetivoId =
      ehAdmin && body.efetivoId ? body.efetivoId : session.user.refEfetivo;

    if (!efetivoId) {
      return NextResponse.json(
        { erro: "Usuário sem ficha de efetivo vinculada." },
        { status: 400 }
      );
    }

    // Mesma trava do upload: lote protocolado no P/1 nao se refaz sem
    // reabertura, senao o PDF que o P/1 esta conferindo mudava por baixo.
    const st = await statusP1(periodo.id, efetivoId);
    if (st?.enviadoEm) {
      return NextResponse.json(
        { erro: "Estas certidões já foram enviadas ao P/1 e estão travadas. Peça ao P/1 para reabrir." },
        { status: 409 }
      );
    }

    const participante = await prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      include: { certidoes: { orderBy: { ordem: "asc" } } },
    });

    if (!participante || participante.certidoes.length < TOTAL_CERTIDOES) {
      return NextResponse.json(
        { erro: `Envie as ${TOTAL_CERTIDOES} certidões antes de gerar o PDF.` },
        { status: 400 }
      );
    }

    // baixa cada PDF na ordem e une
    const partes: Buffer[] = [];
    for (const c of participante.certidoes) {
      partes.push(await baixarDoR2(c.r2Key));
    }
    const unido = await unirPdfs(partes);

    const key = `promocoes/${periodo.id}/${efetivoId}/UNIFICADO.pdf`;
    await enviarParaR2(key, Buffer.from(unido), "application/pdf");

    await prisma.participantePromocao.update({
      where: { id: participante.id },
      data: { pdfUnificado: key, geradoEm: new Date() },
    });

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao gerar o PDF unificado." }, { status: 500 });
  }
}
