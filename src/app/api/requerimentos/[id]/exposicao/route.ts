import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { ehPermanenciaArma } from "@/lib/requerimentos";
import { montarAfastamentos } from "@/lib/afastamentosPlano";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { hojeISO } from "@/lib/gerarParecerArma";
import { gerarExposicaoArmaDocx, periodoDaExposicao } from "@/lib/gerarExposicaoArma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/requerimentos/[id]/exposicao
   Exposição de motivos do requerimento de AUTORIZAÇÃO DE PERMANÊNCIA DE
   ARMAMENTO (ficar com a arma cautelada nas férias) — o anexo do pedido.

     GET ?sugestao=1          -> { inicio, fim } do plano de férias do militar
     GET ?inicio=..&fim=..    -> o DOCX pronto (datas aaaa-mm-dd; sem elas,
                                 usa o período do plano; sem plano, linhas em branco)

   Montado na hora a partir do requerimento, como a declaração de parecer
   favorável da aquisição de arma. Dono ou admin.
   ========================================================================= */

const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/* Período de férias do militar: plano (equipe), férias avulsas e adiamentos —
   a mesma montagem que tira o militar da escala. */
async function feriasDoMilitar(idPmma: string): Promise<{ inicio: string; fim: string } | null> {
  const ano = new Date().getFullYear();
  const anos = [String(ano - 1), String(ano), String(ano + 1)];
  const q = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => { try { return await fn(); } catch { return []; } };
  const membros = await q(() => prisma.membroFerias.findMany({ where: { idPmma, anoGozo: { in: anos } } }));
  const equipes = membros.length
    ? await q(() => prisma.equipeFerias.findMany({
        where: { OR: membros.map((m) => ({ numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo })) },
      }))
    : [];
  let avulsas: any[] = [];
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
    const v = row?.valor ? JSON.parse(row.valor) : [];
    avulsas = Array.isArray(v) ? v.filter((a: any) => String(a?.idPmma || "") === idPmma) : [];
  } catch {}
  const adiados = await idsFeriasAdiadas().catch(() => new Set<string>());
  const af = montarAfastamentos({
    equipesFerias: equipes as any, membrosFerias: membros as any,
    equipesLicenca: [], membrosLicenca: [], avulsas, adiados,
  });
  return periodoDaExposicao(af, idPmma, hojeISO());
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ((session.user as any).perfil || "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | null;
  const url = new URL(req.url);

  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    if (!ehPermanenciaArma(r.modalidade)) {
      return NextResponse.json(
        { error: "A exposição de motivos só vale para o requerimento de autorização de permanência de armamento." },
        { status: 400 },
      );
    }

    const plano = await feriasDoMilitar(r.efetivoId);
    if (url.searchParams.get("sugestao")) {
      return NextResponse.json({ inicio: plano?.inicio || "", fim: plano?.fim || "" });
    }

    const inicio = iso(url.searchParams.get("inicio")) || plano?.inicio || "";
    const fim = iso(url.searchParams.get("fim")) || plano?.fim || "";
    const buffer = gerarExposicaoArmaDocx({
      postoGrad: r.postoGrad, nomeCompleto: r.nomeCompleto, matricula: r.matricula, inicio, fim,
    });

    try {
      await registrar({
        acao: "gerar_exposicao_arma", alvo: id, alvoNome: r.modalidade,
        detalhe: `Exposição de motivos gerada (férias ${inicio || "?"} a ${fim || "?"})`,
      });
    } catch {}

    const nomeArquivo = `Exposicao_Motivos_${(r.nomeCompleto || r.matricula || "militar")
      .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/[id]/exposicao]", err);
    return NextResponse.json({ error: "Falha ao gerar a exposição de motivos" }, { status: 500 });
  }
}
