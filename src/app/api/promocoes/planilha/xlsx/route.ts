import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeVerP1 } from "@/lib/encargos";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { carregarPlanilha } from "@/lib/planilhaPadraoDb";
import { gerarPlanilhaXlsx } from "@/lib/planilhaPadraoXlsx";

export const dynamic = "force-dynamic";

/* GET /api/promocoes/planilha/xlsx — a Planilha Padrão pronta, no modelo da
   CPPPM, para baixar, conferir, assinar e mandar (Portaria 168/2026, art. 3º).

   O termo de assinatura sai com o Chefe do P/1 da configuração da escala
   (Config "escala_chefe_p1") — o mesmo nome que já assina as escalas e o
   histórico, para não haver dois "Chefe do P/1" diferentes circulando. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }

  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  try {
    // só quem está dentro do Limite Quantitativo (todos, se o limite não foi definido)
    const linhas = (await carregarPlanilha(periodo.id)).filter((l) => l.dentroDoLimite);

    let assinante = { nome: "", cargo: "Chefe do P/1 do 18º BPM" };
    try {
      const row = await prisma.config.findUnique({ where: { chave: "escala_chefe_p1" } });
      const cfg = row?.valor ? JSON.parse(row.valor) : null;
      if (cfg?.nome) assinante = { nome: String(cfg.nome), cargo: String(cfg.funcao || assinante.cargo) };
    } catch { /* sem configuração: o termo sai com o espaço para o nome */ }

    const buf = await gerarPlanilhaXlsx(linhas, assinante);
    await registrar({
      acao: "planilha_padrao_baixar", alvo: periodo.id,
      detalhe: `Baixou a Planilha Padrão (${periodo.nome}) com ${linhas.length} militar(es).`,
    });

    const nome = `Planilha_Padrao_18BPM_${periodo.nome.replace(/[^\w]+/g, "_")}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/promocoes/planilha/xlsx]", err);
    return NextResponse.json({ error: "Falha ao gerar a planilha." }, { status: 503 });
  }
}
