import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { ehCpopm } from "@/lib/certidoes";
import { registrar } from "@/lib/auditoria";
import {
  lerEstado, emitir, remover, hojeISO, emitidasDoPeriodo, linhasCertidaoP1, editar, restaurar, type CamposCertidao,
} from "@/lib/certidaoP1Db";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/certidao-p1 — DECLARAÇÃO INDIVIDUAL da promoção (oficiais
   e subtenentes), pelo painel do P/1

   GET  ?ids=a,b   -> { periodo, hoje, oficiaisDoPeriodo, linhas }
                      linhas = quem já tem declaração gerada no período + os
                      ids pedidos (os que o P/1 acabou de pôr na lista)
   POST { acao: "emitir", efetivoIds, data }  -> gera a de quem ainda não tem
   POST { acao: "remover", efetivoId }        -> tira da lista
   POST { acao: "editar", efetivoId, campos }  -> muda os dados que saem no
                                                 documento; gera antes se
                                                 ainda não tinha
   POST { acao: "restaurar", efetivoId }       -> volta aos dados da ficha

   Só quem responde pelo P/1 (mesma regra da Planilha Padrão).
   ========================================================================= */

async function autorizado() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) return null;
  return { login: String(u.login || u.name || "") };
}

async function resposta(periodo: { id: string; nome: string }, ids: string[]) {
  const e = await lerEstado();

  // oficiais que estão no período (atalho "adicionar os oficiais")
  const participantes = await prisma.participantePromocao.findMany({
    where: { periodoId: periodo.id },
    select: { efetivoId: true },
  });
  const fichas = participantes.length
    ? await prisma.efetivo.findMany({
        where: { id: { in: participantes.map((p) => p.efetivoId) } },
        select: { id: true, postoGrad: true },
      })
    : [];
  // oficiais e subtenentes: os que concorrem pela CPOPM
  const oficiaisDoPeriodo = fichas.filter((f) => ehCpopm(f.postoGrad)).map((f) => f.id);

  const linhas = await linhasCertidaoP1(periodo.id, [...emitidasDoPeriodo(e, periodo.id), ...ids], e);
  return {
    periodo,
    hoje: hojeISO(),
    oficiaisDoPeriodo,
    linhas,
  };
}

export async function GET(req: Request) {
  if (!(await autorizado())) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  try {
    return NextResponse.json(await resposta({ id: periodo.id, nome: periodo.nome }, ids));
  } catch (err) {
    console.error("[GET /api/promocoes/certidao-p1]", err);
    return NextResponse.json({ error: "Falha ao carregar as declarações." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");
  try {
    if (acao === "emitir") {
      const ids: string[] = Array.isArray(b?.efetivoIds)
        ? b.efetivoIds.map((x: unknown) => String(x || "").trim()).filter(Boolean).slice(0, 200)
        : [];
      if (!ids.length) return NextResponse.json({ error: "Escolha ao menos um policial." }, { status: 400 });
      const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.data || "")) ? String(b.data) : hojeISO();

      // na ordem de antiguidade, como a lista aparece na tela
      const ordem = (await linhasCertidaoP1(periodo.id, ids, await lerEstado())).map((l) => l.efetivoId);
      await emitir(periodo.id, ordem, data);
      try {
        await registrar({
          acao: "certidao_p1_promocao",
          alvo: periodo.id,
          alvoNome: periodo.nome,
          detalhe: `${ordem.length} declaração(ões) individual(is) gerada(s)/conferida(s) por ${quem.login}`,
        });
      } catch {}
      return NextResponse.json(await resposta({ id: periodo.id, nome: periodo.nome }, ids));
    }

    if (acao === "remover") {
      const id = String(b?.efetivoId || "").trim();
      if (!id) return NextResponse.json({ error: "Policial não informado." }, { status: 400 });
      await remover(periodo.id, id);
      return NextResponse.json({ ok: true });
    }

    if (acao === "editar" || acao === "restaurar") {
      const id = String(b?.efetivoId || "").trim();
      const f = id
        ? await prisma.efetivo.findUnique({
            where: { id },
            select: { id: true, nome: true, nomeGuerra: true, postoGrad: true, matricula: true, quadro: true },
          })
        : null;
      if (!f) return NextResponse.json({ error: "Policial não encontrado." }, { status: 404 });
      if (acao === "restaurar") {
        await restaurar(periodo.id, f.id);
      } else {
        const campos = (b?.campos && typeof b.campos === "object" ? b.campos : {}) as Partial<CamposCertidao>;
        const dataNova = typeof campos.data === "string" ? campos.data : hojeISO();
        await emitir(periodo.id, [f.id], dataNova); // ainda não gerada: gera agora
        const r = await editar(periodo.id, f, campos, { quem: quem.login });
        if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
      }
      return NextResponse.json(await resposta({ id: periodo.id, nome: periodo.nome }, [f.id]));
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/promocoes/certidao-p1]", err);
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
