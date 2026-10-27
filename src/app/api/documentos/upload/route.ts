import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { urlAssinadaUpload } from "@/lib/r2";

export const dynamic = "force-dynamic";

// um BG inteiro escaneado passa fácil de 20 MB
const LIMITE_BYTES = 60 * 1024 * 1024;

/* POST { tamanho } -> { chave, url }: o navegador sobe o PDF DIRETO ao R2
   (a Vercel corta requisição acima de ~4,5 MB). Depois, POST /api/documentos
   com a chave registra o documento. Só o admin. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const tamanho = Number(b?.tamanho) || 0;
  if (tamanho > LIMITE_BYTES) {
    return NextResponse.json({ error: "Arquivo grande demais (máximo 60 MB)." }, { status: 400 });
  }
  const chave = `documentos/${crypto.randomUUID()}.pdf`;
  try {
    return NextResponse.json({ chave, url: await urlAssinadaUpload(chave, "application/pdf") });
  } catch (err) {
    console.error("[POST /api/documentos/upload]", err);
    return NextResponse.json({ error: "Falha ao preparar o envio." }, { status: 503 });
  }
}
