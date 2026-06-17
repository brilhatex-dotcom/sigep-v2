import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/joe/[id]  — acoes sobre um JOE especifico.
   POST   body { acao: "candidatar" }                  (policial)
          body { acao: "cancelar" }                    (policial, tira a propria inscricao)
          body { acao: "decidir", inscricaoId, decisao: "aprovado"|"recusado" }  (admin)
          body { acao: "encerrar" | "reabrir" }        (admin)
   DELETE -> exclui o JOE inteiro                       (admin)

   Regra de horario: um policial nao pode ter 2 inscricoes (pendente ou
   aprovada) em JOE cujos intervalos de tempo se sobrepoem no mesmo dia.
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


// "HH:MM" -> minutos. Trata fim <= inicio como virada de dia (+24h).
function intervalo(data: string, hi: string, hf: string): { ini: number; fim: number } {
  const m = (h: string) => {
    const [a, b] = (h || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
    return a * 60 + b;
  };
  let ini = m(hi);
  let fim = m(hf);
  if (fim <= ini) fim += 24 * 60; // passou da meia-noite
  return { ini, fim };
}

function choca(aData: string, aHi: string, aHf: string, bData: string, bHi: string, bHf: string): boolean {
  if (aData !== bData) return false; // (simplificacao: mesmo dia)
  const A = intervalo(aData, aHi, aHf);
  const B = intervalo(bData, bHi, bHf);
  return A.ini < B.fim && B.ini < A.fim;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const perfil = (session.user as any).perfil as string | undefined;
  const admin = ehAdmin(perfil);
  const meuEfetivoId = await efetivoIdDaSessao(session);
  const joeId = params.id;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const acao = String(body.acao || "");

  try {
    const joe = await prisma.joe.findUnique({ where: { id: joeId }, include: { inscricoes: true } });
    if (!joe) return NextResponse.json({ error: "JOE nao encontrado" }, { status: 404 });

    /* ---------- POLICIAL: candidatar-se ---------- */
    if (acao === "candidatar") {
      if (!meuEfetivoId) {
        return NextResponse.json({ error: "Seu login nao esta vinculado a uma ficha de efetivo" }, { status: 400 });
      }
      if (joe.status !== "aberta") {
        return NextResponse.json({ error: "Este JOE nao esta aberto para candidatura" }, { status: 400 });
      }
      const ja = joe.inscricoes.find((i) => i.efetivoId === meuEfetivoId);
      if (ja) return NextResponse.json({ error: "Voce ja se candidatou a este JOE" }, { status: 400 });

      // checa conflito de horario com inscricoes ativas em outros JOE
      const minhasAtivas = await prisma.joeInscricao.findMany({
        where: { efetivoId: meuEfetivoId, status: { in: ["pendente", "aprovado"] } },
        include: { joe: true },
      });
      const conflito = minhasAtivas.find((i) =>
        choca(joe.data, joe.horaInicio, joe.horaFim, i.joe.data, i.joe.horaInicio, i.joe.horaFim)
      );
      if (conflito) {
        return NextResponse.json(
          { error: `Conflito de horario com o JOE "${conflito.joe.evento}" (${conflito.joe.data} ${conflito.joe.horaInicio}-${conflito.joe.horaFim})` },
          { status: 409 }
        );
      }

      await prisma.joeInscricao.create({
        data: { joeId, efetivoId: meuEfetivoId, status: "pendente" },
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------- POLICIAL: cancelar a propria candidatura ---------- */
    if (acao === "cancelar") {
      if (!meuEfetivoId) return NextResponse.json({ error: "Sem vinculo de efetivo" }, { status: 400 });
      const minha = joe.inscricoes.find((i) => i.efetivoId === meuEfetivoId);
      if (!minha) return NextResponse.json({ error: "Voce nao esta inscrito" }, { status: 400 });
      if (minha.status === "aprovado") {
        return NextResponse.json({ error: "Inscricao ja aprovada; fale com o P1" }, { status: 400 });
      }
      await prisma.joeInscricao.delete({ where: { id: minha.id } });
      return NextResponse.json({ ok: true });
    }

    /* ---------- ADMIN: decidir (aprovar/recusar) ---------- */
    if (acao === "decidir") {
      if (!admin) return NextResponse.json({ error: "Apenas o P1 decide" }, { status: 403 });
      const inscricaoId = String(body.inscricaoId || "");
      const decisao = String(body.decisao || "");
      if (!["aprovado", "recusado"].includes(decisao)) {
        return NextResponse.json({ error: "Decisao invalida" }, { status: 400 });
      }
      const insc = joe.inscricoes.find((i) => i.id === inscricaoId);
      if (!insc) return NextResponse.json({ error: "Candidatura nao encontrada" }, { status: 404 });

      if (decisao === "aprovado") {
        const aprovados = joe.inscricoes.filter((i) => i.status === "aprovado" && i.id !== inscricaoId).length;
        if (aprovados >= joe.vagas) {
          return NextResponse.json({ error: "Todas as vagas ja foram preenchidas" }, { status: 400 });
        }
      }

      await prisma.joeInscricao.update({
        where: { id: inscricaoId },
        data: {
          status: decisao,
          decididoEm: new Date(),
          decididoPor: (session.user as any).login || session.user.name || null,
        },
      });

      // nome do candidato para a auditoria
      const fichaC = await prisma.efetivo.findUnique({
        where: { id: insc.efetivoId },
        select: { postoGrad: true, nome: true, nomeGuerra: true },
      });
      const nomeCand = fichaC
        ? [fichaC.postoGrad || "", (fichaC.nomeGuerra || fichaC.nome || "")].filter(Boolean).join(" ").trim()
        : insc.efetivoId;
      await registrar({
        acao: decisao === "aprovado" ? "aprovar_joe" : "recusar_joe",
        alvo: insc.efetivoId,
        alvoNome: nomeCand,
        detalhe: `JOE: ${joe.evento}`,
      });

      return NextResponse.json({ ok: true });
    }

    /* ---------- ADMIN: encerrar / reabrir ---------- */
    if (acao === "encerrar" || acao === "reabrir") {
      if (!admin) return NextResponse.json({ error: "Apenas o P1" }, { status: 403 });
      await prisma.joe.update({
        where: { id: joeId },
        data: { status: acao === "encerrar" ? "encerrada" : "aberta" },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acao desconhecida" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/joe/[id]]", err);
    return NextResponse.json({ error: "Falha ao processar acao" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P1 pode excluir" }, { status: 403 });
  }
  try {
    await prisma.joe.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/joe/[id]]", err);
    return NextResponse.json({ error: "Falha ao excluir" }, { status: 500 });
  }
}
