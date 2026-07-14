import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerPermutas } from "@/lib/permutaPedidos";
import { gerarPermutaDocx } from "@/lib/permutaDocx";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* /api/permutas/docx?id=... -> baixa a SOLICITAÇÃO DE PERMUTA em .docx.
   So o solicitante, o solicitado ou um admin podem baixar. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") || "");
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  try {
    const pedidos = await lerPermutas();
    const p = pedidos.find((x) => x.id === id);
    if (!p) return NextResponse.json({ error: "Permuta nao encontrada" }, { status: 404 });
    if (!admin && p.solicitanteId !== meuId && p.solicitadoId !== meuId) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    const buffer = await gerarPermutaDocx(p);
    const nome = `Permuta_${(p.solicitante.linha || "").replace(/[^\w]+/g, "_")}_${p.dataPermuta}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/permutas/docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
