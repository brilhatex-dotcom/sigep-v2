import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { carregarPlanilha, lerLimite, marcarLimite } from "@/lib/planilhaPadraoDb";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/promocoes/planilha/limite — quem está dentro do Limite Quantitativo.

   A CPPPM publica o limite (17/09/2026, art. 2º, I) e a Planilha Padrão sai
   só com quem está dentro dele — não com o efetivo inteiro. Publicado o
   limite, o efetivo abrangido fica CONGELADO para o ciclo (art. 5º): por isso
   a lista é gravada, nome a nome, e não recalculada a cada abertura — uma
   promoção ou transferência depois de 17/09 não pode mexer em quem entra.

   POST { grad, quantidade }   os N mais antigos da graduação ficam dentro,
                               o resto daquela graduação fica fora
   POST { efetivoId, dentro }  acerta um militar só
   POST { limpar: true }       apaga o limite (volta a valer todo o efetivo)
   ========================================================================= */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const login = String(u.login || u.name || "");

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    const b = await req.json();
    const linhas = await carregarPlanilha(periodo.id);   // já em ordem de antiguidade

    if (b?.limpar === true) {
      await marcarLimite(periodo.id, [...(await lerLimite(periodo.id))], false, login);
      await registrar({ acao: "planilha_limite_limpar", alvo: periodo.id, detalhe: `Apagou o Limite Quantitativo (${periodo.nome}).` });
      return NextResponse.json({ ok: true });
    }

    /* Primeiro ajuste do limite: quem ainda não foi tocado estava "dentro"
       só porque o limite não existia. Ao marcar a primeira graduação, as
       demais continuam dentro — senão elas sumiriam da planilha de uma vez,
       antes de o P/1 chegar nelas. */
    const atual = await lerLimite(periodo.id);
    if (atual.size === 0) {
      await marcarLimite(periodo.id, linhas.map((l) => l.efetivoId), true, login);
    }

    if (typeof b?.efetivoId === "string") {
      const l = linhas.find((x) => x.efetivoId === b.efetivoId);
      if (!l) return NextResponse.json({ error: "Militar fora da planilha." }, { status: 400 });
      await marcarLimite(periodo.id, [l.efetivoId], !!b.dentro, login);
      await registrar({
        acao: "planilha_limite_militar", alvo: l.efetivoId,
        detalhe: `${b.dentro ? "Incluiu" : "Tirou"} ${l.rotulo} ${b.dentro ? "no" : "do"} Limite Quantitativo (${periodo.nome}).`,
      });
      return NextResponse.json({ ok: true });
    }

    const grad = String(b?.grad || "");
    const n = Math.floor(Number(b?.quantidade));
    const daGrad = linhas.filter((l) => l.celulas.grad.valor === grad);
    if (!daGrad.length) return NextResponse.json({ error: "Graduação sem militares." }, { status: 400 });
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Quantidade inválida." }, { status: 400 });

    const dentro = daGrad.slice(0, n).map((l) => l.efetivoId);
    const fora = daGrad.slice(n).map((l) => l.efetivoId);
    await marcarLimite(periodo.id, dentro, true, login);
    await marcarLimite(periodo.id, fora, false, login);
    await registrar({
      acao: "planilha_limite_grad", alvo: periodo.id,
      detalhe: `Limite Quantitativo (${periodo.nome}): ${grad} — os ${dentro.length} mais antigos de ${daGrad.length}.`,
    });
    return NextResponse.json({ ok: true, dentro: dentro.length, fora: fora.length });
  } catch (err) {
    console.error("[POST /api/promocoes/planilha/limite]", err);
    return NextResponse.json({ error: "Falha ao gravar o limite." }, { status: 503 });
  }
}
