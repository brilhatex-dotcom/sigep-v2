import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { dataHoraBR, deHorarioLocal } from "@/lib/promocaoPrazo";
import { salvarPrazo } from "@/lib/promocaoPrazoDb";

export const dynamic = "force-dynamic";

/* POST /api/promocoes/prazo   (só o P/1)
   { periodoId, ate: "2026-10-26T23:59" } -> prazo de envio (horário do quartel)
   { periodoId, ate: "agora" }            -> encerra o envio neste instante
   { periodoId, ate: null }               -> tira o prazo (envio aberto)
   Chegou a hora, o sistema trava sozinho — ver lib/promocaoPrazo. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o P/1." }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const periodoId = String(b?.periodoId || "");
  const periodo = periodoId ? await prisma.periodoPromocao.findUnique({ where: { id: periodoId } }) : null;
  if (!periodo) return NextResponse.json({ erro: "Período não encontrado." }, { status: 404 });

  let ate: string | null = null;
  if (b?.ate === "agora") ate = new Date().toISOString();
  else if (b?.ate) {
    ate = deHorarioLocal(String(b.ate));
    if (!ate) return NextResponse.json({ erro: "Data e hora inválidas." }, { status: 400 });
  }

  try {
    const prazo = await salvarPrazo(periodoId, ate, session.user.name ?? "");
    await registrar({
      acao: "promocao_prazo_envio", alvo: periodoId,
      detalhe: ate
        ? `Prazo de envio das certidões (${periodo.nome}): até ${dataHoraBR(ate)}.`
        : `Tirou o prazo de envio das certidões (${periodo.nome}): envio aberto.`,
    });
    return NextResponse.json({ ok: true, prazo });
  } catch (e) {
    console.error("[POST /api/promocoes/prazo]", e);
    return NextResponse.json({ erro: "Falha ao salvar o prazo." }, { status: 500 });
  }
}
