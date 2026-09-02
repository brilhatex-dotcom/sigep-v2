import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/chat/compartilhar
   GET -> o que EU posso mandar para alguém no chat, já pronto para virar
          mensagem: escala, operações da JOE abertas, meus requerimentos e os
          atalhos do sistema.

   Não expõe nada novo: só devolve coisas que a própria pessoa já vê nas telas
   (os requerimentos são só os dela). Quem recebe o link só abre se tiver
   permissão — o link não dá acesso a nada por si só. */

type Item = { id: string; icone: string; titulo: string; sub: string; href: string };
type Grupo = { titulo: string; itens: Item[] };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// "2026-09-05" -> "05/09/2026" (sem passar por Date, para não escorregar fuso)
function dataBR(iso: string): string {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || "");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.login) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const efetivoId = (u.refEfetivo as string | null) || null;
  const grupos: Grupo[] = [];

  const agora = new Date();
  const mesAno = `${MESES[agora.getMonth()]} de ${agora.getFullYear()}`;
  const hojeISO = agora.toISOString().slice(0, 10);

  /* ---------------- escala ---------------- */
  grupos.push({
    titulo: "Escala",
    itens: [
      { id: "esc-meu", icone: "🗓", titulo: "Meu mapa de serviço", sub: mesAno, href: "/meu-mapa" },
      { id: "esc-dia", icone: "📋", titulo: "Escala do dia", sub: dataBR(hojeISO), href: "/escalas" },
      { id: "esc-mapa", icone: "🗺", titulo: "Mapa mensal da unidade", sub: mesAno, href: "/escalas/mapa" },
    ],
  });

  /* ---------------- JOE: operações abertas, da data de hoje em diante ------ */
  try {
    const joes = await prisma.joe.findMany({
      where: { status: "aberta", data: { gte: hojeISO } },
      orderBy: { data: "asc" },
      take: 8,
      select: { id: true, evento: true, local: true, data: true, horaInicio: true, horaFim: true, vagas: true },
    });
    if (joes.length) {
      grupos.push({
        titulo: "JOE — operações abertas",
        itens: joes.map((j) => ({
          id: "joe-" + j.id,
          icone: "🚨",
          titulo: j.evento,
          sub: [
            dataBR(j.data),
            [j.horaInicio, j.horaFim].filter(Boolean).join(" às "),
            j.local || "",
            j.vagas ? `${j.vagas} vaga${j.vagas > 1 ? "s" : ""}` : "",
          ].filter(Boolean).join(" · "),
          href: "/joe",
        })),
      });
    }
  } catch { /* JOE indisponível: só não aparece o grupo */ }

  /* ---------------- meus requerimentos ---------------- */
  if (efetivoId) {
    try {
      const reqs = await prisma.requerimento.findMany({
        where: { efetivoId },
        orderBy: { criadoEm: "desc" },
        take: 10,
        select: { id: true, modalidade: true, modalidadeOutros: true, status: true, criadoEm: true },
      });
      if (reqs.length) {
        grupos.push({
          titulo: "Meus requerimentos",
          itens: reqs.map((r) => ({
            id: "req-" + r.id,
            icone: "📄",
            titulo: (r.modalidadeOutros?.trim() || r.modalidade || "Requerimento").toUpperCase(),
            sub: `${r.status} · ${r.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
            href: "/requerimentos/" + r.id,
          })),
        });
      }
    } catch { /* sem requerimentos: só não aparece o grupo */ }
  }

  /* ---------------- atalhos do sistema ---------------- */
  grupos.push({
    titulo: "Atalhos",
    itens: [
      { id: "at-joe", icone: "🚨", titulo: "JOE", sub: "Operações e inscrições", href: "/joe" },
      { id: "at-permutas", icone: "🔄", titulo: "Permutas", sub: "Pedidos de troca de serviço", href: "/permutas" },
      { id: "at-ferias", icone: "🏖", titulo: "Minhas férias", sub: "Plano e memorando", href: "/minhas-ferias" },
      { id: "at-avisos", icone: "📢", titulo: "Avisos", sub: "Quadro de avisos da unidade", href: "/avisos" },
      { id: "at-req", icone: "📄", titulo: "Requerimentos", sub: "Fazer um requerimento novo", href: "/requerimentos/novo" },
    ],
  });

  return NextResponse.json({ grupos });
}
