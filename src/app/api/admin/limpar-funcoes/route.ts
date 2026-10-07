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

   Antes de zerar, guarda o que estava escrito em Config
   ("funcao_backup_<data-hora>", mapa { idPmma: função }): se apagar foi
   engano, as funções podem ser recuperadas. O botão fica no Cadastro de
   Efetivo.
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
    const antes = await prisma.efetivo.findMany({
      where: { AND: [{ funcao: { not: null } }, { NOT: { funcao: "" } }] },
      select: { id: true, funcao: true },
    });
    if (antes.length) {
      const em = new Date().toISOString();
      const chave = `funcao_backup_${em.slice(0, 16).replace(/[:T]/g, "-")}`;
      const valor = JSON.stringify({ em, por: String((session.user as any).login || session.user.name || ""), funcoes: Object.fromEntries(antes.map((a) => [a.id, a.funcao])) });
      await prisma.config.upsert({
        where: { chave },
        update: { valor },
        create: { chave, valor, descricao: "Cópia das funções do efetivo antes de apagar em massa" },
        select: { chave: true },
      });
    }
    const r = await prisma.efetivo.updateMany({ where: { funcao: { not: null } }, data: { funcao: null } });
    try {
      await registrar({
        acao: "editar_ficha",
        alvo: "todos",
        alvoNome: "Efetivo (em massa)",
        detalhe: `Zerou o campo Função de ${r.count} militar(es)`,
      });
    } catch {}
    return NextResponse.json({ ok: true, atualizados: r.count, comFuncao: antes.length });
  } catch (err) {
    console.error("[POST /api/admin/limpar-funcoes]", err);
    return NextResponse.json({ error: "Falha ao limpar as funções" }, { status: 500 });
  }
}
