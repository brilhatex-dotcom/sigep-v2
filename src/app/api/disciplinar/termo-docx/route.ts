import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nomeDocumento, disposicaoArquivo } from "@/lib/nomeArquivo";
import { militarDoTexto } from "@/lib/nomeArquivoServidor";
import { gerarTermoDocx, TERMO_LABEL, type TermoModelo } from "@/lib/termoDocx";
import { lerChefes } from "@/lib/disciplinarChefes";
import { obter } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

const MODELOS: TermoModelo[] = ["autuacao", "juntada", "notificacao", "declaracoes", "relatorio", "solucao"];

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

/* /api/disciplinar/termo-docx?id=...&modelo=autuacao|declaracoes|relatorio */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const id = String(sp.get("id") || "");
  const modelo = String(sp.get("modelo") || "") as TermoModelo;
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  if (!MODELOS.includes(modelo)) return NextResponse.json({ error: "modelo invalido" }, { status: 400 });

  try {
    const reg = await obter(id);
    if (!reg) return NextResponse.json({ error: "Procedimento nao encontrado" }, { status: 404 });

    const buffer = await gerarTermoDocx(reg, modelo, await lerChefes());
    const numRef = String(reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || String(reg.numero || "").trim();
    const nome = nomeDocumento(`${TERMO_LABEL[modelo]} ${numRef}`.trim(), await militarDoTexto(reg.envolvido));
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": disposicaoArquivo(nome, "docx"),
      },
    });
  } catch (err) {
    console.error("[GET /api/disciplinar/termo-docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
