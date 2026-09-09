import { NextResponse } from "next/server";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { assinaturas } from "@/lib/escalaVersao";
import { aplicarPermutasSeVencido } from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-versao — "mudou alguma coisa?"

   Devolve só a assinatura dos dias e das equipes. É o que a tela pergunta de
   5 em 5 segundos; a escala inteira só é buscada quando uma delas muda.

   Uma consulta indexada e ~70 bytes de resposta, no lugar do documento
   inteiro quatro vezes por minuto.
   ========================================================================= */

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, "escala_dias");
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const chaveCad = ctx.escopo ? `escala_cadastro__${ctx.escopo}` : "escala_cadastro";

  /* As permutas autorizadas entram na escala aqui, no máximo uma vez por
     minuto (o freio está em aplicarPermutasSeVencido). Quando entram, a
     assinatura muda sozinha e as telas puxam a escala nova. */
  if (ctx.escopo === null) {
    try { await aplicarPermutasSeVencido(); } catch { /* nao bloqueia */ }
  }

  try {
    const a = await assinaturas(ctx.chave, chaveCad);
    return NextResponse.json({ dias: a[ctx.chave] ?? "", cad: a[chaveCad] ?? "" });
  } catch (err) {
    console.error("[GET /api/escala-versao]", err);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
}
