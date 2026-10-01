import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { aplicarPermutasSeVencido } from "@/lib/permutaPedidos";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { lerConfig, contarChaves, guardarAnteriorNoBanco, gravarConfig } from "@/lib/escalaGuarda";
import {
  assinaturaDoValor, assinaturas, cabecalhosVersao, respostaNaoMudou, versaoQueONavegadorTem,
} from "@/lib/escalaVersao";

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

  /* ?so=versao — só a assinatura (md5 feito no banco, ~70 bytes). É o que o
     Mapa de uma unidade destacada pergunta de tempos em tempos para saber se
     precisa baixar a escala inteira de novo. */
  if (new URL(req.url).searchParams.get("so") === "versao") {
    try {
      const a = await assinaturas(ctx.chave, ctx.chave);
      return NextResponse.json({ versao: a[ctx.chave] ?? "" });
    } catch {
      return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
    }
  }

  // Só na SEDE: lança na escala as permutas já autorizadas que ainda não
  // entraram. As permutas são da sede — não se aplicam à escala do interior.
  /* Com freio: a leitura passou a ser frequente e varrer a tabela de permutas
     toda vez era o peso maior deste caminho. Uma vez por minuto basta. */
  if (ctx.escopo === null) {
    try { await aplicarPermutasSeVencido(); } catch { /* nao bloqueia a escala */ }
  }

  // o navegador já tem esta escala? 304, sem baixar de novo (ver escalaVersao)
  const igual = await versaoQueONavegadorTem(req, ctx.chave);
  if (igual) return respostaNaoMudou(igual);

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
     poder comparar com a assinatura do /api/pulso sem baixar tudo de novo. */
  if (!lida.valor) {
    const v = assinaturaDoValor(null);
    return NextResponse.json({ escalas: {}, versao: v }, { headers: cabecalhosVersao(v) });
  }
  try {
    const v = assinaturaDoValor(lida.valor);
    return NextResponse.json({ escalas: JSON.parse(lida.valor), versao: v }, { headers: cabecalhosVersao(v) });
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

  /* Quantos dias já estão gravados — contado no banco, sem baixar a escala
     (ver escalaGuarda). Sem conseguir saber isso não dá para saber se esta
     gravação destrói alguma coisa — então não grava. */
  const contagem = await contarChaves(ctx.chave);
  if (!contagem.ok) {
    console.error("[POST /api/escala-dias]", contagem.erro);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
  const nAntes = contagem.n;
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
    if (nDepois < nAntes) await guardarAnteriorNoBanco(ctx.chave);
    await gravarConfig(ctx.chave, JSON.stringify(b.escalas), "Dias gerados/editados da Escala de Servico");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-dias]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
