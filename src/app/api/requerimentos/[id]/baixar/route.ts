import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { baixarDoR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/baixar
   GET -> entrega o DOCX gerado (do R2) para download. Dono ou admin.
   ========================================================================= */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  try {
    const r = await prisma.requerimento.findUnique({
      where: { id },
      select: { efetivoId: true, docxKey: true, modalidade: true, matricula: true },
    });
    if (!r || !r.docxKey) return NextResponse.json({ error: "Documento nao gerado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    const buffer = await baixarDoR2(r.docxKey);
    const nomeArquivo = `Requerimento_${(r.modalidade || "req").replace(/[^A-Za-z0-9]+/g, "_")}_${r.matricula || ""}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/[id]/baixar]", err);
    return NextResponse.json({ error: "Falha ao baixar" }, { status: 500 });
  }
}
