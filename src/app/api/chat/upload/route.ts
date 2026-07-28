import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { urlAssinadaUpload } from "@/lib/r2";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* /api/chat/upload
   Devolve uma URL assinada para o NAVEGADOR enviar o arquivo DIRETO ao R2.
   O arquivo nunca passa pela Vercel — e por isso que 20 MB funciona (a
   plataforma corta requisicoes acima de ~4,5 MB).
   POST { nome, tipo, tam } -> { url, key } */

const LIMITE_BYTES = 20 * 1024 * 1024; // 20 MB

// mantem so caracteres seguros no nome do arquivo guardado
function limpar(nome: string): string {
  return (nome || "arquivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120) || "arquivo";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const b = await req.json();
    const nome = String(b?.nome || "").trim();
    const tipo = String(b?.tipo || "application/octet-stream").trim();
    const tam = Number(b?.tam);

    if (!nome) return NextResponse.json({ error: "Informe o arquivo." }, { status: 400 });
    if (!Number.isFinite(tam) || tam <= 0) {
      return NextResponse.json({ error: "Tamanho invalido." }, { status: 400 });
    }
    if (tam > LIMITE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo de " + (tam / 1048576).toFixed(1) + " MB. O limite e 20 MB." },
        { status: 413 }
      );
    }

    const key = "chat/" + eu + "/" + Date.now() + "-" + crypto.randomUUID().slice(0, 8) + "-" + limpar(nome);
    const url = await urlAssinadaUpload(key, tipo);
    return NextResponse.json({ url, key });
  } catch (err) {
    console.error("[POST /api/chat/upload]", err);
    return NextResponse.json({ error: "Falha ao preparar o envio" }, { status: 500 });
  }
}
