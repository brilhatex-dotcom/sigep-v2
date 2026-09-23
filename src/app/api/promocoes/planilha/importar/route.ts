import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { registrar } from "@/lib/auditoria";
import { idsInativos, semInativos } from "@/lib/inativos";
import { lerPlanilhaAnterior, casar, planejar } from "@/lib/planilhaImportar";
import { salvarDadosPromocao } from "@/lib/dadosPromocao";

export const dynamic = "force-dynamic";

/* =========================================================================
   POST /api/promocoes/planilha/importar  (multipart: arquivo, aplicar, substituir)

   Lê uma Planilha Padrão já preenchida (a de agosto/2026, por exemplo) e
   aproveita o que o sistema ainda não sabe — regras em src/lib/planilhaImportar.ts.

   Em DOIS passos, de propósito:
     aplicar=0 -> só confere: quantas linhas casaram, com quem, o que iria
                  para a ficha e quem não foi encontrado. Nada é gravado.
     aplicar=1 -> grava na ficha de cada militar. Com substituir=1, o que a
                  planilha traz passa por cima dos Dados para Promoção já
                  preenchidos (planilha mais nova); sem ele, só completa.
   Mexer em ficha de duzentos militares a partir de um Excel sem o P/1 ver
   antes o que vai acontecer seria pedir para errar em lote.

   O arquivo é lido em memória e descartado.
   ========================================================================= */

const NOME_CAMPO: Record<string, string> = {
  dataIncorp: "data de inclusão", grauEscolaridade: "escolaridade", numeroBarra: "número",
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const login = String(u.login || u.name || "");

  try {
    const form = await req.formData();
    const arq = form.get("arquivo");
    const aplicar = form.get("aplicar") === "1";
    const substituir = form.get("substituir") === "1";
    if (!arq || typeof arq === "string") return NextResponse.json({ error: "Envie o arquivo .xlsx." }, { status: 400 });
    if (!/\.xlsx$/i.test(arq.name)) return NextResponse.json({ error: "O arquivo precisa ser .xlsx (Excel)." }, { status: 400 });
    if (arq.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Arquivo grande demais (máx. 4 MB)." }, { status: 400 });

    let lido;
    try { lido = await lerPlanilhaAnterior(Buffer.from(await arq.arrayBuffer())); }
    catch { return NextResponse.json({ error: "Não consegui abrir o arquivo. Ele é um .xlsx do Excel?" }, { status: 400 }); }
    if (!lido.linhas.length) {
      return NextResponse.json({ error: "Não achei a tabela: nenhuma aba tem o cabeçalho com GRAD e NOME." }, { status: 400 });
    }

    const efetivo = semInativos(
      await prisma.efetivo.findMany({
        select: { id: true, nome: true, matricula: true, numeroBarra: true, dataIncorp: true, grauEscolaridade: true, postoGrad: true, nomeGuerra: true },
      }),
      await idsInativos(),
    );
    const { casadas, sobras } = casar(lido.linhas, efetivo);
    const plano = planejar(casadas);

    const fichaPorCampo: Record<string, number> = {};
    for (const p of plano) for (const k of Object.keys(p.ficha)) fichaPorCampo[NOME_CAMPO[k] || k] = (fichaPorCampo[NOME_CAMPO[k] || k] || 0) + 1;
    const porComo = casadas.reduce<Record<string, number>>((a, c) => { a[c.por] = (a[c.por] || 0) + 1; return a; }, {});

    const resumo = {
      arquivo: arq.name,
      aba: lido.aba,
      linhas: lido.linhas.length,
      casadas: casadas.length,
      porComo,
      naoEncontrados: sobras.map((l) => ({ linha: l.linha, grad: l.valores.grad || "", nome: l.valores.nome || "" })),
      ficha: fichaPorCampo,
      promocao: plano.filter((p) => Object.keys(p.promocao).length).length,
      // os casados por NOME, para o P/1 conferir: é o único casamento sem número
      porNome: casadas.filter((c) => c.por === "nome").map((c) => {
        const e = efetivo.find((x) => x.id === c.militar.id);
        return { linha: c.linha.linha, planilha: c.linha.valores.nome || "", sistema: [e?.postoGrad, e?.nome].filter(Boolean).join(" ") };
      }),
    };

    if (!aplicar) return NextResponse.json({ ok: true, aplicado: false, resumo });

    // ---- grava: dados funcionais só onde estão vazios (o plano já garante) e os Dados para Promoção ----
    const agora = new Date().toISOString();
    let fichas = 0;
    for (const p of plano) {
      if (!Object.keys(p.ficha).length) continue;
      await prisma.efetivo.update({ where: { id: p.efetivoId }, data: { ...p.ficha, ultimaAtualizacao: agora } });
      fichas++;
    }
    const promocoes = await salvarDadosPromocao(
      plano.filter((p) => Object.keys(p.promocao).length).map((p) => ({ efetivoId: p.efetivoId, dados: p.promocao })),
      substituir ? "atualizar" : "completar", `Importado de ${arq.name}`, login,
    );
    await registrar({
      acao: "planilha_importar", alvo: arq.name,
      detalhe: `Importou a planilha "${arq.name}": ${casadas.length} de ${lido.linhas.length} linha(s) casadas; ` +
        `${fichas} ficha(s) completada(s) (${Object.entries(fichaPorCampo).map(([k, n]) => `${k}: ${n}`).join(", ") || "nada vazio"}); ` +
        `Dados para Promoção gravados em ${promocoes} ficha(s)${substituir ? " (substituindo)" : " (só campos vazios)"}.`,
    });
    return NextResponse.json({ ok: true, aplicado: true, resumo: { ...resumo, fichasAtualizadas: fichas, promocoesGravadas: promocoes } });
  } catch (err) {
    console.error("[POST /api/promocoes/planilha/importar]", err);
    return NextResponse.json({ error: "Falha ao importar a planilha." }, { status: 503 });
  }
}
