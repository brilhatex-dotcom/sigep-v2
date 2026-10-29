import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import type { QuemPlano } from "@/lib/planoFeriasXlsx";
import { dadosDoPlano, QUEM, ROTULO } from "@/lib/planoFeriasDados";
import { gerarPlanoFeriasHtml } from "@/lib/planoFeriasHtml";

export const dynamic = "force-dynamic";

/* GET /api/ferias/impressao?ano=2027&quem=oficiais|pracas|todos
   O Plano de Férias pronto para IMPRIMIR / salvar em PDF, no mesmo papel do
   Excel (lib/planoFeriasHtml) e com os mesmos dados (lib/planoFeriasDados).
   Abre numa aba nova e chama a impressão sozinho. Só o P/1. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const ano = String(sp.get("ano") || "").trim();
  if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "Informe o ano (AAAA)." }, { status: 400 });
  const quem: QuemPlano = QUEM.includes(sp.get("quem") as QuemPlano) ? (sp.get("quem") as QuemPlano) : "todos";

  try {
    const dados = await dadosDoPlano(ano, quem);
    if (!dados) {
      return new NextResponse(`<p style="font-family:sans-serif">Não há plano de férias para ${ano}.</p>`, {
        status: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const html = gerarPlanoFeriasHtml(dados.plano, dados.opcoes);
    const total = dados.plano.reduce((s, e) => s + e.membros.length, 0);
    await registrar({
      acao: "ferias_plano_impressao", alvo: ano,
      detalhe: `Imprimiu o Plano de Férias ${ano} (${ROTULO[quem]}) com ${total} militar(es).`,
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/ferias/impressao]", err);
    return NextResponse.json({ error: "Falha ao montar a impressão do plano." }, { status: 500 });
  }
}
