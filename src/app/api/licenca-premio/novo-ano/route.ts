import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* POST /api/licenca-premio/novo-ano   { ano }

   Abre o exercício de Licença-Prêmio de um ano novo: cria as 4 equipes com as
   datas em branco, para o ano passar a aparecer no seletor da tela.

   Começa SEM militares, de propósito. A licença-prêmio não é anual como as
   férias: é conquistada a cada 10 anos de serviço, então quem gozou num ano
   não goza no seguinte. Copiar a lista do ano anterior traria de volta
   justamente quem já tirou. O P/1 inclui quem faz jus, pelo botão de
   adicionar que já existe em cada equipe. */

// as mesmas 4 equipes fixas que a tela desenha
const EQUIPES_FIXAS = ["1", "2", "3", "4"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user as any).perfil?.toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const ano = String(b?.ano || "").trim();
    if (!/^\d{4}$/.test(ano)) {
      return NextResponse.json({ erro: "Informe um ano válido (AAAA)." }, { status: 400 });
    }

    const jaExiste = await prisma.equipeLicencaPremio.findFirst({ where: { anoGozo: ano } });
    if (jaExiste) {
      return NextResponse.json({ erro: `O exercício de ${ano} já está aberto.` }, { status: 409 });
    }

    await prisma.equipeLicencaPremio.createMany({
      data: EQUIPES_FIXAS.map((numeroEquipe) => ({
        numeroEquipe, anoGozo: ano, periodoInicio: null, periodoFim: null,
      })),
      skipDuplicates: true,
    });

    try {
      await registrar({
        acao: "abrir_ano_licenca_premio",
        alvo: ano,
        alvoNome: `Licença-Prêmio ${ano}`,
        detalhe: `${EQUIPES_FIXAS.length} equipes criadas, sem datas e sem militares`,
      });
    } catch {}

    return NextResponse.json({ ok: true, ano, equipes: EQUIPES_FIXAS.length });
  } catch (e) {
    console.error("[POST /api/licenca-premio/novo-ano]", e);
    return NextResponse.json({ erro: "Falha ao abrir o exercício." }, { status: 500 });
  }
}
