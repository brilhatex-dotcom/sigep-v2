import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/seguranca/alertas — alertas de segurança para o sininho (só admin).
   Hoje: contas BLOQUEADAS nas últimas 24h (derivado da auditoria login_falha).
   Formato compatível com o sino: { notificacoes: [{ id, texto, em }] }. */
function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ notificacoes: [] });
  }
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const regs = await prisma.auditoria.findMany({
      where: { acao: "login_falha", quando: { gte: desde } },
      orderBy: { quando: "desc" },
      take: 50,
    });
    const nots = regs
      .filter((r) => (r.detalhe || "").includes("BLOQUEADA"))
      .slice(0, 20)
      .map((r) => ({
        id: "bloq-" + r.id,
        texto: `🔒 Conta bloqueada: ${r.autorLogin || "—"} (${(r as any).ip || "IP ?"})`,
        em: r.quando.toISOString(),
      }));
    return NextResponse.json({ notificacoes: nots });
  } catch {
    return NextResponse.json({ notificacoes: [] });
  }
}
