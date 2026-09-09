import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { lerConfig, guardarAnterior, objetoDe, quantosNoCadastro } from "@/lib/escalaGuarda";
import { assinaturaDoValor } from "@/lib/escalaVersao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-config
   Guarda a configuracao do motor da escala (pools de rodizio, equipes ROTEM,
   afastamentos e datas de referencia) na tabela Config, chave "escala_cadastro".
   Assim as equipes ficam iguais em todos os computadores.
   GET  -> { cad: Cadastro | null }
   POST -> salva { cad } (somente admin/P1)
   ========================================================================= */

const CHAVE = "escala_cadastro";

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const lida = await lerConfig(ctx.chave);
  /* Mesmo cuidado dos dias, e aqui o estrago era ainda maior: "cad: null" com
     HTTP 200 fazia a tela ficar com as equipes de EXEMPLO em vez das de
     verdade — nenhum nome conhecido na folha do dia. */
  if (!lida.ok) {
    console.error("[GET /api/escala-config]", lida.erro);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
  if (!lida.valor) return NextResponse.json({ cad: null, versao: assinaturaDoValor(null) });
  try {
    return NextResponse.json({ cad: JSON.parse(lida.valor), versao: assinaturaDoValor(lida.valor) });
  } catch (err) {
    console.error("[GET /api/escala-config] valor corrompido", err);
    return NextResponse.json({ error: "Configuracao gravada ilegivel" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { b = null; }
  if (!b || typeof b.cad !== "object" || b.cad === null || Array.isArray(b.cad)) {
    return NextResponse.json({ error: "Configuracao invalida" }, { status: 400 });
  }

  const lida = await lerConfig(ctx.chave);
  if (!lida.ok) {
    console.error("[POST /api/escala-config]", lida.erro);
    return NextResponse.json({ error: "Banco de dados indisponivel" }, { status: 503 });
  }
  const nAntes = quantosNoCadastro(objetoDe(lida.valor));
  const nDepois = quantosNoCadastro(b.cad);

  /* Zerar as equipes de uma vez é sempre acidente: a tela carregou com o
     exemplo (ou vazia) e está gravando isso por cima do efetivo real. Tirar
     militares um a um continua funcionando. */
  if (nAntes > 0 && nDepois === 0) {
    console.error(`[POST /api/escala-config] recusado: apagaria ${nAntes} nome(s) das equipes`);
    return NextResponse.json(
      { error: "Gravacao recusada: apagaria todas as equipes.", nomes: nAntes },
      { status: 409 },
    );
  }

  try {
    if (nDepois < nAntes) await guardarAnterior(ctx.chave, lida.valor);
    const valor = JSON.stringify(b.cad);
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Equipes/afastamentos do motor da Escala de Servico" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-config]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
