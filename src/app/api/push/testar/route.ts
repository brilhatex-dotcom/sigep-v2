import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enviarParaLogin } from "@/lib/push";

export const dynamic = "force-dynamic";

// Envia uma notificacao de teste para o proprio usuario logado.
export async function POST() {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;
  if (!login) {
    return NextResponse.json({ erro: "Sessao invalida." }, { status: 401 });
  }

  const r = await enviarParaLogin(login, {
    title: "SIGEP 18º BPM",
    body: "Notificação de teste — está funcionando! 🚀",
    url: "/dashboard",
    tag: "teste",
  });

  return NextResponse.json({ ok: true, ...r });
}