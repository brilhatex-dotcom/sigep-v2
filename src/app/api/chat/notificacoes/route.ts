import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/chat/notificacoes
   Alimenta o sininho com as conversas que têm mensagem não lida.
   Mesmo formato das permutas: { notificacoes: [{ id, texto, em, href }] }
   Uma linha por remetente (não uma por mensagem), para não entupir o sino. */

export async function GET() {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ notificacoes: [] });

  try {
    const naoLidas = await prisma.chatMensagem.findMany({
      where: { para: eu, lidaEm: null },
      orderBy: { criadoEm: "desc" },
      take: 120,
      select: { id: true, de: true, texto: true, arqNome: true, criadoEm: true },
    });
    if (naoLidas.length === 0) return NextResponse.json({ notificacoes: [] });

    // agrupa por remetente
    const porRemetente = new Map<string, { qtd: number; ultima: typeof naoLidas[0] }>();
    for (const m of naoLidas) {
      const atual = porRemetente.get(m.de);
      if (atual) atual.qtd += 1;
      else porRemetente.set(m.de, { qtd: 1, ultima: m });
    }

    // nome de quem mandou
    const logins = [...porRemetente.keys()];
    const usuarios = await prisma.usuario.findMany({
      where: { login: { in: logins } },
      select: { login: true, nomeCompleto: true, refEfetivo: true },
    });
    const ids = usuarios.map((u) => u.refEfetivo).filter(Boolean) as string[];
    const fichas = ids.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: ids } },
          select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
        })
      : [];
    const ficha = new Map(fichas.map((f) => [f.id, f]));
    const nomeDe = new Map(
      usuarios.map((u) => {
        const f = u.refEfetivo ? ficha.get(u.refEfetivo) : null;
        const n = (f?.nomeGuerra || f?.nome || u.nomeCompleto || u.login).toString().trim();
        return [u.login, [f?.postoGrad, n].filter(Boolean).join(" ")];
      })
    );

    const nots = [...porRemetente.entries()].map(([login, d]) => {
      const quem = nomeDe.get(login) || login;
      const previa = d.ultima.texto?.trim()
        ? d.ultima.texto.trim().slice(0, 70)
        : "📎 " + (d.ultima.arqNome || "arquivo");
      return {
        // o id muda quando chega mensagem nova, então o sino volta a piscar
        id: "chat:" + login + ":" + d.ultima.id,
        texto:
          d.qtd > 1
            ? `${quem} — ${d.qtd} mensagens novas: “${previa}”`
            : `${quem}: “${previa}”`,
        em: d.ultima.criadoEm.toISOString(),
        href: "/chat?com=" + encodeURIComponent(login),
      };
    });
    nots.sort((a, b) => b.em.localeCompare(a.em));

    return NextResponse.json({ notificacoes: nots });
  } catch {
    // tabela ainda não criada, ou banco fora — o sino simplesmente não mostra chat
    return NextResponse.json({ notificacoes: [] });
  }
}
