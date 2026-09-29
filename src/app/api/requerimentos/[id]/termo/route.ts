import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarTermoDoacaoDocx } from "@/lib/gerarTermoDoacao";
import { ehModeloTransferencia } from "@/lib/requerimentos";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/termo
   GET -> devolve, já pronto para download, o DOCX do "Termo de Doação de Arma
          de Fogo" daquele requerimento de transferência.

   Anexo dos dois requerimentos de aquisição por transferência (SIGMA para
   SIGMA e SINARM para SIGMA). Como a declaração de parecer, NÃO fica guardado
   no R2: é montado na hora, a partir do que está salvo, e sai datado do dia.
   Dono ou admin.
   ========================================================================= */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ehAdmin((session.user as any).perfil);
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }
    if (!ehModeloTransferencia(r.modelo)) {
      return NextResponse.json(
        { error: "O termo de doação só vale para os requerimentos de transferência de arma de fogo." },
        { status: 400 }
      );
    }

    const buffer = gerarTermoDoacaoDocx({
      modelo: r.modelo,
      nomeCompleto: r.nomeCompleto,
      postoGrad: r.postoGrad,
      cpf: r.cpf,
      estadoCivil: r.estadoCivil,
      endereco: r.endereco,
      complemento: r.complemento,
      bairro: r.bairro,
      municipio: r.municipio,
      p2Complementares: r.p2Complementares,
    });

    try {
      await registrar({
        acao: "gerar_termo_doacao_arma",
        alvo: id,
        alvoNome: r.modalidade,
        detalhe: "Termo de doação de arma de fogo gerado",
      });
    } catch {}

    const nomeArquivo = `Termo_Doacao_${(r.nomeCompleto || r.matricula || "militar")
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
    console.error("[GET /api/requerimentos/[id]/termo]", err);
    return NextResponse.json({ error: "Falha ao gerar o termo de doação" }, { status: 500 });
  }
}
