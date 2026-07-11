import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/licenca-premio/membros
   POST   body: { efetivoId, numeroEquipe, anoGozo } -> adiciona o militar
          (um militar so pode estar em 1 equipe por ano — trava no banco).
   DELETE body: { membroId }                          -> remove o militar.
   ========================================================================= */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { efetivoId, numeroEquipe, anoGozo } = await req.json();
    if (!efetivoId || !numeroEquipe || !anoGozo) {
      return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });
    }

    const ficha = await prisma.efetivo.findUnique({
      where: { id: String(efetivoId) },
      select: { postoGrad: true, nome: true, nomeGuerra: true },
    });
    if (!ficha) return NextResponse.json({ erro: "Militar não encontrado." }, { status: 404 });

    try {
      await prisma.membroLicencaPremio.create({
        data: { idPmma: String(efetivoId), numeroEquipe: String(numeroEquipe), anoGozo: String(anoGozo) },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return NextResponse.json(
          { erro: "Este militar já está em uma equipe de Licença-Prêmio neste ano." },
          { status: 400 }
        );
      }
      throw e;
    }

    const nome = [ficha.postoGrad || "", ficha.nomeGuerra || ficha.nome || ""].filter(Boolean).join(" ").trim();
    try {
      await registrar({
        acao: "adicionar_licenca_premio",
        alvo: String(efetivoId),
        alvoNome: nome,
        detalhe: `Equipe ${numeroEquipe} · Licença-Prêmio ${anoGozo}`,
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/licenca-premio/membros]", e);
    return NextResponse.json({ erro: "Falha ao adicionar." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const { membroId } = await req.json();
    if (!membroId) return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });

    await prisma.membroLicencaPremio.delete({ where: { id: String(membroId) } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/licenca-premio/membros]", e);
    return NextResponse.json({ erro: "Falha ao remover." }, { status: 500 });
  }
}
