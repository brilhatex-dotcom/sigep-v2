import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarParaLogin } from "@/lib/push";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/chat/chamada — sinalização da ligação de voz/vídeo (WebRTC).

   O áudio e o vídeo NÃO passam por aqui: vão direto de um aparelho ao outro.
   Esta rota só carrega o "aperto de mão" — quem está chamando quem, as
   ofertas SDP e os candidatos de rede.

   GET                    -> chamada ativa que me interessa (recebendo ou minha)
   POST  { para, video, oferta }    -> inicia a chamada e toca no outro
   PATCH ?id= { acao, resposta? }   -> aceitar | recusar | encerrar
   ========================================================================= */

// Uma chamada não atendida morre sozinha depois disso.
const EXPIRA_MS = 45_000;

function servidoresGelo() {
  // STUN público (grátis) resolve a maioria dos casos em Wi-Fi.
  const lista: any[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  // TURN é o que faz a chamada completar em rede móvel (4G). Opcional:
  // configure TURN_URL / TURN_USER / TURN_SENHA para ligar.
  const url = process.env.TURN_URL || "";
  if (url) {
    lista.push({
      urls: url.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USER || undefined,
      credential: process.env.TURN_SENHA || undefined,
    });
  }
  return { ice: lista, temTurn: !!url };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { ice, temTurn } = servidoresGelo();
  try {
    const limite = new Date(Date.now() - EXPIRA_MS);

    // some com as chamadas que ficaram tocando sem ninguém atender
    await prisma.chatChamada.updateMany({
      where: { estado: "chamando", criadoEm: { lt: limite } },
      data: { estado: "perdida" },
    });

    const c = await prisma.chatChamada.findFirst({
      where: {
        estado: { in: ["chamando", "aceita"] },
        OR: [{ de: eu }, { para: eu }],
      },
      orderBy: { criadoEm: "desc" },
    });
    if (!c) return NextResponse.json({ chamada: null, ice, temTurn });

    return NextResponse.json({
      chamada: {
        id: c.id,
        souQuemLigou: c.de === eu,
        outro: c.de === eu ? c.para : c.de,
        video: c.video,
        estado: c.estado,
        oferta: c.oferta,
        resposta: c.resposta,
        em: c.criadoEm.toISOString(),
      },
      ice,
      temTurn,
    });
  } catch {
    return NextResponse.json({ chamada: null, ice, temTurn, instalado: false });
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
    const video = !!b?.video;
    const oferta = typeof b?.oferta === "string" ? b.oferta : "";
    if (!para || !oferta) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    if (para === eu) return NextResponse.json({ error: "Nao da para ligar para si mesmo" }, { status: 400 });

    // encerra qualquer chamada minha ainda pendurada
    await prisma.chatChamada.updateMany({
      where: { estado: { in: ["chamando", "aceita"] }, OR: [{ de: eu }, { para: eu }] },
      data: { estado: "encerrada" },
    });

    const c = await prisma.chatChamada.create({
      data: { de: eu, para, video, oferta, estado: "chamando" },
    });

    try {
      await enviarParaLogin(para, {
        title: (video ? "📹 Chamada de vídeo" : "📞 Ligação") + " de " + (u?.name || eu),
        body: "Toque para atender no SIGEP.",
        url: "/chat?com=" + encodeURIComponent(eu),
        tag: "chamada-" + eu,
      });
    } catch { /* push é best-effort */ }

    return NextResponse.json({ ok: true, id: c.id });
  } catch (err) {
    console.error("[POST /api/chat/chamada]", err);
    return NextResponse.json({ error: "Falha ao iniciar a chamada" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const b = await req.json().catch(() => ({}));
    const acao = String(b?.acao || "");
    const c = await prisma.chatChamada.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "Chamada nao encontrada" }, { status: 404 });
    if (c.de !== eu && c.para !== eu) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

    if (acao === "aceitar") {
      if (c.para !== eu) return NextResponse.json({ error: "So quem recebe pode atender" }, { status: 403 });
      const resposta = typeof b?.resposta === "string" ? b.resposta : "";
      if (!resposta) return NextResponse.json({ error: "Resposta ausente" }, { status: 400 });
      await prisma.chatChamada.update({ where: { id }, data: { estado: "aceita", resposta } });
      return NextResponse.json({ ok: true });
    }
    if (acao === "recusar" || acao === "encerrar") {
      await prisma.chatChamada.update({
        where: { id },
        data: { estado: acao === "recusar" ? "recusada" : "encerrada" },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  } catch (err) {
    console.error("[PATCH /api/chat/chamada]", err);
    return NextResponse.json({ error: "Falha" }, { status: 500 });
  }
}
