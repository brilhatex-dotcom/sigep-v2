import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarFatdDocx } from "@/lib/fatdDocx";
import { lerChefes } from "@/lib/disciplinarChefes";
import { obter } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

/* /api/disciplinar/fatd-docx?id=... -> baixa o FATD (.docx) do registro. Admin. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });

  const id = String(new URL(req.url).searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const reg = await obter(id);
    if (!reg) return NextResponse.json({ error: "FATD nao encontrado" }, { status: 404 });

    const buffer = await gerarFatdDocx(reg, await lerChefes());
    const nome = `FATD_${String(reg.numero || "sn").replace(/[^\w]+/g, "_")}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/disciplinar/fatd-docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
