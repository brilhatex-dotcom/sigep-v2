import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nomeDocumento, disposicaoArquivo } from "@/lib/nomeArquivo";
import { militarDoEfetivo } from "@/lib/nomeArquivoServidor";
import { baixarDoR2, enviarParaR2 } from "@/lib/r2";
import { gerarRequerimentoDocx, dadosReqDe, docxDoLayoutAntigo } from "@/lib/gerarRequerimento";

export const dynamic = "force-dynamic";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/baixar
   GET -> entrega o DOCX gerado (do R2) para download. Dono ou admin.

   Word guardado no layout ANTIGO (sem a quebra antes de "INFORMAÇÕES DO
   COMANDANTE DA OPM" — o que deixava a sobra da caixa de assinatura no alto
   da 2ª página): é refeito na hora com os dados do requerimento, guardado no
   lugar do velho, e é o novo que desce. Assim os já gerados se corrigem
   sozinhos, sem ninguém precisar clicar em "gerar" de novo.
   ========================================================================= */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r || !r.docxKey) return NextResponse.json({ error: "Documento nao gerado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    let buffer = await baixarDoR2(r.docxKey);
    if (docxDoLayoutAntigo(buffer)) {
      try {
        const novo = gerarRequerimentoDocx(dadosReqDe(r));
        const key = `requerimentos/${r.id}_${Date.now()}.docx`;
        await enviarParaR2(key, novo, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        await prisma.requerimento.update({ where: { id }, data: { docxKey: key } });
        buffer = novo;
      } catch (e) {
        console.error("[baixar] não refez o Word antigo", e); // desce o que havia
      }
    }
    const nomeArquivo = nomeDocumento(`Requerimento ${r.modalidade || ""}`, await militarDoEfetivo(r.efetivoId, { postoGrad: r.postoGrad, nome: r.nomeCompleto }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": disposicaoArquivo(nomeArquivo, "docx"),
      },
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/[id]/baixar]", err);
    return NextResponse.json({ error: "Falha ao baixar" }, { status: 500 });
  }
}
