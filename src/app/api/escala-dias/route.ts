import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aplicarPermutasSeVencido } from "@/lib/permutaPedidos";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { lerConfig, guardarAnterior, objetoDe } from "@/lib/escalaGuarda";
import { assinaturaDoValor } from "@/lib/escalaVersao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-dias
   Guarda os DIAS ja gerados/editados da escala diaria (o que antes ficava
   no localStorage "sigep_escalas") na tabela Config, chave "escala_dias".
   Assim os dias salvos aparecem em todos os computadores.
   GET  -> { escalas: Record<dataISO, Escala> }
   POST -> salva { escalas } (somente admin/P1)
   ========================================================================= */

const CHAVE = "escala_dias";

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  // Só na SEDE: lança na escala as permutas já autorizadas que ainda não
  // entraram. As permutas são da sede — não se aplicam à escala do interior.
  /* Com freio: a leitura passou a ser frequente e varrer a tabela de permutas
     toda vez era o peso maior deste caminho. Uma vez por minuto basta. */
  if (ctx.escopo === null) {
    try { await aplicarPermutasSeVencido(); } catch { /* nao bloqueia a escala */ }
  }

  const lida = await lerConfig(ctx.chave);
  /* Falha de banco NÃO pode sair daqui como escala vazia. Antes saía "{}" com
     HTTP 200, e a tela entendia que não havia mais nenhum escalado: apagava os
     nomes e, na edição seguinte, gravava esse vazio por cima. Agora é erro
     declarado — a tela mantém o que está na frente do usuário e avisa. */
  if (!lida.ok) {
    console.error("[GET /api/escala-dias]", lida.erro);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
  /* A assinatura vai junto para a tela saber exatamente o que tem na mão e
     poder comparar com /api/escala-versao sem baixar tudo de novo. */
  if (!lida.valor) return NextResponse.json({ escalas: {}, versao: assinaturaDoValor(null) });
  try {
    return NextResponse.json({ escalas: JSON.parse(lida.valor), versao: assinaturaDoValor(lida.valor) });
  } catch (err) {
    // Existe conteúdo gravado, mas ilegível: também é erro, não "vazio".
    console.error("[GET /api/escala-dias] valor corrompido", err);
    return NextResponse.json({ error: "Escala gravada ilegivel" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { b = null; }
  if (!b || typeof b.escalas !== "object" || b.escalas === null || Array.isArray(b.escalas)) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const lida = await lerConfig(ctx.chave);
  /* Sem conseguir ler o que já está gravado não dá para saber se esta gravação
     destrói alguma coisa — então não grava. */
  if (!lida.ok) {
    console.error("[POST /api/escala-dias]", lida.erro);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
  const nAntes = Object.keys(objetoDe(lida.valor)).length;
  const nDepois = Object.keys(b.escalas).length;

  /* Apagar TODOS os dias de uma vez não é uma edição de verdade: é uma tela
     que carregou vazia gravando o próprio vazio por cima. Apagar UM dia passa
     normalmente — o que não passa é a escala inteira sumir numa gravação só. */
  if (nAntes > 0 && nDepois === 0) {
    console.error(`[POST /api/escala-dias] recusado: apagaria ${nAntes} dia(s) de uma vez`);
    return NextResponse.json(
      { error: "Gravacao recusada: apagaria todos os dias da escala.", dias: nAntes },
      { status: 409 },
    );
  }

  try {
    // Encolheu? Guarda o anterior antes de trocar, para dar de onde recuperar.
    if (nDepois < nAntes) await guardarAnterior(ctx.chave, lida.valor);
    const valor = JSON.stringify(b.escalas);
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Dias gerados/editados da Escala de Servico" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-dias]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
