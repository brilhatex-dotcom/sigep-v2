import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removerDoR2 } from "@/lib/r2";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/foto
   POST (multipart/form-data: campo "foto" = arquivo, campo "efetivoId")
     -> sobe a foto de perfil para o R2 e salva a chave em Efetivo.fotoURL.
        admin: pode subir de qualquer um.
        policial: so a propria ficha.
   A imagem ja chega pequena (redimensionada no navegador).
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAX = 2 * 1024 * 1024; // 2 MB (ja vem redimensionada)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | undefined;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio invalido" }, { status: 400 });
  }

  const efetivoId = String(form.get("efetivoId") || "");
  const arquivo = form.get("foto");

  if (!efetivoId) return NextResponse.json({ error: "Informe o militar" }, { status: 400 });

  // permissao: admin sobe de qualquer um; policial so a propria
  if (!admin && efetivoId !== meuEfetivo) {
    return NextResponse.json({ error: "Voce so pode alterar a sua propria foto" }, { status: 403 });
  }

  if (!arquivo || typeof arquivo === "string") {
    return NextResponse.json({ error: "Nenhuma foto enviada" }, { status: 400 });
  }

  const file = arquivo as File;
  if (!TIPOS_OK.includes(file.type)) {
    return NextResponse.json({ error: "Formato invalido (use JPG, PNG ou WEBP)" }, { status: 400 });
  }
  if (file.size > TAMANHO_MAX) {
    return NextResponse.json({ error: "Imagem muito grande" }, { status: 400 });
  }

  try {
    const ficha = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { id: true, fotoURL: true, postoGrad: true, nome: true, nomeGuerra: true },
    });
    if (!ficha) return NextResponse.json({ error: "Militar nao encontrado" }, { status: 404 });

    // Guarda a foto DENTRO do banco (Neon/Postgres), como data URL base64 em
    // Efetivo.fotoURL. Assim persiste em qualquer computador, sem depender do
    // R2/armazenamento externo. A imagem ja chega pequena (<=512px) do navegador.
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    // se a foto antiga era do R2 (legado), remove de la para nao deixar lixo
    const antiga = ficha.fotoURL;
    if (antiga && antiga.startsWith("fotos/")) {
      try { await removerDoR2(antiga); } catch {}
    }

    await prisma.efetivo.update({ where: { id: efetivoId }, data: { fotoURL: dataUrl } });

    const nomeAlvo = [ficha.postoGrad || "", (ficha.nomeGuerra || ficha.nome || "")].filter(Boolean).join(" ").trim();
    await registrar({
      acao: "editar_ficha",
      alvo: efetivoId,
      alvoNome: nomeAlvo,
      detalhe: "Atualizou a foto de perfil",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/foto]", err);
    return NextResponse.json({ error: "Falha ao salvar a foto" }, { status: 500 });
  }
}

/* DELETE (JSON: { efetivoId }) -> remove a foto de perfil (R2 + limpa fotoURL).
   admin: qualquer um; policial: so a propria. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | undefined;

  try {
    const b = await req.json().catch(() => ({}));
    const efetivoId = String(b?.efetivoId || "");
    if (!efetivoId) return NextResponse.json({ error: "Informe o militar" }, { status: 400 });
    if (!admin && efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Voce so pode alterar a sua propria foto" }, { status: 403 });
    }
    const ficha = await prisma.efetivo.findUnique({ where: { id: efetivoId }, select: { fotoURL: true } });
    const antiga = ficha?.fotoURL;
    if (antiga && antiga.startsWith("fotos/")) { try { await removerDoR2(antiga); } catch {} }
    await prisma.efetivo.update({ where: { id: efetivoId }, data: { fotoURL: null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/foto]", err);
    return NextResponse.json({ error: "Falha ao remover a foto" }, { status: 500 });
  }
}
