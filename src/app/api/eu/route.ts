import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/eu
   GET -> dados leves do usuario logado para o cabecalho:
          { efetivoId, temFoto }
   Usado pelo AppShell para montar o avatar (com foto) sem que cada
   pagina precise passar essas informacoes.
   ========================================================================= */

async function efetivoIdDaSessao(session: any): Promise<string | null> {
  const u = session?.user || {};
  if (u.refEfetivo) return String(u.refEfetivo);
  const chaves = [u.id, u.login, u.email, u.name].filter(Boolean).map(String);
  for (const k of chaves) {
    const usr = await prisma.usuario.findFirst({
      where: { OR: [{ id: k }, { login: k }, { email: k }] },
      select: { refEfetivo: true },
    });
    if (usr?.refEfetivo) return String(usr.refEfetivo);
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ efetivoId: null, temFoto: false });

  try {
    const efetivoId = await efetivoIdDaSessao(session);
    if (!efetivoId) return NextResponse.json({ efetivoId: null, temFoto: false });

    const ficha = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { fotoURL: true, postoGrad: true, nome: true, nomeGuerra: true },
    });
    const temFoto = !!(ficha?.fotoURL && (ficha.fotoURL.startsWith("config:") || ficha.fotoURL.startsWith("data:") || ficha.fotoURL.startsWith("fotos/")));

    // monta "Posto Nome de guerra" (ex: "Major Frans"); nome de guerra capitalizado
    let nomeExibicao = "";
    if (ficha) {
      const posto = (ficha.postoGrad || "").trim();
      const guerra = (ficha.nomeGuerra || ficha.nome || "").trim();
      const cap = guerra
        ? guerra.toLowerCase().split(/\s+/).map((p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : "")).join(" ")
        : "";
      nomeExibicao = [posto, cap].filter(Boolean).join(" ").trim();
    }

    return NextResponse.json({ efetivoId, temFoto, nomeExibicao });
  } catch (err) {
    console.error("[GET /api/eu]", err);
    return NextResponse.json({ efetivoId: null, temFoto: false });
  }
}
