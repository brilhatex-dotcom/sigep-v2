import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { COLUNAS } from "@/lib/planilhaPadrao";
import { prisma } from "@/lib/prisma";
import { carregarPlanilha, colunaEditavel, salvarEmLote, salvarManual } from "@/lib/planilhaPadraoDb";
import { definirCampoPromocao, ehCampoPromocao, salvarDadosPromocao } from "@/lib/dadosPromocao";

/* ONDE cada correção feita nesta tela é gravada.

   A planilha é o espelho da ficha no dia da promoção. Então, quando o P/1
   acha um dado faltando ou errado aqui, a correção vai para a FICHA do
   militar — e já fica certa para a próxima promoção:
     · promoções, cursos, elogios, medalhas, conceito, comportamento, QPMP
         -> "Dados para Promoção" da ficha (src/lib/dadosPromocao.ts);
     · instrução, inclusão, número -> a própria ficha do efetivo.
   Só o que vale para ESTE ciclo fica gravado só na planilha do período:
   certidões, situação jurídica e situação administrativa. */
const NA_FICHA_EFETIVO: Record<string, "grauEscolaridade" | "dataIncorp" | "numeroBarra"> = {
  instrucao: "grauEscolaridade", incl: "dataIncorp", num: "numeroBarra",
};
const vaiParaFicha = (chave: string) => ehCampoPromocao(chave) || chave in NA_FICHA_EFETIVO;

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/planilha — a Planilha Padrão do período ativo.

   GET  -> { periodo, colunas, linhas, resumo }  (só quem mandou documentação)
   POST -> { chave, valor }  preenche os em branco de uma coluna
   PUT -> { efetivoId, chave, valor }  grava o que o P/1 escreveu numa célula
          — na ficha do militar ou só na planilha do período (ver abaixo);
          valor null devolve a célula ao cálculo automático

   Só para quem responde pela conferência — Chefe e Auxiliares do P/1, ou os
   admins enquanto não houver Chefe cadastrado (a regra de podeVerP1). A
   planilha junta a situação jurídica e administrativa de duzentos militares
   numa tela só: não é coisa para ficar aberta a qualquer login.
   ========================================================================= */

async function autorizado() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) return null;
  return { login: String(u.login || u.name || "") };
}

export async function GET() {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const linhas = await carregarPlanilha(periodo.id);
    const prontas = linhas.filter((l) => l.pendencias.length === 0).length;
    return NextResponse.json({
      periodo: { id: periodo.id, nome: periodo.nome },
      colunas: COLUNAS.map((c) => ({ ...c, naFicha: vaiParaFicha(c.chave) })),
      linhas,
      resumo: { total: linhas.length, prontas, pendentes: linhas.length - prontas },
    });
  } catch (err) {
    console.error("[GET /api/promocoes/planilha]", err);
    return NextResponse.json({ error: "Falha ao montar a planilha." }, { status: 503 });
  }
}

/* POST { chave, valor, grads? } — preenche a coluna de quem ainda está em
   BRANCO nela. Nunca passa por cima do que já tem valor, seja calculado pelo
   sistema, seja escrito pelo P/1: é o "MB para todo mundo que falta", não um
   apagador. `grads` (siglas: CB, 3SGT...) restringe a algumas graduações. */
export async function POST(req: Request) {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const b = await req.json();
    const chave = String(b?.chave || "").trim();
    const valor = String(b?.valor ?? "").trim();
    const grads: string[] = Array.isArray(b?.grads) ? b.grads.map(String) : [];
    if (!colunaEditavel(chave)) {
      return NextResponse.json({ error: "Esta coluna vem da ficha do militar — corrija lá." }, { status: 400 });
    }
    if (!valor) return NextResponse.json({ error: "Diga o que escrever." }, { status: 400 });
    if (chave in NA_FICHA_EFETIVO) {
      return NextResponse.json({ error: "Instrução, inclusão e número são de cada um: corrija militar por militar." }, { status: 400 });
    }

    const linhas = await carregarPlanilha(periodo.id);
    const alvo = linhas
      .filter((l) => !grads.length || grads.includes(l.celulas.grad.valor))
      .filter((l) => !l.celulas[chave]?.valor)
      .map((l) => l.efetivoId);
    let n = 0;
    if (alvo.length && ehCampoPromocao(chave)) {
      // vai para a ficha de cada um, só onde o campo está vazio
      await salvarDadosPromocao(alvo.map((id) => ({ efetivoId: id, dados: { [chave]: valor } })), "completar", "Preenchido em lote na Planilha Padrão", quem.login);
      n = alvo.length;
    } else if (alvo.length) {
      n = await salvarEmLote(periodo.id, alvo, chave, valor, quem.login);
    }

    const titulo = COLUNAS.find((c) => c.chave === chave)?.titulo || chave;
    if (n) {
      await registrar({
        acao: "planilha_padrao_lote", alvo: periodo.id,
        detalhe: `Preencheu "${titulo}" = ${valor.slice(0, 60)} em ${n} militar(es) que estavam em branco (${periodo.nome}).`,
      });
    }
    return NextResponse.json({ ok: true, preenchidos: n });
  } catch (err) {
    console.error("[POST /api/promocoes/planilha]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const b = await req.json();
    const efetivoId = String(b?.efetivoId || "").trim();
    const chave = String(b?.chave || "").trim();
    const valor = b?.valor === null ? null : String(b?.valor ?? "");
    if (!efetivoId) return NextResponse.json({ error: "Sem o militar." }, { status: 400 });
    if (!colunaEditavel(chave)) {
      return NextResponse.json({ error: "Esta coluna vem da ficha do militar — corrija lá." }, { status: 400 });
    }

    const titulo = COLUNAS.find((c) => c.chave === chave)?.titulo || chave;

    // valor null é o ↺ ("voltar ao cálculo"): só tira a correção desta
    // planilha — nunca apaga nada da ficha
    if (vaiParaFicha(chave) && valor !== null) {
      const texto = (valor ?? "").trim();
      if (chave in NA_FICHA_EFETIVO) {
        const campo = NA_FICHA_EFETIVO[chave];
        if (campo === "dataIncorp" && texto && !/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
          return NextResponse.json({ error: "Inclusão no formato dd/mm/aaaa." }, { status: 400 });
        }
        await prisma.efetivo.update({
          where: { id: efetivoId },
          data: { [campo]: texto || null, ultimaAtualizacao: new Date().toISOString() },
        });
      } else {
        await definirCampoPromocao(efetivoId, chave, texto, quem.login);
      }
      /* Se havia uma correção antiga só desta planilha nessa coluna, ela
         sai — senão ela continuaria tapando o que acabou de ir para a ficha. */
      await salvarManual(periodo.id, efetivoId, chave, null, quem.login);
      await registrar({
        acao: "planilha_padrao_ficha", alvo: efetivoId,
        detalhe: `Corrigiu na ficha, pela Planilha Padrão, "${titulo}": ${texto.slice(0, 120) || "(apagado)"}`,
      });
      return NextResponse.json({ ok: true, gravadoNaFicha: true });
    }

    await salvarManual(periodo.id, efetivoId, chave, valor, quem.login);
    await registrar({
      acao: "planilha_padrao_editar", alvo: efetivoId,
      detalhe: valor === null
        ? `Devolveu "${titulo}" ao cálculo automático na Planilha Padrão (${periodo.nome}).`
        : `Preencheu "${titulo}" na Planilha Padrão (${periodo.nome}): ${valor.slice(0, 120)}`,
    });
    return NextResponse.json({ ok: true, gravadoNaFicha: false });
  } catch (err) {
    console.error("[PUT /api/promocoes/planilha]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}
