import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarMemorandoDocx, type MemorandoDocxInput } from "@/lib/memorandoDocx";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/ferias/memorando-docx
   POST -> recebe os campos atuais do memorando (o mesmo conteudo que esta
           na tela, incluindo edicoes feitas no editor) e devolve o .docx
           pronto para download.
   ========================================================================= */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as Partial<MemorandoDocxInput>;

    const campos: MemorandoDocxInput = {
      numero: String(body.numero ?? ""),
      ano: String(body.ano ?? ""),
      cidadeData: String(body.cidadeData ?? ""),
      de: String(body.de ?? ""),
      ao: String(body.ao ?? ""),
      assunto: String(body.assunto ?? ""),
      inicioExtenso: String(body.inicioExtenso ?? ""),
      dias: String(body.dias ?? ""),
      exercicio: String(body.exercicio ?? ""),
      apresExtenso: String(body.apresExtenso ?? ""),
      observacao: String(body.observacao ?? ""),
      assinaturaAo: String(body.assinaturaAo ?? ""),
      nomeCmt: String(body.nomeCmt ?? ""),
      cargoCmt: String(body.cargoCmt ?? ""),
    };

    const buffer = await gerarMemorandoDocx(campos);
    const nomeArquivo = `Memorando_${campos.numero || "s-n"}_${campos.ano}_18BPM.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err) {
    console.error("[POST /api/ferias/memorando-docx]", err);
    return NextResponse.json({ error: "Falha ao gerar o documento Word" }, { status: 500 });
  }
}
