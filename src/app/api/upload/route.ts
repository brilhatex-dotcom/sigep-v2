// ==========================================================
//  /api/upload  — Fase 3
//  Recebe um arquivo, envia para o Cloudflare R2 e grava
//  SO o link no banco (tabela "documentos").
// ==========================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enviarParaR2 } from "@/lib/r2";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const arquivo = form.get("arquivo") as File | null;
    const efetivoId = (form.get("efetivoId") as string | null) ?? undefined;
    const titulo = (form.get("titulo") as string | null) ?? "documento";

    if (!arquivo) {
      return NextResponse.json({ erro: "Nenhum arquivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const key = `${efetivoId ?? "geral"}/${Date.now()}-${arquivo.name}`;

    await enviarParaR2(key, buffer, arquivo.type || "application/octet-stream");

    const doc = await prisma.documento.create({
      data: {
        titulo,
        tipo: arquivo.type,
        r2Key: key,
        tamanhoBytes: arquivo.size,
        efetivoId,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha no upload" }, { status: 500 });
  }
}
