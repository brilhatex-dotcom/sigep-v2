import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarEscalaDocx, type EscalaExport } from "@/lib/escalaExport";

export const dynamic = "force-dynamic";

/* POST { escala } -> devolve a Escala de Servico do dia em .docx (download). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const e = (body?.escala || {}) as EscalaExport;
    const buffer = await gerarEscalaDocx(e);
    const nome = `escala-${e.data || "servico"}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[POST /api/escala/docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
