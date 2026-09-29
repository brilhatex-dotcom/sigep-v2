import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarGruDocx } from "@/lib/gerarGruDocx";
import { ehModeloAquisicao } from "@/lib/requerimentos";

export const dynamic = "force-dynamic";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/gru
   GET -> DOCX com as "Instruções para o preenchimento da GRU" da taxa de
          aquisição de PCE, já com o nome e o CPF do adquirente e a
          competência do mês. Os códigos vêm de lib/gru.ts.

   Vale para todos os requerimentos de arma de fogo (compra direta e
   transferência): todos pedem a cópia da GRU paga nos anexos. Dono ou admin.
   ========================================================================= */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  try {
    const r = await prisma.requerimento.findUnique({
      where: { id },
      select: { efetivoId: true, modelo: true, nomeCompleto: true, cpf: true, matricula: true },
    });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }
    if (!ehModeloAquisicao(r.modelo)) {
      return NextResponse.json(
        { error: "A GRU da taxa de aquisição de PCE só vale para os requerimentos de arma de fogo." },
        { status: 400 }
      );
    }

    const buffer = await gerarGruDocx({ nome: r.nomeCompleto, cpf: r.cpf });

    const nomeArquivo = `Instrucoes_GRU_${(r.nomeCompleto || r.matricula || "militar")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/[id]/gru]", err);
    return NextResponse.json({ error: "Falha ao gerar as instruções da GRU" }, { status: 500 });
  }
}
