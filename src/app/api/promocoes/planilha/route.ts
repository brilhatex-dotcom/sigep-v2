import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { COLUNAS } from "@/lib/planilhaPadrao";
import { carregarPlanilha, colunaEditavel, salvarManual } from "@/lib/planilhaPadraoDb";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/planilha — a Planilha Padrão do período ativo.

   GET -> { periodo, colunas, linhas, resumo }
   PUT -> { efetivoId, chave, valor }  grava o que o P/1 escreveu numa célula
          (valor null devolve a célula ao cálculo automático)

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
      colunas: COLUNAS,
      linhas,
      resumo: { total: linhas.length, prontas, pendentes: linhas.length - prontas },
    });
  } catch (err) {
    console.error("[GET /api/promocoes/planilha]", err);
    return NextResponse.json({ error: "Falha ao montar a planilha." }, { status: 503 });
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

    await salvarManual(periodo.id, efetivoId, chave, valor, quem.login);
    const titulo = COLUNAS.find((c) => c.chave === chave)?.titulo || chave;
    await registrar({
      acao: "planilha_padrao_editar", alvo: efetivoId,
      detalhe: valor === null
        ? `Devolveu "${titulo}" ao cálculo automático na Planilha Padrão (${periodo.nome}).`
        : `Preencheu "${titulo}" na Planilha Padrão (${periodo.nome}): ${valor.slice(0, 120)}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/promocoes/planilha]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}
