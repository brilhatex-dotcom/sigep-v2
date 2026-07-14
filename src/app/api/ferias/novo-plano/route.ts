import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* POST /api/ferias/novo-plano
   Cria o plano de ferias de um NOVO ano de gozo. Copia as equipes (e seus
   membros) de um ano de origem, com as datas em branco para o admin preencher.
   Se nao houver ano de origem, cria 9 equipes vazias.
   body: { anoDestino, anoOrigem? } */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { anoDestino, anoOrigem } = await req.json();
    const dest = String(anoDestino || "").trim();
    if (!/^\d{4}$/.test(dest)) {
      return NextResponse.json({ erro: "Informe um ano válido (AAAA)." }, { status: 400 });
    }

    const jaExiste = await prisma.equipeFerias.findFirst({ where: { anoGozo: dest } });
    if (jaExiste) {
      return NextResponse.json({ erro: `Já existe um plano para ${dest}.` }, { status: 409 });
    }

    // equipes de origem (para copiar a estrutura e os membros)
    const orig = String(anoOrigem || "").trim();
    const equipesOrigem = orig ? await prisma.equipeFerias.findMany({ where: { anoGozo: orig } }) : [];
    const numeros = equipesOrigem.length
      ? equipesOrigem.map((e) => e.numeroEquipe)
      : ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

    await prisma.equipeFerias.createMany({
      data: numeros.map((numeroEquipe) => ({
        numeroEquipe, anoGozo: dest,
        periodo1Inicio: null, periodo1Fim: null, periodo1Apres: null,
        periodo2Inicio: null, periodo2Fim: null, periodo2Apres: null,
      })),
    });

    // copia os membros do ano de origem (mesmas equipes, novo ano)
    let membrosCopiados = 0;
    if (orig) {
      const membros = await prisma.membroFerias.findMany({ where: { anoGozo: orig } });
      if (membros.length) {
        const r = await prisma.membroFerias.createMany({
          data: membros.map((m) => ({ idPmma: m.idPmma, numeroEquipe: m.numeroEquipe, anoGozo: dest })),
          skipDuplicates: true,
        });
        membrosCopiados = r.count;
      }
    }

    return NextResponse.json({ ok: true, ano: dest, equipes: numeros.length, membros: membrosCopiados });
  } catch (e) {
    console.error("[POST /api/ferias/novo-plano]", e);
    return NextResponse.json({ erro: "Falha ao criar o plano." }, { status: 500 });
  }
}
