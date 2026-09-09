import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerHistorico, salvarHistorico, listarHistoricos } from "@/lib/historicoDb";
import {
  normalizar, daFicha, VAZIO,
  sugerirPromocoes, sugerirFerias, sugerirLicencaPremio, sugerirJms,
  type FichaHistorico,
} from "@/lib/historicoPolicial";

export const dynamic = "force-dynamic";

/* /api/historico
   GET            -> quem já tem histórico começado (para a tela listar)
   GET ?id=...    -> { dados, ficha, sugestoes } de um militar
   PUT ?id=...    -> salva o que o P/1 escreveu

   As SUGESTÕES vêm do que o SIGEP já sabe (promoções lançadas, férias e
   licença-prêmio das equipes, JMS da ficha) com o número do boletim EM
   BRANCO — o sistema não guarda boletim, e inventar número em documento
   funcional seria pior do que deixar a lacuna à vista. */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

const SELECAO = {
  id: true, nome: true, nomeGuerra: true, postoGrad: true, numeroBarra: true, quadro: true,
  matricula: true, rg: true, cpf: true, dataNasc: true, dataIncorp: true, estadoCivil: true,
  naturalidade: true, naturalidadeUF: true, nomePai: true, nomeMae: true, tipoSanguineo: true,
  fatorRH: true, grauEscolaridade: true, funcao: true, lotacao: true,
  jmsDataInicio: true, jmsDataRetorno: true, jmsMotivo: true,
} as const;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") || "";

  /* Sem id: a lista de quem já tem histórico, com o nome do militar. */
  if (!id) {
    try {
      const linhas = await listarHistoricos();
      const ids = linhas.map((l) => l.efetivoId);
      const fichas = ids.length
        ? await prisma.efetivo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, nomeGuerra: true, postoGrad: true } })
        : [];
      const mapa = new Map(fichas.map((f) => [f.id, f]));
      return NextResponse.json({
        itens: linhas.map((l) => {
          const f = mapa.get(l.efetivoId);
          return {
            efetivoId: l.efetivoId,
            nome: (f?.nomeGuerra || f?.nome || "").trim(),
            postoGrad: f?.postoGrad || "",
            atualizadoEm: l.atualizadoEm,
            atualizadoPor: l.atualizadoPor || "",
          };
        }),
      });
    } catch (err) {
      console.error("[GET /api/historico]", err);
      return NextResponse.json({ error: "Falha ao listar." }, { status: 500 });
    }
  }

  try {
    const f = await prisma.efetivo.findUnique({ where: { id }, select: SELECAO });
    if (!f) return NextResponse.json({ error: "Militar não encontrado." }, { status: 404 });

    const linha = await lerHistorico(id);
    const dados = linha ? normalizar(JSON.parse(linha.dados || "{}")) : VAZIO;

    /* ---- sugestões do que o sistema já sabe ---- */
    let promocoes: string[] = [];
    try {
      const lancadas: any[] = await prisma.$queryRawUnsafe(
        `SELECT "Posto_Novo" AS "postoNovo", "Data_Promocao" AS "dataPromocao", "Referencia" AS "referencia"
           FROM "promocoes_lancadas"
          WHERE "Efetivo_ID" = $1 AND "Desfeito_Em" IS NULL
          ORDER BY "Data_Promocao"`, id);
      promocoes = sugerirPromocoes(lancadas);
    } catch { /* a tabela pode não existir ainda; sem sugestão */ }

    let ferias: string[] = [];
    try {
      const membros = await prisma.membroFerias.findMany({
        where: { idPmma: id },
        select: { anoGozo: true, equipe: { select: { periodo1Inicio: true, periodo1Fim: true, periodo2Inicio: true, periodo2Fim: true } } },
      });
      ferias = sugerirFerias(membros.flatMap((m) => {
        const e = m.equipe;
        const p: { ano: string; inicio: string; fim: string }[] = [];
        if (e?.periodo1Inicio) p.push({ ano: m.anoGozo, inicio: e.periodo1Inicio, fim: e.periodo1Fim || "" });
        if (e?.periodo2Inicio) p.push({ ano: m.anoGozo, inicio: e.periodo2Inicio, fim: e.periodo2Fim || "" });
        if (!p.length) p.push({ ano: m.anoGozo, inicio: "", fim: "" });
        return p;
      }));
    } catch { /* sem plano de férias, sem sugestão */ }

    let lp: string[] = [];
    try {
      const membros = await prisma.membroLicencaPremio.findMany({
        where: { idPmma: id },
        select: { anoGozo: true, equipe: { select: { periodoInicio: true, periodoFim: true } } },
      });
      lp = sugerirLicencaPremio(membros.map((m) => ({
        ano: m.anoGozo, inicio: m.equipe?.periodoInicio || "", fim: m.equipe?.periodoFim || "",
      })));
    } catch { /* idem */ }

    return NextResponse.json({
      dados,
      ficha: daFicha(f as FichaHistorico),
      postoGrad: f.postoGrad || "",
      atualizadoEm: linha?.atualizado_em || null,
      atualizadoPor: linha?.atualizado_por || "",
      sugestoes: [
        { chave: "IV", rotulo: "Promoções lançadas no SIGEP", linhas: promocoes },
        { chave: "VII.ferias", rotulo: "Férias do plano do SIGEP", linhas: ferias },
        { chave: "VII.lp", rotulo: "Licença-prêmio do SIGEP", linhas: lp },
        { chave: "VIII.dispensa", rotulo: "JMS da ficha", linhas: sugerirJms(f) },
      ].filter((s) => s.linhas.length > 0),
    });
  } catch (err) {
    console.error("[GET /api/historico?id]", err);
    return NextResponse.json({ error: "Falha ao carregar o histórico." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(u.perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const b = await req.json();
    await salvarHistorico(id, normalizar(b?.dados), String(u.name || ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/historico]", err);
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
