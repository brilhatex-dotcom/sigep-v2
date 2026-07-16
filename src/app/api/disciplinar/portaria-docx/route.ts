import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarPortariaDocx, type PortariaModelo } from "@/lib/portariaDocx";
import { lerChefes } from "@/lib/disciplinarChefes";
import { obter, obterOuAtribuirNumero } from "@/lib/disciplinarDb";

export const dynamic = "force-dynamic";

const MODELOS: PortariaModelo[] = ["instauracao", "prorrogacao", "escrivao"];

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

/* /api/disciplinar/portaria-docx?id=...&modelo=instauracao|prorrogacao|escrivao -> .docx. Admin. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const id = String(sp.get("id") || "");
  const modelo = (MODELOS.includes(sp.get("modelo") as PortariaModelo) ? sp.get("modelo") : "instauracao") as PortariaModelo;
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const reg = await obter(id);
    if (!reg) return NextResponse.json({ error: "Procedimento nao encontrado" }, { status: 404 });

    // prorrogação/escrivão usam o número automático (mesmo da tela); instauração usa o campo portaria.
    const numeroAuto = modelo === "instauracao" ? "" : await obterOuAtribuirNumero(id, modelo === "prorrogacao" ? "prorrogacao" : "escrivao");
    const buffer = await gerarPortariaDocx(reg, await lerChefes(), modelo, numeroAuto);
    const nome = `Portaria_${modelo}_${String(reg.tipo || "proc").toUpperCase()}_${String(numeroAuto || reg.portaria || reg.numero || "sn").replace(/[^\w]+/g, "_")}.docx`;
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
