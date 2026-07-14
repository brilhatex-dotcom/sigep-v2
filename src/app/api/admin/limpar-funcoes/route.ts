import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/admin/limpar-funcoes
   POST { confirmar: "APAGAR" } -> zera o campo Função (Efetivo.funcao) de TODO
   o efetivo, deixando em branco. Operação em massa e irreversível: exige admin
   e o token de confirmação. Depois o admin cadastra as novas funções.
   ========================================================================= */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  if (String(b?.confirmar || "") !== "APAGAR") {
    return NextResponse.json({ error: 'Confirmação necessária: envie { "confirmar": "APAGAR" }.' }, { status: 400 });
  }

  try {
    const r = await prisma.efetivo.updateMany({ data: { funcao: null } });
    try {
      await registrar({
        acao: "editar_ficha",
        alvo: "todos",
        alvoNome: "Efetivo (em massa)",
        detalhe: `Zerou o campo Função de ${r.count} militar(es)`,
      });
    } catch {}
    return NextResponse.json({ ok: true, atualizados: r.count });
  } catch (err) {
    console.error("[POST /api/admin/limpar-funcoes]", err);
    return NextResponse.json({ error: "Falha ao limpar as funções" }, { status: 500 });
  }
}
