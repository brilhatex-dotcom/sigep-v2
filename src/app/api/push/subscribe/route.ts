import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Salva (ou atualiza) a inscricao de push do usuario logado.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;
  if (!login) {
    return NextResponse.json({ erro: "Sessao invalida." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisicao invalida." }, { status: 400 });
  }

  const sub = body?.subscription;
  const endpoint = sub?.endpoint as string | undefined;
  const p256dh = sub?.keys?.p256dh as string | undefined;
  const auth = sub?.keys?.auth as string | undefined;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ erro: "Inscricao incompleta." }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? null;

  // upsert pelo endpoint (unico). Se ja existe, atualiza o dono e as chaves.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { login, endpoint, p256dh, auth, userAgent },
    update: { login, p256dh, auth, userAgent },
  });

  return NextResponse.json({ ok: true });
}

// Remove a inscricao (quando o usuario desativa notificacoes).
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;
  if (!login) {
    return NextResponse.json({ erro: "Sessao invalida." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisicao invalida." }, { status: 400 });
  }

  const endpoint = body?.endpoint as string | undefined;
  if (!endpoint) {
    return NextResponse.json({ erro: "Endpoint ausente." }, { status: 400 });
  }

  try {
    await prisma.pushSubscription.delete({ where: { endpoint } });
  } catch {
    // ja nao existia: tudo bem
  }

  return NextResponse.json({ ok: true });
}