import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarBackup } from "@/lib/backup";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* GET /api/backup -> baixa um backup completo (JSON) do sistema.
   Somente admin. É a cópia EXTERNA: o admin salva no e-mail/Drive/pen-drive. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const perfil = ((session?.user as any)?.perfil || "").toLowerCase();
  if (!session?.user || (perfil !== "admin" && perfil !== "gestor")) {
    return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  }
  try {
    const dump = await gerarBackup();
    try {
      await registrar({
        acao: "backup_baixado",
        alvo: "sistema",
        detalhe: `Backup manual (${Object.values(dump.contagem).reduce((a, b) => a + b, 0)} registros)`,
      });
    } catch {}
    const nome = `sigep-18bpm-backup-${dump.geradoEm.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/backup]", err);
    return NextResponse.json({ error: "Falha ao gerar backup" }, { status: 500 });
  }
}
