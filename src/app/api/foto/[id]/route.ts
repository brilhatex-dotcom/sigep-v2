import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { baixarDoR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/foto/[id]
   GET -> entrega a imagem de perfil do militar [id].
          So o proprio dono ou um admin podem ver.
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function contentTypePorChave(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const efetivoId = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | undefined;

  // so dono ou admin
  if (!admin && efetivoId !== meuEfetivo) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  try {
    const ficha = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { fotoURL: true },
    });
    const key = ficha?.fotoURL || "";
    if (!key) return NextResponse.json({ error: "Sem foto" }, { status: 404 });

    // Foto guardada no banco (data URL base64) — caminho atual.
    if (key.startsWith("data:")) {
      const m = key.match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) return NextResponse.json({ error: "Sem foto" }, { status: 404 });
      const buffer = Buffer.from(m[2], "base64");
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: { "Content-Type": m[1] || "image/jpeg", "Cache-Control": "private, max-age=60" },
      });
    }

    // Legado: foto ainda no R2.
    if (key.startsWith("fotos/")) {
      const buffer = await baixarDoR2(key);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: { "Content-Type": contentTypePorChave(key), "Cache-Control": "private, max-age=300" },
      });
    }

    return NextResponse.json({ error: "Sem foto" }, { status: 404 });
  } catch (err) {
    console.error("[GET /api/foto/[id]]", err);
    return NextResponse.json({ error: "Falha ao carregar foto" }, { status: 500 });
  }
}
