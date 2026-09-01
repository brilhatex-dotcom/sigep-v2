import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { modeloDaModalidade } from "@/lib/requerimentos";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/requerimentos
   POST -> cria um requerimento (rascunho ou enviado) e salva o perfil do
           requerente (dados extras reaproveitaveis).
   ========================================================================= */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const efetivoId = (session.user as any).refEfetivo as string | null;
  if (!efetivoId) return NextResponse.json({ error: "Usuario sem ficha de efetivo" }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Envio invalido" }, { status: 400 }); }

  const modalidade = String(body.modalidade || "").trim();
  if (!modalidade) return NextResponse.json({ error: "Modalidade obrigatoria" }, { status: 400 });
  const modelo = modeloDaModalidade(modalidade);
  const acao = body.acao === "enviar" ? "enviado" : "rascunho";
  const d = (body.dados || {}) as Record<string, string>;

  const v = (k: string) => (d[k] != null && String(d[k]).trim() !== "" ? String(d[k]).trim() : null);

  // Confere de novo no servidor os campos obrigatorios de cursos, mesmo ja
  // validados na tela — nunca confia so no cliente.
  if (modelo === "cursos" && acao === "enviado") {
    const obrigatorios = ["cpf", "email", "p2Conceito", "p2UltimaPromocao", "p2BgNumero", "p2BgData"];
    const faltando = obrigatorios.filter((k) => !v(k));
    if (faltando.length) {
      return NextResponse.json({ error: `Preencha antes de enviar: ${faltando.join(", ")}.` }, { status: 400 });
    }
  }
  if (modelo === "aquisicao_restrito" && acao === "enviado") {
    const obrigatorios = ["nomeCompleto", "idPmmaTxt", "cpf", "endereco", "municipio", "produto", "marca", "modeloArma", "calibre", "quantidade"];
    const faltando = obrigatorios.filter((k) => !v(k));
    if (faltando.length) {
      return NextResponse.json({ error: `Preencha antes de enviar: ${faltando.join(", ")}.` }, { status: 400 });
    }
  }

  // O banco nao tem colunas proprias para "Nº do BG" e "Data do BG" (nunca
  // usadas ate hoje neste modelo) — em vez de pedir uma migracao, aproveitamos
  // a coluna p2SituacaoJur, que tambem nunca foi usada, guardando os dois
  // valores como JSON. A pagina 2 inteira e composta na hora de GERAR o
  // documento (gerarRequerimento.ts), a partir dessas pecas atomicas.
  const p2SituacaoJur = (v("p2BgNumero") || v("p2BgData"))
    ? JSON.stringify({ bgNumero: v("p2BgNumero") || "", bgData: v("p2BgData") || "" })
    : null;

  /* Aquisicao de uso restrito: produto/marca/modelo/calibre/quantidade tambem
     nao tem coluna propria — mesma solucao, viajam como JSON em
     p2Complementares (que so o modelo de cursos usa, nunca os dois juntos). */
  const camposPce = ["produto", "marca", "modeloArma", "calibre", "quantidade"];
  const p2Complementares =
    modelo === "aquisicao_restrito"
      ? (camposPce.some((k) => v(k))
          ? JSON.stringify(Object.fromEntries(camposPce.map((k) => [k, v(k) || ""])))
          : null)
      : v("p2Complementares");

  try {
    const criado = await prisma.requerimento.create({
      data: {
        efetivoId,
        modelo,
        modalidade,
        modalidadeOutros: v("modalidadeOutros"),
        nomeCompleto: v("nomeCompleto"),
        endereco: v("endereco"),
        complemento: v("complemento"),
        bairro: v("bairro"),
        municipio: v("municipio"),
        fone: v("fone"),
        dataNasc: v("dataNasc"),
        dataInclusao: v("dataInclusao"),
        matricula: v("matricula"),
        idPmmaTxt: v("idPmmaTxt"),
        postoGrad: v("postoGrad"),
        numeroPm: v("numeroPm"),
        tempoServico: v("tempoServico"),
        cargoFuncao: v("cargoFuncao"),
        estadoCivil: v("estadoCivil"),
        opmClassificado: v("opmClassificado"),
        opmExercicio: v("opmExercicio"),
        cpf: v("cpf"),
        email: v("email"),
        amparoLegal: v("amparoLegal"),
        infoAdicional: v("infoAdicional"),
        p2Conceito: v("p2Conceito"),
        p2SituacaoJur,
        p2UltimaPromocao: v("p2UltimaPromocao"),
        p2Complementares,
        status: acao,
      },
    });

    // salva/atualiza o perfil do requerente (dados reaproveitaveis)
    const perfilData = {
      endereco: v("endereco"),
      complemento: v("complemento"),
      bairro: v("bairro"),
      municipio: v("municipio"),
      fone: v("fone"),
      cargoFuncao: v("cargoFuncao"),
      estadoCivil: v("estadoCivil"),
      opmClassificado: v("opmClassificado"),
      opmExercicio: v("opmExercicio"),
      cpf: v("cpf"),
      email: v("email"),
    };
    try {
      await prisma.perfilRequerente.upsert({
        where: { efetivoId },
        create: { efetivoId, ...perfilData },
        update: perfilData,
      });
    } catch {}

    if (acao === "enviado") {
      try {
        await registrar({
          acao: "enviar_requerimento",
          alvo: criado.id,
          alvoNome: modalidade,
          detalhe: `Requerimento (${modelo}) enviado ao P/1`,
        });
      } catch {}
    }

    return NextResponse.json({ ok: true, id: criado.id });
  } catch (err) {
    console.error("[POST /api/requerimentos]", err);
    return NextResponse.json({ error: "Falha ao salvar o requerimento" }, { status: 500 });
  }
}
