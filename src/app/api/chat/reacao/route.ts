import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirChatSilencioso } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/reacao
   POST { id, emoji } -> põe/tira a MINHA reação numa mensagem da conversa.

   Reagir de novo com o mesmo emoji tira a reação (é o mesmo toque do
   WhatsApp); reagir com outro emoji troca. As reações ficam num JSON
   { login: emoji } na própria mensagem — no 1-a-1 são no máximo duas, não
   compensa uma tabela só para isso. */

// Só a listinha do WhatsApp, para não virar campo livre (e não entrar texto
// gigante no lugar do emoji).
const PERMITIDOS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function lerReacoes(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const b = await req.json();
    const id = String(b?.id || "").trim();
    const emoji = String(b?.emoji || "").trim();
    if (!id) return NextResponse.json({ error: "Informe a mensagem" }, { status: 400 });
    if (!PERMITIDOS.includes(emoji)) return NextResponse.json({ error: "Emoji não permitido" }, { status: 400 });

    const msg = await prisma.chatMensagem.findUnique({ where: { id } });
    if (!msg) return NextResponse.json({ error: "Mensagem nao encontrada" }, { status: 404 });
    // só quem participa da conversa reage
    if (msg.de !== eu && msg.para !== eu) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }
    if (msg.apagadaEm) return NextResponse.json({ error: "Esta mensagem foi apagada." }, { status: 409 });

    const atuais = lerReacoes(msg.reacoes);
    if (atuais[eu] === emoji) delete atuais[eu]; // mesmo emoji = tirar
    else atuais[eu] = emoji;

    const vazio = Object.keys(atuais).length === 0;
    await prisma.chatMensagem.update({
      where: { id },
      data: { reacoes: vazio ? null : JSON.stringify(atuais) },
    });

    // devolve já agrupado, do jeito que o balão mostra
    const contagem = new Map<string, { emoji: string; qtd: number; minha: boolean }>();
    for (const [login, e] of Object.entries(atuais)) {
      const atual = contagem.get(e) || { emoji: e, qtd: 0, minha: false };
      atual.qtd += 1;
      if (login === eu) atual.minha = true;
      contagem.set(e, atual);
    }

    return NextResponse.json({ ok: true, id, reacoes: [...contagem.values()] });
  } catch (err) {
    console.error("[POST /api/chat/reacao]", err);
    return NextResponse.json({ error: "Falha ao reagir" }, { status: 500 });
  }
}
