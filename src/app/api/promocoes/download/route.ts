import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { urlAssinada } from "@/lib/r2";

// GET ?key=...  -> redireciona para uma URL temporaria do R2.
// Admin baixa qualquer um; policial so arquivos da propria ficha
// (a chave contem o efetivoId no caminho).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ erro: "Sem chave." }, { status: 400 });

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const meu = session.user.refEfetivo;

  // seguranca: a chave precisa estar dentro de "promocoes/"
  if (!key.startsWith("promocoes/")) {
    return NextResponse.json({ erro: "Chave inválida." }, { status: 400 });
  }
  // policial: a chave tem que conter o proprio efetivoId
  if (!ehAdmin && (!meu || !key.includes(`/${meu}/`))) {
    return NextResponse.json({ erro: "Sem permissão para este arquivo." }, { status: 403 });
  }

  const url = await urlAssinada(key, 600);
  return NextResponse.redirect(url);
}
