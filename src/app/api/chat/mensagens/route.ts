import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarParaLogin } from "@/lib/push";

export const dynamic = "force-dynamic";

/* /api/chat/mensagens
   GET  ?com=<login>[&depois=<ISO>]  -> conversa com essa pessoa; marca como
                                        lidas as que ela me mandou.
   POST { para, texto? , arq? }      -> envia mensagem (texto e/ou anexo) e
                                        dispara notificacao push. */

const LIMITE = 200;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const com = (url.searchParams.get("com") || "").trim();
  const depois = url.searchParams.get("depois");
  if (!com) return NextResponse.json({ error: "Informe com quem" }, { status: 400 });

  try {
    const where: any = {
      OR: [
        { de: eu, para: com },
        { de: com, para: eu },
      ],
    };
    if (depois) {
      const d = new Date(depois);
      if (!isNaN(d.getTime())) where.criadoEm = { gt: d };
    }

    const msgs = await prisma.chatMensagem.findMany({
      where,
      orderBy: { criadoEm: depois ? "asc" : "desc" },
      take: LIMITE,
    });
    const lista = depois ? msgs : msgs.reverse();

    // marca como lidas as que ELA me mandou
    await prisma.chatMensagem.updateMany({
      where: { de: com, para: eu, lidaEm: null },
      data: { lidaEm: new Date() },
    });

    return NextResponse.json({
      mensagens: lista.map((m) => ({
        id: m.id,
        minha: m.de === eu,
        texto: m.texto,
        arqKey: m.arqKey,
        arqNome: m.arqNome,
        arqTipo: m.arqTipo,
        arqTam: m.arqTam,
        em: m.criadoEm.toISOString(),
        lida: !!m.lidaEm,
        lidaEm: m.lidaEm ? m.lidaEm.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/chat/mensagens]", err);
    return NextResponse.json({ mensagens: [] });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const eu = u?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const b = await req.json();
    const para = String(b?.para || "").trim();
    const texto = typeof b?.texto === "string" ? b.texto.trim().slice(0, 4000) : "";
    const arq = b?.arq || null;
    if (!para) return NextResponse.json({ error: "Destinatario obrigatorio" }, { status: 400 });
    if (para === eu) return NextResponse.json({ error: "Nao da para conversar consigo mesmo" }, { status: 400 });
    if (!texto && !arq?.key) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });

    const destino = await prisma.usuario.findUnique({ where: { login: para }, select: { login: true } });
    if (!destino) return NextResponse.json({ error: "Destinatario nao encontrado" }, { status: 404 });

    const msg = await prisma.chatMensagem.create({
      data: {
        de: eu,
        para,
        texto: texto || null,
        arqKey: arq?.key ? String(arq.key) : null,
        arqNome: arq?.nome ? String(arq.nome).slice(0, 240) : null,
        arqTipo: arq?.tipo ? String(arq.tipo).slice(0, 120) : null,
        arqTam: Number.isFinite(Number(arq?.tam)) ? Number(arq.tam) : null,
      },
    });

    // avisa no celular mesmo com o sistema fechado
    try {
      const quem = (u?.name || eu).toString();
      await enviarParaLogin(para, {
        title: "Mensagem de " + quem,
        body: texto ? texto.slice(0, 120) : "📎 " + (arq?.nome || "arquivo"),
        url: "/chat?com=" + encodeURIComponent(eu),
        tag: "chat-" + eu,
      });
    } catch { /* push e best-effort */ }

    return NextResponse.json({
      ok: true,
      mensagem: {
        id: msg.id, minha: true, texto: msg.texto,
        arqKey: msg.arqKey, arqNome: msg.arqNome, arqTipo: msg.arqTipo, arqTam: msg.arqTam,
        em: msg.criadoEm.toISOString(), lida: false, lidaEm: null,
      },
    });
  } catch (err) {
    console.error("[POST /api/chat/mensagens]", err);
    return NextResponse.json({ error: "Falha ao enviar" }, { status: 500 });
  }
}
