import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ins = { id: string; cursoId: string; efetivoId: string; inscritoEm: Date };
type CursoComIns = { id: string; nome: string; local: string | null; vagas: number; prazo: string | null; descricao: string | null; status: string; criadoEm: Date; inscricoes: Ins[] };


/* =========================================================================
   /api/cursos
   GET  -> lista os cursos.
           admin: com a lista de interessados (nome de cada um).
           policial: so o curso + se ele ja demonstrou interesse.
   POST -> cria um curso (somente admin).
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivoId = await efetivoIdDaSessao(session);

  try {
    const lista = await prisma.curso.findMany({
      orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
      include: { inscricoes: true },
    });

    const ids = Array.from(new Set(lista.flatMap((c: CursoComIns) => c.inscricoes.map((i: Ins) => i.efetivoId))));
    const fichas = ids.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: ids } },
          select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true },
        })
      : [];
    const mapaFicha: Record<string, any> = {};
    for (const f of fichas) mapaFicha[f.id] = f;

    const cursos = lista.map((c: CursoComIns) => {
      const minhaInscricao = meuEfetivoId
        ? c.inscricoes.find((i: Ins) => i.efetivoId === meuEfetivoId) || null
        : null;

      const base = {
        id: c.id,
        nome: c.nome,
        local: c.local,
        vagas: c.vagas,
        prazo: c.prazo,
        descricao: c.descricao,
        status: c.status,
        totalInteressados: c.inscricoes.length,
        jaInscrito: !!minhaInscricao,
      };

      if (!admin) return base;

      return {
        ...base,
        interessados: c.inscricoes
          .map((i: Ins) => ({ efetivoId: i.efetivoId, inscritoEm: i.inscritoEm, ficha: mapaFicha[i.efetivoId] || null }))
          .sort((a: { inscritoEm: Date }, b: { inscritoEm: Date }) => new Date(a.inscritoEm).getTime() - new Date(b.inscritoEm).getTime()),
      };
    });

    return NextResponse.json({ cursos, admin });
  } catch (err) {
    console.error("[GET /api/cursos]", err);
    return NextResponse.json({ error: "Falha ao listar cursos" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas admin pode abrir curso" }, { status: 403 });
  }

  try {
    const b = await req.json();
    const nome = String(b.nome || "").trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome do curso" }, { status: 400 });

    const criado = await prisma.curso.create({
      data: {
        nome,
        local: String(b.local || "").trim() || null,
        vagas: Math.max(0, parseInt(String(b.vagas), 10) || 0),
        prazo: String(b.prazo || "").trim() || null,
        descricao: String(b.descricao || "").trim() || null,
        status: "aberto",
        criadoPor: (session.user as any).login || session.user.name || null,
      },
    });

    return NextResponse.json({ ok: true, curso: criado });
  } catch (err) {
    console.error("[POST /api/cursos]", err);
    return NextResponse.json({ error: "Falha ao criar curso" }, { status: 500 });
  }
}
