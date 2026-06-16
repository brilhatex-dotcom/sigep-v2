import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ins = { id: string; cursoId: string; efetivoId: string; inscritoEm: Date };


/* =========================================================================
   /api/cursos/[id]
   POST { acao: "interesse" }   (policial demonstra interesse)
        { acao: "cancelar" }    (policial retira o interesse)
        { acao: "encerrar" | "reabrir" }   (admin)
   DELETE -> exclui o curso     (admin)
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

async function efetivoIdDaSessao(session: any): Promise<string | null> {
  const u = session?.user || {};
  if (u.refEfetivo) return String(u.refEfetivo);
  const chaves = [u.id, u.login, u.email, u.name].filter(Boolean).map(String);
  for (const k of chaves) {
    const usr = await prisma.usuario.findFirst({
      where: { OR: [{ id: k }, { login: k }, { email: k }] },
      select: { refEfetivo: true },
    });
    if (usr?.refEfetivo) return String(usr.refEfetivo);
  }
  return null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivoId = await efetivoIdDaSessao(session);
  const cursoId = params.id;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const acao = String(body.acao || "");

  try {
    const curso = await prisma.curso.findUnique({ where: { id: cursoId }, include: { inscricoes: true } });
    if (!curso) return NextResponse.json({ error: "Curso nao encontrado" }, { status: 404 });

    if (acao === "interesse") {
      if (!meuEfetivoId) return NextResponse.json({ error: "Seu login nao esta vinculado a uma ficha" }, { status: 400 });
      if (curso.status !== "aberto") return NextResponse.json({ error: "Inscricoes encerradas" }, { status: 400 });
      const ja = curso.inscricoes.find((i: Ins) => i.efetivoId === meuEfetivoId);
      if (ja) return NextResponse.json({ error: "Voce ja demonstrou interesse" }, { status: 400 });
      await prisma.cursoInscricao.create({ data: { cursoId, efetivoId: meuEfetivoId } });
      return NextResponse.json({ ok: true });
    }

    if (acao === "cancelar") {
      if (!meuEfetivoId) return NextResponse.json({ error: "Sem vinculo de efetivo" }, { status: 400 });
      const minha = curso.inscricoes.find((i: Ins) => i.efetivoId === meuEfetivoId);
      if (!minha) return NextResponse.json({ error: "Voce nao esta inscrito" }, { status: 400 });
      await prisma.cursoInscricao.delete({ where: { id: minha.id } });
      return NextResponse.json({ ok: true });
    }

    if (acao === "encerrar" || acao === "reabrir") {
      if (!admin) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
      await prisma.curso.update({
        where: { id: cursoId },
        data: { status: acao === "encerrar" ? "encerrado" : "aberto" },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acao desconhecida" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/cursos/[id]]", err);
    return NextResponse.json({ error: "Falha ao processar" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas admin pode excluir" }, { status: 403 });
  }
  try {
    await prisma.curso.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/cursos/[id]]", err);
    return NextResponse.json({ error: "Falha ao excluir" }, { status: 500 });
  }
}
