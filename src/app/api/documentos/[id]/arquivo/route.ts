import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { urlAssinada } from "@/lib/r2";
import { obterDocumento } from "@/lib/documentosOficiaisDb";

export const dynamic = "force-dynamic";

// GET -> abre o PDF (link temporário do R2). O restrito, só o admin.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const doc = await obterDocumento(params.id, admin).catch(() => null);
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  return NextResponse.redirect(await urlAssinada(doc.chave, 600));
}
