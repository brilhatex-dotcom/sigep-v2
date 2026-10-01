import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { ehOficial } from "@/lib/certidoes";
import { registrar } from "@/lib/auditoria";
import {
  lerEstado, emitir, remover, configurar, proximoNumero, anoAtual, hojeISO,
  emitidasDoPeriodo, linhasCertidaoP1,
} from "@/lib/certidaoP1Db";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/certidao-p1 — CERTIDÃO DO P/1 (nada consta) da promoção

   GET  ?ids=a,b   -> { periodo, portaria, ano, proximo, hoje, oficiaisDoPeriodo,
                        linhas }
                      linhas = quem já tem certidão emitida no período + os ids
                      pedidos (os que o P/1 acabou de pôr na lista)
   POST { acao: "emitir", efetivoIds, data }  -> numera quem ainda não tem
   POST { acao: "remover", efetivoId }        -> tira da lista
   POST { acao: "config", portaria?, proximo? } -> portaria do texto e o
                                                 próximo número do ano

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
  const ano = anoAtual();

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
  const oficiaisDoPeriodo = fichas.filter((f) => ehOficial(f.postoGrad)).map((f) => f.id);

  const linhas = await linhasCertidaoP1(periodo.id, [...emitidasDoPeriodo(e, periodo.id), ...ids], e);
  return {
    periodo,
    portaria: e.portaria,
    ano,
    proximo: proximoNumero(e, ano),
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
    return NextResponse.json({ error: "Falha ao carregar as certidões." }, { status: 500 });
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

      // numera na ordem de antiguidade, como a lista aparece na tela
      const ordem = (await linhasCertidaoP1(periodo.id, ids, await lerEstado())).map((l) => l.efetivoId);
      await emitir(periodo.id, ordem, data);
      try {
        await registrar({
          acao: "certidao_p1_promocao",
          alvo: periodo.id,
          alvoNome: periodo.nome,
          detalhe: `${ordem.length} certidão(ões) do P/1 emitida(s)/conferida(s) por ${quem.login}`,
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

    if (acao === "config") {
      const proximo = Number(b?.proximo);
      await configurar({
        portaria: typeof b?.portaria === "string" ? b.portaria : undefined,
        proximo: Number.isInteger(proximo) && proximo > 0 ? proximo : undefined,
        ano: anoAtual(),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/promocoes/certidao-p1]", err);
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
