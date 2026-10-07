import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { foraDoPlano, incluirNoPlano } from "@/lib/feriasForaDoPlano";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* /api/ferias/fora-do-plano  (só o admin)
   GET  ?ano=2027                 -> { itens }  militares ativos fora do plano,
                                     cada um com a equipe sugerida
   POST { anoGozo, ids? }         -> inclui (todos, ou só os ids) nas equipes
                                     sugeridas. Para escolher OUTRA equipe, a
                                     tela usa /api/ferias/membros. */

async function admin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if (((session.user as any).perfil || "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const negado = await admin();
  if (negado) return negado;
  const ano = new URL(req.url).searchParams.get("ano") || "";
  if (!/^\d{4}$/.test(ano)) return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });
  try {
    return NextResponse.json({ itens: await foraDoPlano(ano) });
  } catch (e) {
    console.error("[GET /api/ferias/fora-do-plano]", e);
    return NextResponse.json({ erro: "Falha ao ler." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const negado = await admin();
  if (negado) return negado;
  try {
    const b = await req.json().catch(() => ({}));
    const ano = String(b?.anoGozo || "").trim();
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });
    // inclusão automática só no plano do próximo exercício, nunca no corrente
    const anoCorrente = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
    if (Number(ano) <= anoCorrente) {
      return NextResponse.json({ erro: `O plano de ${ano} está em andamento: inclua à mão, em "Adicionar" na equipe.` }, { status: 403 });
    }
    const ids = Array.isArray(b?.ids) ? b.ids.map((x: any) => String(x)) : undefined;
    const entraram = await incluirNoPlano(ano, ids);
    if (entraram.length) {
      await registrar({
        acao: "ferias_incluir_fora_do_plano", alvo: ano,
        detalhe: `Incluiu ${entraram.length} militar(es) fora do plano de ${ano}: ` +
          entraram.map((e) => `${e.idPmma}→Eq.${e.numeroEquipe}`).join(", "),
      });
    }
    return NextResponse.json({ ok: true, incluidos: entraram });
  } catch (e) {
    console.error("[POST /api/ferias/fora-do-plano]", e);
    return NextResponse.json({ erro: "Falha ao incluir." }, { status: 500 });
  }
}
