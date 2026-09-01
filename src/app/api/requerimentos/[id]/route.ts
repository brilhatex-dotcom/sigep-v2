import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removerDoR2 } from "@/lib/r2";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* /api/requerimentos/[id]
   PUT    -> edita o requerimento
   DELETE -> apaga o requerimento (e o .docx que estiver no R2)

   Quem pode: o admin, em qualquer um. O policial, só nos PRÓPRIOS e enquanto
   estiverem em RASCUNHO — depois de enviado ao P/1, mexer no conteúdo por
   fora mudaria o que já está em análise. */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

// campos que o formulario edita (os demais nao vem da tela)
const CAMPOS_TEXTO = [
  "modalidadeOutros", "nomeCompleto", "endereco", "complemento", "bairro",
  "municipio", "fone", "dataNasc", "dataInclusao", "matricula", "idPmmaTxt",
  "postoGrad", "numeroPm", "tempoServico", "cargoFuncao", "estadoCivil",
  "opmClassificado", "opmExercicio", "cpf", "email", "amparoLegal",
  "infoAdicional", "p2Conceito", "p2UltimaPromocao", "p2Complementares",
] as const;

async function carregarComPermissao(id: string, session: any) {
  const r = await prisma.requerimento.findUnique({ where: { id } });
  if (!r) return { erro: NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 }) };

  const admin = ehAdmin(session.user?.perfil);
  const meu = (session.user as any).refEfetivo as string | null;

  if (!admin) {
    if (r.efetivoId !== meu) {
      return { erro: NextResponse.json({ error: "Sem permissao" }, { status: 403 }) };
    }
    if (r.status !== "rascunho") {
      return {
        erro: NextResponse.json(
          { error: "Este requerimento já foi enviado ao P/1 e não pode mais ser alterado. Fale com o P/1." },
          { status: 409 }
        ),
      };
    }
  }
  return { r, admin };
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const { r, erro } = await carregarComPermissao(id, session);
  if (erro) return erro;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Envio invalido" }, { status: 400 }); }

  const d = (body.dados || {}) as Record<string, string>;
  const v = (k: string) => (d[k] != null && String(d[k]).trim() !== "" ? String(d[k]).trim() : null);

  // Confere de novo no servidor os obrigatorios de cursos ao ENVIAR — a tela
  // ja valida, mas nunca confiamos so no cliente.
  const acao = body.acao === "enviar" ? "enviado" : body.acao === "rascunho" ? "rascunho" : null;
  if (r!.modelo === "cursos" && acao === "enviado") {
    const obrigatorios = ["cpf", "email", "p2Conceito", "p2UltimaPromocao", "p2BgNumero", "p2BgData"];
    const faltando = obrigatorios.filter((k) => !v(k));
    if (faltando.length) {
      return NextResponse.json({ error: `Preencha antes de enviar: ${faltando.join(", ")}.` }, { status: 400 });
    }
  }
  if (r!.modelo === "aquisicao_restrito" && acao === "enviado") {
    const obrigatorios = ["nomeCompleto", "idPmmaTxt", "cpf", "endereco", "municipio", "produto", "marca", "modeloArma", "calibre", "quantidade"];
    const faltando = obrigatorios.filter((k) => !v(k));
    if (faltando.length) {
      return NextResponse.json({ error: `Preencha antes de enviar: ${faltando.join(", ")}.` }, { status: 400 });
    }
  }

  // "Nº do BG" e "Data do BG" viajam como JSON em p2SituacaoJur (o banco nao
  // tem colunas proprias) — mesma convencao da criacao.
  const p2SituacaoJur = (v("p2BgNumero") || v("p2BgData"))
    ? JSON.stringify({ bgNumero: v("p2BgNumero") || "", bgData: v("p2BgData") || "" })
    : null;

  const dadosUpdate: Record<string, any> = { p2SituacaoJur };
  for (const k of CAMPOS_TEXTO) dadosUpdate[k] = v(k);
  if (acao) dadosUpdate.status = acao;

  /* Aquisicao de uso restrito: os dados do produto controlado tambem nao tem
     coluna propria — viajam como JSON em p2Complementares, sobrescrevendo o
     valor de texto que o laco acima pos ali (esse campo de texto so existe no
     modelo de cursos). Mesma convencao da criacao. */
  if (r!.modelo === "aquisicao_restrito") {
    const camposPce = ["produto", "marca", "modeloArma", "calibre", "quantidade"];
    dadosUpdate.p2Complementares = camposPce.some((k) => v(k))
      ? JSON.stringify(Object.fromEntries(camposPce.map((k) => [k, v(k) || ""])))
      : null;
  }

  // O .docx guardado virou retrato de uma versao que nao existe mais: some
  // com ele para ninguem baixar o documento velho achando que e o novo.
  // O botao "Gerar documento" reaparece na tela e refaz com o texto atual.
  if (r!.docxKey) {
    dadosUpdate.docxKey = null;
    try { await removerDoR2(r!.docxKey); } catch {}
  }

  try {
    await prisma.requerimento.update({ where: { id }, data: dadosUpdate });
    try {
      await registrar({
        acao: "editar_requerimento",
        alvo: id,
        alvoNome: r!.modalidade,
        detalhe: `Requerimento editado${acao ? ` e marcado como ${acao}` : ""}`,
      });
    } catch {}
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[PUT /api/requerimentos/[id]]", err);
    return NextResponse.json({ error: "Falha ao salvar as alteracoes" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const { r, erro } = await carregarComPermissao(id, session);
  if (erro) return erro;

  try {
    // tira o .docx do R2 junto — apagar so a linha deixaria o arquivo orfao
    if (r!.docxKey) { try { await removerDoR2(r!.docxKey); } catch {} }
    if (r!.pdfKey) { try { await removerDoR2(r!.pdfKey); } catch {} }

    await prisma.requerimento.delete({ where: { id } });

    try {
      await registrar({
        acao: "excluir_requerimento",
        alvo: id,
        alvoNome: r!.modalidade,
        detalhe: `Requerimento (${r!.status}) de ${r!.nomeCompleto || r!.efetivoId} excluído`,
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/requerimentos/[id]]", err);
    return NextResponse.json({ error: "Falha ao excluir" }, { status: 500 });
  }
}
