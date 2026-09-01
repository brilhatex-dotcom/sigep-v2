import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarParecerArmaDocx } from "@/lib/gerarParecerArma";
import { ehModeloAquisicao } from "@/lib/requerimentos";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const CHAVE_CHEFE = "escala_chefe_p1";

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* =========================================================================
   /api/requerimentos/[id]/parecer
   GET -> devolve, já pronto para download, o DOCX da "Declaração de Parecer
          Favorável para Aquisição de Arma de Fogo" daquele requerimento.

   É anexo obrigatório dos dois requerimentos de aquisição (uso restrito e uso
   permitido), então sai do mesmo cadastro — nada é redigitado. Diferente do
   requerimento, este documento NÃO fica guardado no R2: é montado na hora, a
   partir do que está salvo, e sempre sai com os nomes de quem assina hoje.
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
    if (!ehModeloAquisicao(r.modelo)) {
      return NextResponse.json(
        { error: "A declaração de parecer favorável só vale para os requerimentos de aquisição de arma de fogo." },
        { status: 400 }
      );
    }

    // O RG do militar não fica no requerimento — vem da ficha do efetivo.
    const ficha = await prisma.efetivo.findUnique({
      where: { id: r.efetivoId },
      select: { rg: true },
    });

    // Quem assina: os mesmos nomes que assinam a escala e os memorandos.
    let chefeNome = "";
    let chefeFuncao = "";
    let comandante = "";
    try {
      const row = await prisma.config.findUnique({ where: { chave: CHAVE_CHEFE } });
      const v = row?.valor ? JSON.parse(row.valor) : {};
      chefeNome = typeof v?.nome === "string" ? v.nome : "";
      chefeFuncao = typeof v?.funcao === "string" ? v.funcao : "";
      comandante = typeof v?.comandante === "string" ? v.comandante : "";
    } catch {}

    const buffer = gerarParecerArmaDocx({
      nomeCompleto: r.nomeCompleto,
      postoGrad: r.postoGrad,
      numeroPm: r.numeroPm,
      cpf: r.cpf,
      endereco: r.endereco,
      complemento: r.complemento,
      bairro: r.bairro,
      municipio: r.municipio,
      p2Complementares: r.p2Complementares,
      rg: ficha?.rg ?? "",
      chefeNome,
      chefeFuncao,
      comandante,
    });

    try {
      await registrar({
        acao: "gerar_parecer_arma",
        alvo: id,
        alvoNome: r.modalidade,
        detalhe: "Declaração de parecer favorável gerada",
      });
    } catch {}

    const nomeArquivo = `Parecer_Favoravel_${(r.nomeCompleto || r.matricula || "militar")
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
    console.error("[GET /api/requerimentos/[id]/parecer]", err);
    return NextResponse.json({ error: "Falha ao gerar a declaração" }, { status: 500 });
  }
}
