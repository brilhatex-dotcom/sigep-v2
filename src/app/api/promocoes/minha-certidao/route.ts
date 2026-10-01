import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { acessoCertidao } from "@/lib/certidaoP1Acesso";
import {
  lerEstado, emitir, editar, restaurar, hojeISO, linhasCertidaoP1, type CamposCertidao,
} from "@/lib/certidaoP1Db";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/minha-certidao — a declaração individual do PRÓPRIO
   militar, para quem concorre pela CPOPM (oficiais e subtenentes).

   GET                          -> { pode, periodo, linha }  (linha: null se
                                   não houver período ou ficha)
   POST { acao: "emitir" }      -> gera a dele, com a data de hoje
   POST { acao: "editar", campos } -> ajusta os dados que saem no documento
                                   (nome, posto por extenso, quadro, matrícula,
                                   Id, regiões, local, data)
   POST { acao: "restaurar" }   -> volta aos dados da ficha

   É o mesmo registro que o painel do P/1 vê: o que um ajusta, o outro vê.
   ========================================================================= */

async function contexto() {
  const s = await acessoCertidao(null);
  if (!s?.refEfetivo) return { s, efetivoId: null as string | null };
  const a = await acessoCertidao(s.refEfetivo);
  return { s: a, efetivoId: s.refEfetivo };
}

async function resposta(periodo: { id: string; nome: string } | null, efetivoId: string, pode: boolean) {
  if (!periodo) return { pode, periodo: null, linha: null };
  const [linha] = await linhasCertidaoP1(periodo.id, [efetivoId], await lerEstado());
  return { pode, periodo, linha: linha ?? null };
}

export async function GET() {
  const { s, efetivoId } = await contexto();
  if (!s) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!efetivoId) return NextResponse.json({ pode: false, periodo: null, linha: null });
  const periodo = await periodoAtivo();
  try {
    return NextResponse.json(await resposta(periodo ? { id: periodo.id, nome: periodo.nome } : null, efetivoId, s.proprio));
  } catch (err) {
    console.error("[GET /api/promocoes/minha-certidao]", err);
    return NextResponse.json({ error: "Falha ao carregar." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { s, efetivoId } = await contexto();
  if (!s) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!efetivoId || !s.proprio) {
    return NextResponse.json({ error: "A declaração individual é para oficiais e subtenentes." }, { status: 403 });
  }
  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");
  try {
    const f = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { id: true, nome: true, nomeGuerra: true, postoGrad: true, matricula: true, quadro: true },
    });
    if (!f) return NextResponse.json({ error: "Ficha não encontrada." }, { status: 404 });

    if (acao === "emitir" || acao === "editar") {
      const campos = (b?.campos && typeof b.campos === "object" ? b.campos : {}) as Partial<CamposCertidao>;
      const data = typeof campos.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(campos.data) ? campos.data : hojeISO();
      await emitir(periodo.id, [efetivoId], data); // quem já tem fica com a dele
      if (acao === "editar") {
        const r = await editar(periodo.id, f, campos, { quem: s.login });
        if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
      }
      try {
        await registrar({
          acao: "certidao_p1_propria",
          alvo: efetivoId,
          alvoNome: periodo.nome,
          detalhe: acao === "emitir" ? "Militar gerou a própria declaração individual" : "Militar ajustou a própria declaração individual",
        });
      } catch {}
    } else if (acao === "restaurar") {
      await restaurar(periodo.id, efetivoId);
    } else {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    return NextResponse.json(await resposta({ id: periodo.id, nome: periodo.nome }, efetivoId, true));
  } catch (err) {
    console.error("[POST /api/promocoes/minha-certidao]", err);
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
