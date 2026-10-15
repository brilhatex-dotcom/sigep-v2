import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { registrar } from "@/lib/auditoria";
import { idsInativos, semInativos } from "@/lib/inativos";
import { cruzarComEfetivo, type LinhaLimite } from "@/lib/limiteQuantitativo";
import { apagarLimite, listarLimites, salvarLimite } from "@/lib/limiteQuantitativoDb";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/limite — o Limite Quantitativo da CPPPM, filtrado para o
   18º BPM.

   POST { arquivo, leitura }  guarda um PDF da CPPPM JÁ LIDO no navegador
                              (lerLimite, em lib/limiteQuantitativo.ts) — o
                              PDF não sobe, só as linhas
   GET                        os PDFs guardados, cada um já com "quem é nosso"
   DELETE ?chave=             tira um PDF

   Só o P/1 (Chefe/Auxiliares, ou admin sem Chefe cadastrado).
   ========================================================================= */

async function autorizado() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) return null;
  return { login: String(u.login || u.name || "") };
}

async function efetivoAtual() {
  return semInativos(
    await prisma.efetivo.findMany({
      select: { id: true, nome: true, nomeGuerra: true, matricula: true, numeroBarra: true, postoGrad: true, lotacao: true },
    }),
    await idsInativos(),
  );
}

const ORDEM_GRAD: Record<string, number> = { "1SGT": 1, "2SGT": 2, "3SGT": 3, CB: 4, SD: 5 };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// "dezembro de 2026" -> 202612, para ordenar
const ordemCiclo = (c: string) => {
  const m = c.match(/^(\S+) de (\d{4})$/);
  return m ? Number(m[2]) * 100 + (MESES.indexOf(m[1]) + 1) : 0;
};

export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  try {
    const [regs, efetivo] = await Promise.all([listarLimites(), efetivoAtual()]);
    const listas = regs
      .map((r) => ({
        chave: r.chave, ciclo: r.ciclo, gradOrigem: r.gradOrigem, gradDestino: r.gradDestino, titulo: r.titulo,
        rotuloData: r.rotuloData, arquivo: r.arquivo, enviadoEm: r.enviadoEm, enviadoPor: r.enviadoPor,
        totalPdf: r.linhas.length, furos: r.furos,
        nossos: cruzarComEfetivo(r.linhas, efetivo),
      }))
      // ciclo mais novo primeiro; dentro dele, 1º Sgt -> Soldado
      .sort((a, b) => ordemCiclo(b.ciclo) - ordemCiclo(a.ciclo)
        || (ORDEM_GRAD[a.gradOrigem] || 9) - (ORDEM_GRAD[b.gradOrigem] || 9));
    return NextResponse.json({ listas }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/promocoes/limite]", err);
    return NextResponse.json({ error: "Falha ao ler o Limite Quantitativo." }, { status: 503 });
  }
}

const GRADS = new Set(["1SGT", "2SGT", "3SGT", "CB", "SD"]);
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/* O que veio do navegador é conferido aqui: forma das linhas, tamanho dos
   campos e quantidade. Um PDF de limite tem algumas centenas de linhas. */
function linhasValidas(v: unknown): LinhaLimite[] | null {
  if (!Array.isArray(v) || !v.length || v.length > 5000) return null;
  return v.map((l: any) => ({
    ord: Number.isInteger(l?.ord) ? l.ord : null,
    quadro: txt(l?.quadro), opm: txt(l?.opm, 80), num: txt(l?.num, 20), nome: txt(l?.nome),
    matricula: txt(l?.matricula, 20), id: txt(l?.id, 20), data: txt(l?.data, 20),
  }));
}

export async function POST(req: Request) {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  try {
    const b = await req.json();
    const arquivo = txt(b?.arquivo, 200);
    const l = b?.leitura || {};
    const linhas = linhasValidas(l.linhas);
    const gradOrigem = txt(l.gradOrigem, 10);
    if (!linhas || !GRADS.has(gradOrigem)) {
      return NextResponse.json({
        error: `${arquivo || "Arquivo"}: não parece um Limite Quantitativo da CPPPM (não achei o título "LIMITE QUANTITATIVO DOS ... PARA AS PROMOÇÕES" ou a tabela).`,
      }, { status: 400 });
    }
    const furos = Array.isArray(l.furos)
      ? l.furos.slice(0, 50).map((f: any) => ({ quadro: txt(f?.quadro), faltam: Array.isArray(f?.faltam) ? f.faltam.filter(Number.isInteger).slice(0, 200) : [] }))
      : [];
    const ciclo = txt(l.ciclo, 40);

    const chave = await salvarLimite({
      ciclo, gradOrigem, gradDestino: txt(l.gradDestino, 60), titulo: txt(l.titulo, 300),
      rotuloData: txt(l.rotuloData, 40), arquivo, linhas, furos, enviadoPor: quem.login,
    });
    const nossos = cruzarComEfetivo(linhas, await efetivoAtual());
    await registrar({
      acao: "limite_quantitativo_enviar", alvo: chave,
      detalhe: `Subiu o Limite Quantitativo ${gradOrigem} (${ciclo}): ${linhas.length} no PDF, ${nossos.length} do 18º BPM.`,
    });
    return NextResponse.json({ ok: true, chave, gradOrigem, ciclo, totalPdf: linhas.length, nossos: nossos.length, furos });
  } catch (err) {
    console.error("[POST /api/promocoes/limite]", err);
    return NextResponse.json({ error: "Falha ao guardar o Limite Quantitativo." }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const quem = await autorizado();
  if (!quem) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  const chave = new URL(req.url).searchParams.get("chave") || "";
  if (!chave) return NextResponse.json({ error: "Sem a chave." }, { status: 400 });
  try {
    await apagarLimite(chave);
    await registrar({ acao: "limite_quantitativo_apagar", alvo: chave, detalhe: `Tirou o Limite Quantitativo ${chave}.` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/promocoes/limite]", err);
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 503 });
  }
}
