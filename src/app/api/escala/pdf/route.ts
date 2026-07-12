import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarEscalaPdf } from "@/lib/escalaExport";

export const dynamic = "force-dynamic";

/* POST { escala } -> devolve a Escala de Servico do dia em PDF (download). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const bytes = await gerarEscalaPdf(body || {});
    const nome = `escala-${body?.escala?.data || "servico"}.pdf`;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[POST /api/escala/pdf]", err);
    return NextResponse.json({ error: "Falha ao gerar o PDF" }, { status: 500 });
  }
}
