import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarPortariaDocx } from "@/lib/portariaDocx";

export const dynamic = "force-dynamic";

const CHAVE = "disciplinar";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

/* /api/disciplinar/portaria-docx?id=... -> Portaria de instauração (.docx). Admin. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });

  const id = String(new URL(req.url).searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    const reg = Array.isArray(lista) ? lista.find((r: any) => r.id === id) : null;
    if (!reg) return NextResponse.json({ error: "Procedimento nao encontrado" }, { status: 404 });

    const buffer = await gerarPortariaDocx(reg);
    const nome = `Portaria_${String(reg.tipo || "proc").toUpperCase()}_${String(reg.portaria || reg.numero || "sn").replace(/[^\w]+/g, "_")}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/disciplinar/portaria-docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o Word" }, { status: 500 });
  }
}
