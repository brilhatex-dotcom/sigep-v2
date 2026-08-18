import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/ferias/membros
   Composição das equipes do plano de férias: ADICIONAR e REMOVER militares.
   Vale para QUALQUER ano de gozo — o plano do ano novo nasce equilibrado, mas
   o P/1 continua dono da lista e ajusta o que precisar.

   MOVER de equipe já existe em /api/ferias/permuta (o botão "Editar" na tela),
   e continua sendo o caminho normal para isso. Aqui o POST também move, mas só
   como salvaguarda: se alguém for adicionado a uma equipe estando já em outra
   do mesmo ano, trocamos de equipe em vez de deixar o militar duplicado em
   duas equipes — o que quebraria a contagem de quem está de férias.

   As demais funções do plano (datas, postergar, memorando, permuta) não são
   afetadas: elas trabalham sobre a equipe, e aqui só mexemos em quem está
   dentro dela.

   POST   { idPmma, numeroEquipe, anoGozo }            -> adiciona (ou move)
   DELETE ?idPmma=&anoGozo=                            -> remove do plano do ano */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    const numeroEquipe = String(b?.numeroEquipe || "").trim();
    const anoGozo = String(b?.anoGozo || "").trim();
    if (!idPmma) return NextResponse.json({ erro: "Informe o militar." }, { status: 400 });
    if (!numeroEquipe) return NextResponse.json({ erro: "Informe a equipe." }, { status: 400 });
    if (!/^\d{4}$/.test(anoGozo)) return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });

    // a equipe precisa existir no plano daquele ano
    const equipe = await prisma.equipeFerias.findFirst({ where: { numeroEquipe, anoGozo } });
    if (!equipe) return NextResponse.json({ erro: `A equipe ${numeroEquipe} não existe no plano de ${anoGozo}.` }, { status: 404 });

    const ficha = await prisma.efetivo.findUnique({ where: { id: idPmma }, select: { id: true, nome: true } });
    if (!ficha) return NextResponse.json({ erro: "Militar não encontrado no efetivo." }, { status: 404 });

    // Um militar entra em UMA equipe por ano. Se ja estiver em outra, isto e um
    // MOVER: tira da anterior e poe na nova, em vez de duplicar.
    const jaNoAno = await prisma.membroFerias.findMany({ where: { idPmma, anoGozo } });
    const jaNestaEquipe = jaNoAno.some((m) => m.numeroEquipe === numeroEquipe);
    if (jaNestaEquipe) {
      return NextResponse.json({ erro: "Este militar já está nesta equipe." }, { status: 409 });
    }
    if (jaNoAno.length) {
      await prisma.membroFerias.deleteMany({ where: { idPmma, anoGozo } });
    }

    await prisma.membroFerias.create({ data: { idPmma, numeroEquipe, anoGozo } });

    // espelha na ficha, como a permuta já faz — o campo "Equipe de férias" da
    // Ficha Individual precisa acompanhar
    try {
      await prisma.efetivo.update({ where: { id: idPmma }, data: { equipeFerias: numeroEquipe } });
    } catch { /* ficha sem o campo: nao impede a inclusao no plano */ }

    return NextResponse.json({
      ok: true,
      moveu: jaNoAno.length > 0,
      de: jaNoAno[0]?.numeroEquipe ?? null,
      para: numeroEquipe,
    });
  } catch (e) {
    console.error("[POST /api/ferias/membros]", e);
    return NextResponse.json({ erro: "Falha ao salvar." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  const q = new URL(req.url).searchParams;
  const idPmma = (q.get("idPmma") || "").trim();
  const anoGozo = (q.get("anoGozo") || "").trim();
  if (!idPmma || !/^\d{4}$/.test(anoGozo)) {
    return NextResponse.json({ erro: "Informe o militar e o ano." }, { status: 400 });
  }
  const r = await prisma.membroFerias.deleteMany({ where: { idPmma, anoGozo } });
  return NextResponse.json({ ok: true, removidos: r.count });
}
