import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";
import { salvarStatusP1, statusP1 } from "@/lib/promocaoStatusP1";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/promocoes/status-p1
   POST { acao: "enviar" }                       -> o proprio militar envia ao P/1
   POST { acao: "receber", efetivoId, periodoId } -> admin (P/1) confirma recebimento
   POST { acao: "reabrir", efetivoId, periodoId } -> admin desfaz o envio (correcao)
   ========================================================================= */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");
  const admin = ehAdmin((session.user as any).perfil);

  try {
    // ---- policial envia ao P/1 ----
    if (acao === "enviar") {
      const periodo = await periodoAtivo();
      if (!periodo) return NextResponse.json({ error: "Nenhum periodo de promocao aberto." }, { status: 400 });
      const efetivoId = (session.user as any).refEfetivo as string | null;
      if (!efetivoId) return NextResponse.json({ error: "Usuario sem ficha vinculada." }, { status: 400 });

      // exige as 8 certidoes enviadas
      const participante = await prisma.participantePromocao.findUnique({
        where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
        include: { _count: { select: { certidoes: true } } },
      });
      const enviadas = participante?._count.certidoes ?? 0;
      if (enviadas < TOTAL_CERTIDOES) {
        return NextResponse.json(
          { error: `Envie as ${TOTAL_CERTIDOES} certidoes antes de enviar ao P/1 (faltam ${TOTAL_CERTIDOES - enviadas}).` },
          { status: 400 }
        );
      }
      const novo = await salvarStatusP1(periodo.id, efetivoId, { enviadoEm: new Date().toISOString() });
      return NextResponse.json({ ok: true, status: novo });
    }

    // ---- admin (P/1) confirma recebimento ----
    if (acao === "receber" || acao === "reabrir") {
      if (!admin) return NextResponse.json({ error: "Apenas o P/1 pode confirmar." }, { status: 403 });
      const efetivoId = String(b?.efetivoId || "");
      const periodoId = String(b?.periodoId || "");
      if (!efetivoId || !periodoId) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

      if (acao === "reabrir") {
        const novo = await salvarStatusP1(periodoId, efetivoId, { enviadoEm: null, recebidoEm: null });
        return NextResponse.json({ ok: true, status: novo });
      }
      const atual = await statusP1(periodoId, efetivoId);
      if (!atual?.enviadoEm) {
        return NextResponse.json({ error: "Este militar ainda nao enviou ao P/1." }, { status: 400 });
      }
      const novo = await salvarStatusP1(periodoId, efetivoId, { recebidoEm: new Date().toISOString() });
      return NextResponse.json({ ok: true, status: novo });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/promocoes/status-p1]", err);
    return NextResponse.json({ error: "Falha ao atualizar o status." }, { status: 500 });
  }
}
