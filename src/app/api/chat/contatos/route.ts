import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/chat/contatos
   Lista com quem da para conversar (todos os usuarios ativos), marcando:
   - online  : bateu presenca nos ultimos 70 s
   - naoLidas: mensagens dele para mim ainda nao lidas
   - previa  : ultima mensagem trocada e quando
   Ordem: quem tem mensagem nova primeiro, depois conversa mais recente,
   depois os demais por nome. */

const JANELA_ONLINE = 70_000; // ms

export async function GET() {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const usuarios = await prisma.usuario.findMany({
      where: { login: { not: eu } },
      select: { login: true, nomeCompleto: true, perfil: true, refEfetivo: true, ativo: true },
    });
    const ativos = usuarios.filter((u) => {
      const a = (u.ativo ?? "").toString().trim().toLowerCase();
      return a === "" || a === "sim" || a === "true" || a === "1" || a === "ativo";
    });

    // fichas para posto/graduacao e lotacao
    const ids = ativos.map((u) => u.refEfetivo).filter(Boolean) as string[];
    const fichas = ids.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: ids } },
          select: { id: true, postoGrad: true, nome: true, nomeGuerra: true, lotacao: true, fotoURL: true },
        })
      : [];
    const ficha = new Map(fichas.map((f) => [f.id, f]));

    // presenca
    const limite = new Date(Date.now() - JANELA_ONLINE);
    const presentes = await prisma.chatPresenca.findMany({
      where: { visto: { gte: limite } },
      select: { login: true },
    });
    const online = new Set(presentes.map((p) => p.login));

    // nao lidas por remetente
    const naoLidas = await prisma.chatMensagem.groupBy({
      by: ["de"],
      where: { para: eu, lidaEm: null },
      _count: { _all: true },
    });
    const mapaNaoLidas = new Map(naoLidas.map((n) => [n.de, n._count._all]));

    // ultima mensagem de cada conversa (busca as recentes e reduz em memoria)
    const recentes = await prisma.chatMensagem.findMany({
      where: { OR: [{ de: eu }, { para: eu }] },
      orderBy: { criadoEm: "desc" },
      take: 400,
      select: { de: true, para: true, texto: true, arqNome: true, criadoEm: true },
    });
    const ultima = new Map<string, { previa: string; em: string }>();
    for (const m of recentes) {
      const outro = m.de === eu ? m.para : m.de;
      if (ultima.has(outro)) continue;
      const previa = m.texto?.trim()
        ? (m.de === eu ? "Você: " : "") + m.texto.trim()
        : (m.de === eu ? "Você: " : "") + "📎 " + (m.arqNome || "anexo");
      ultima.set(outro, { previa: previa.slice(0, 90), em: m.criadoEm.toISOString() });
    }

    const contatos = ativos.map((u) => {
      const f = u.refEfetivo ? ficha.get(u.refEfetivo) : null;
      const nome =
        (f?.nomeGuerra || f?.nome || u.nomeCompleto || u.login || "").toString().trim() || u.login;
      const ult = ultima.get(u.login);
      return {
        login: u.login,
        nome,
        postoGrad: f?.postoGrad ?? null,
        lotacao: f?.lotacao ?? null,
        admin: (u.perfil ?? "").toLowerCase() === "admin",
        // avatar só quando o militar tem foto cadastrada
        foto: f?.fotoURL && u.refEfetivo ? `/api/foto/${encodeURIComponent(u.refEfetivo)}?avatar=1` : null,
        online: online.has(u.login),
        naoLidas: mapaNaoLidas.get(u.login) ?? 0,
        previa: ult?.previa ?? "",
        em: ult?.em ?? null,
      };
    });

    contatos.sort((a, b) => {
      if ((b.naoLidas > 0 ? 1 : 0) !== (a.naoLidas > 0 ? 1 : 0)) return (b.naoLidas > 0 ? 1 : 0) - (a.naoLidas > 0 ? 1 : 0);
      if (a.em && b.em && a.em !== b.em) return b.em.localeCompare(a.em);
      if (!!b.em !== !!a.em) return b.em ? 1 : -1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });

    return NextResponse.json({ contatos, eu, instalado: true });
  } catch (err: any) {
    // P2021 = a tabela ainda nao existe (falta rodar "npm run db:push").
    // Devolve um aviso claro em vez de uma lista vazia sem explicacao.
    if (err?.code === "P2021") {
      return NextResponse.json({ contatos: [], instalado: false });
    }
    console.error("[GET /api/chat/contatos]", err);
    return NextResponse.json({ contatos: [], instalado: true });
  }
}
