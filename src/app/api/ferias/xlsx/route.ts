import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { gerarPlanoFeriasXlsx, type QuemPlano } from "@/lib/planoFeriasXlsx";
import { dadosDoPlano, QUEM, ROTULO, SUFIXO } from "@/lib/planoFeriasDados";

export const dynamic = "force-dynamic";
/* GET /api/ferias/xlsx?ano=2027&quem=oficiais|pracas|todos
   O Plano de Férias do ano em Excel: só os oficiais, só as praças ou todos.

   Papel no padrão da Escala de Serviço — mesmos brasões (Config
   "escala_brasoes", a do Batalhão) e o mesmo texto da organização. Quem
   assina vem da aba "Chefe do P1" da escala (Config "escala_chefe_p1"):
   praças com o VISTO do Cmt em cima e o Chefe do P/1 no fim; oficiais com
   o Cmt da unidade no fim.

   O layout segue os modelos do P/1: as praças em uma tabela por equipe
   (com o período de cada uma); os oficiais numa tabela só, por hierarquia.
   "todos" = as duas abas no mesmo arquivo.

   Só o administrador (P/1): o arquivo leva a imagem da assinatura do Cmt. */

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
    if (!dados) return NextResponse.json({ error: `Não há plano de férias para ${ano}.` }, { status: 404 });
    const { plano, opcoes } = dados;
    const buf = await gerarPlanoFeriasXlsx(plano, opcoes);

    const total = plano.reduce((s, e) => s + e.membros.length, 0);
    await registrar({
      acao: "ferias_plano_excel", alvo: ano,
      detalhe: `Baixou o Plano de Férias ${ano} em Excel (${ROTULO[quem]}) com ${total} militar(es).`,
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Plano_Ferias_${ano}_${SUFIXO[quem]}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/ferias/xlsx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Excel do plano." }, { status: 500 });
  }
}
