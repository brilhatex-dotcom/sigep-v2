import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/joe
   GET  -> lista os JOE.
           admin: todos, com candidatos. policial: todos, mas so com a
           contagem e a propria inscricao (sem expor os outros candidatos).
   POST -> cria um JOE (somente admin / P1).
   Perfil vem de session.user.perfil (campo do model Usuario).
   ========================================================================= */

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

// Descobre o ID PMMA (efetivo) do usuario logado. Tenta a sessao; se nao
// houver, busca o Usuario no banco por id/login/email e le o refEfetivo.
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

  const perfil = (session.user as any).perfil as string | undefined;
  const admin = ehAdmin(perfil);
  const meuEfetivoId = await efetivoIdDaSessao(session);

  try {
    const lista = await prisma.joe.findMany({
      orderBy: [{ data: "asc" }, { horaInicio: "asc" }],
      include: { inscricoes: true },
    });

    // Enriqudece com nomes do efetivo (uma consulta so).
    const ids = Array.from(new Set(lista.flatMap((j) => j.inscricoes.map((i) => i.efetivoId))));
    const fichas = ids.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: ids } },
          select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true },
        })
      : [];
    const mapaFicha: Record<string, any> = {};
    for (const f of fichas) mapaFicha[f.id] = f;

    const joe = lista.map((j) => {
      const aprovados = j.inscricoes.filter((i) => i.status === "aprovado").length;
      const minhaInscricao = meuEfetivoId
        ? j.inscricoes.find((i) => i.efetivoId === meuEfetivoId) || null
        : null;

      const base = {
  id: j.id,
  evento: j.evento,
  local: j.local,
  data: j.data,
  horaInicio: j.horaInicio,
  horaFim: j.horaFim,
  vagas: j.vagas,
  valor: j.valor,
  observacao: j.observacao,
  status: j.status,
  // ---- campos da RENE ----
  comandanteOp: j.comandanteOp,
  horario: j.horario,
  areaAtuacao: j.areaAtuacao,
  processoSei: j.processoSei,
  totalCandidatos: j.inscricoes.length,
  totalAprovados: aprovados,
  vagasRestantes: Math.max(0, j.vagas - aprovados),
  minhaInscricao: minhaInscricao
    ? { id: minhaInscricao.id, status: minhaInscricao.status }
    : null,
};

      if (!admin) return base; // policial nao ve a lista dos outros candidatos

      return {
        ...base,
        candidatos: j.inscricoes.map((i) => ({
          id: i.id,
          efetivoId: i.efetivoId,
          status: i.status,
          inscritoEm: i.inscritoEm,
          ficha: mapaFicha[i.efetivoId] || null,
        })),
      };
    });

    return NextResponse.json({ joe, admin });
  } catch (err) {
    console.error("[GET /api/joe]", err);
    return NextResponse.json({ error: "Falha ao listar JOE" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P1 pode abrir um JOE" }, { status: 403 });
  }

  try {
    const b = await req.json();
    const evento = String(b.evento || "").trim();
    const data = String(b.data || "").trim();
    const horaInicio = String(b.horaInicio || "").trim();
    const horaFim = String(b.horaFim || "").trim();

    if (!evento) return NextResponse.json({ error: "Informe o evento" }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Informe a data" }, { status: 400 });
    if (!horaInicio || !horaFim) return NextResponse.json({ error: "Informe os horarios" }, { status: 400 });

    const criado = await prisma.joe.create({
  data: {
    evento,
    local: String(b.local || "").trim() || null,
    data,
    horaInicio,
    horaFim,
    vagas: Math.max(1, parseInt(String(b.vagas), 10) || 1),
    valor: Math.max(0, parseFloat(String(b.valor)) || 0),
    observacao: String(b.observacao || "").trim() || null,
    status: "aberta",
    criadoPor: (session.user as any).login || session.user.name || null,
    // ---- campos da RENE ----
    comandanteOp: String(b.comandanteOp || "").trim() || null,
    horario: String(b.horario || "").trim() || null,
    areaAtuacao: String(b.areaAtuacao || "").trim() || null,
    processoSei: String(b.processoSei || "").trim() || null,
  },
});

    await registrar({
      acao: "criar_joe",
      alvo: criado.id,
      alvoNome: evento,
      detalhe: `JOE de ${data} (${horaInicio}-${horaFim}), ${criado.vagas} vaga(s)`,
    });

    return NextResponse.json({ ok: true, joe: criado });
  } catch (err) {
    console.error("[POST /api/joe]", err);
    return NextResponse.json({ error: "Falha ao criar JOE" }, { status: 500 });
  }
}
