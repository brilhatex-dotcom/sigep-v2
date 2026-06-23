import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarParaR2 } from "@/lib/r2";
import { gerarRequerimentoDocx } from "@/lib/gerarRequerimento";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/gerar
   POST -> gera o DOCX do requerimento, salva no R2 e devolve a chave.
           So o dono ou um admin podem gerar.
   ========================================================================= */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });

    // permissao: dono ou admin
    if (!admin && r.efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    const buffer = gerarRequerimentoDocx({
      modelo: r.modelo,
      modalidade: r.modalidade === "OUTROS" && r.modalidadeOutros ? r.modalidade : r.modalidade,
      nomeCompleto: r.nomeCompleto,
      endereco: r.endereco,
      bairro: r.bairro,
      municipio: r.municipio,
      fone: r.fone,
      dataNasc: r.dataNasc,
      dataInclusao: r.dataInclusao,
      matricula: r.matricula,
      idPmmaTxt: r.idPmmaTxt,
      postoGrad: r.postoGrad,
      numeroPm: r.numeroPm,
      tempoServico: r.tempoServico,
      estadoCivil: r.estadoCivil,
      opmClassificado: r.opmClassificado,
      amparoLegal: r.amparoLegal,
      infoAdicional: r.infoAdicional,
      cpf: r.cpf,
      email: r.email,
    });

    const key = `requerimentos/${r.id}_${Date.now()}.docx`;
    await enviarParaR2(
      key,
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    await prisma.requerimento.update({ where: { id }, data: { docxKey: key } });

    try {
      await registrar({
        acao: "gerar_requerimento",
        alvo: id,
        alvoNome: r.modalidade,
        detalhe: "Documento DOCX gerado",
      });
    } catch {}

    return NextResponse.json({ ok: true, docxKey: key });
  } catch (err) {
    console.error("[POST /api/requerimentos/[id]/gerar]", err);
    return NextResponse.json({ error: "Falha ao gerar o documento" }, { status: 500 });
  }
}
