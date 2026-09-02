import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirChatSilencioso } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/conversa
   POST { com, acao }  -> como EU organizo a conversa com essa pessoa.

   acao: "fixar" | "desfixar" | "arquivar" | "desarquivar"
       | "naoLida" | "lida"
       | "silenciar" (com `horas`: 8, 168 ou 0 = para sempre) | "desilenciar"

   É tudo por usuário: eu fixar/arquivar/silenciar não mexe em nada do outro
   lado da conversa. */

type Acao =
  | "fixar" | "desfixar"
  | "arquivar" | "desarquivar"
  | "naoLida" | "lida"
  | "silenciar" | "desilenciar";

const ACOES: Acao[] = [
  "fixar", "desfixar", "arquivar", "desarquivar",
  "naoLida", "lida", "silenciar", "desilenciar",
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const b = await req.json();
    const com = String(b?.com || "").trim();
    const acao = String(b?.acao || "").trim() as Acao;
    if (!com) return NextResponse.json({ error: "Informe a conversa" }, { status: 400 });
    if (!ACOES.includes(acao)) return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });

    // "0 horas" = silenciar sem prazo; usamos uma data bem à frente para não
    // precisar de uma coluna só para dizer "para sempre".
    const horas = Number(b?.horas);
    const silenciarAte =
      Number.isFinite(horas) && horas > 0
        ? new Date(Date.now() + horas * 3600_000)
        : new Date("2099-12-31T23:59:59.000Z");

    const dados: Record<string, any> = {};
    if (acao === "fixar") { dados.fixada = true; dados.arquivada = false; }
    if (acao === "desfixar") dados.fixada = false;
    if (acao === "arquivar") { dados.arquivada = true; dados.fixada = false; }
    if (acao === "desarquivar") dados.arquivada = false;
    if (acao === "naoLida") dados.naoLida = true;
    if (acao === "lida") dados.naoLida = false;
    if (acao === "silenciar") dados.silenciadaAte = silenciarAte;
    if (acao === "desilenciar") dados.silenciadaAte = null;

    const pref = await prisma.chatConversa.upsert({
      where: { login_com: { login: eu, com } },
      update: dados,
      create: { login: eu, com, ...dados },
    });

    return NextResponse.json({
      ok: true,
      conversa: {
        com: pref.com,
        fixada: pref.fixada,
        arquivada: pref.arquivada,
        naoLida: pref.naoLida,
        silenciadaAte: pref.silenciadaAte ? pref.silenciadaAte.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("[POST /api/chat/conversa]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
