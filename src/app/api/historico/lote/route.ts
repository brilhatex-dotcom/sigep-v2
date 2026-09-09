import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerHistorico, salvarHistorico } from "@/lib/historicoDb";
import { normalizar, VAZIO } from "@/lib/historicoPolicial";
import { juntar } from "@/lib/historicoImportar";

export const dynamic = "force-dynamic";

/* /api/historico/lote
   POST { itens: [{ efetivoId, dados }], substituir } -> grava vários
   históricos de uma vez.

   A junção com o que já estava salvo é feita AQUI, não na tela: assim o lote
   inteiro é uma viagem só, em vez de duas por arquivo (ler + gravar), e o P/1
   não fica olhando a barrinha andar enquanto importa a pasta do Batalhão.

   `substituir` falso (o padrão) só preenche o que estiver em branco — uma
   importação em lote nunca apaga o que já foi escrito à mão. */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(u.perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  try {
    const b = await req.json();
    const itens: any[] = Array.isArray(b?.itens) ? b.itens : [];
    const substituir = b?.substituir === true;
    if (!itens.length) return NextResponse.json({ error: "Nada para importar." }, { status: 400 });
    if (itens.length > 200) return NextResponse.json({ error: "No máximo 200 arquivos por vez." }, { status: 400 });

    const por = String(u.name || "");
    const resultados: { efetivoId: string; ok: boolean; erro?: string }[] = [];

    for (const it of itens) {
      const efetivoId = String(it?.efetivoId || "").trim();
      if (!efetivoId) { resultados.push({ efetivoId: "", ok: false, erro: "sem militar" }); continue; }
      try {
        const linha = await lerHistorico(efetivoId);
        const atual = linha ? normalizar(JSON.parse(linha.dados || "{}")) : VAZIO;
        await salvarHistorico(efetivoId, juntar(atual, normalizar(it?.dados), substituir), por);
        resultados.push({ efetivoId, ok: true });
      } catch (e: any) {
        console.error("[POST /api/historico/lote] item", efetivoId, e);
        resultados.push({ efetivoId, ok: false, erro: "falha ao gravar" });
      }
    }

    return NextResponse.json({
      ok: true,
      gravados: resultados.filter((r) => r.ok).length,
      resultados,
    });
  } catch (err) {
    console.error("[POST /api/historico/lote]", err);
    return NextResponse.json({ error: "Falha ao importar o lote." }, { status: 500 });
  }
}
