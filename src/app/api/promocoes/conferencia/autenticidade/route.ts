import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { periodoAtivo } from "@/lib/promocoes";
import { registrar } from "@/lib/auditoria";
import { ROTULO_ITEM } from "@/lib/conferenciaCertidoes";
import { marcarAutenticidade, type ResultadoSite } from "@/lib/autenticidadeCertidoesDb";

export const dynamic = "force-dynamic";

/* POST { efetivoId, ordem, codigo, resultado: "autentica" | "nao_confere" | null }
   O P/1 conferiu o código da certidão no site do tribunal e marca o que deu
   (null desfaz). Fica na auditoria: quem conferiu e quando. Só o admin. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const efetivoId = String(b?.efetivoId || "").trim();
  const ordem = Number(b?.ordem);
  const codigo = String(b?.codigo || "").trim().slice(0, 80);
  const resultado: ResultadoSite | null =
    b?.resultado === "autentica" || b?.resultado === "nao_confere" ? b.resultado : null;
  if (!efetivoId || !Number.isInteger(ordem) || ordem < 1 || ordem > 9) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  try {
    const login = String((session.user as any).login || session.user.name || "");
    await marcarAutenticidade(periodo.id, efetivoId, ordem, codigo, resultado, login);
    await registrar({
      acao: "certidao_autenticidade", alvo: efetivoId,
      detalhe: resultado
        ? `Conferiu no site do tribunal a certidão ${ROTULO_ITEM[ordem]} (código ${codigo || "—"}): ${resultado === "autentica" ? "AUTÊNTICA" : "NÃO CONFERE"}`
        : `Desfez a conferência no site da certidão ${ROTULO_ITEM[ordem]}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, marca: resultado ? { codigo, resultado, por: login, em: new Date().toISOString() } : null });
  } catch (err) {
    console.error("[POST /api/promocoes/conferencia/autenticidade]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}
