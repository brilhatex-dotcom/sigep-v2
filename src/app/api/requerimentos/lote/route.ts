import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { modeloDaModalidade } from "@/lib/requerimentos";
import { dadosPessoais } from "@/lib/requerimentoDados";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* POST /api/requerimentos/lote
   { modalidade, idsPmma: [], acao: "rascunho" | "enviar",
     dados: {...compartilhados}, porMilitar: { [idPmma]: {...} } }

   Cria o MESMO requerimento para VÁRIOS militares de uma vez — a mesma
   dinâmica da viagem em grupo das diárias: o P/1 digita uma vez o que é igual
   para todo mundo (amparo legal, o que se pede, o texto do "OUTROS") e o
   sistema abre um requerimento por militar, cada um com os dados da PRÓPRIA
   ficha (nome, endereço, matrícula, posto, CPF).

   No modelo de CURSOS a página 2 tem dados que mudam de pessoa para pessoa
   (conceito militar, data e BG da última promoção). Esses vêm em `porMilitar`,
   já ajustados um a um na tela.

   Só o admin. E, ao contrário de /api/requerimentos, aqui NÃO se exige que o
   admin tenha ficha de efetivo: o requerimento é dos militares da lista, não
   dele.

   ENVIAR É TUDO OU NADA. Requerimento não tem edição depois de criado (só
   gerar o .docx), então criar um incompleto deixaria lixo impossível de
   consertar. Se faltar dado de alguém, nada é criado e a resposta diz de quem
   e o que falta — o P/1 corrige e manda de novo. Rascunho não valida: serve
   justamente para adiantar o que já dá, e o documento sai do mesmo jeito. */

const CAMPOS_PAGINA2 = ["p2Conceito", "p2UltimaPromocao", "p2BgNumero", "p2BgData"] as const;

const ROTULO_FALTA: Record<string, string> = {
  cpf: "CPF",
  email: "e-mail",
  p2Conceito: "conceito militar",
  p2UltimaPromocao: "data da última promoção",
  p2BgNumero: "nº do BG",
  p2BgData: "data do BG",
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Somente o administrador." }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Envio invalido" }, { status: 400 }); }

  const modalidade = String(body.modalidade || "").trim();
  if (!modalidade) return NextResponse.json({ error: "Modalidade obrigatoria" }, { status: 400 });
  const modelo = modeloDaModalidade(modalidade);

  const idsPmma: string[] = Array.isArray(body?.idsPmma)
    ? Array.from(new Set(body.idsPmma.map((x: any) => String(x || "").trim()).filter(Boolean)))
    : [];
  if (!idsPmma.length) {
    return NextResponse.json({ error: "Selecione ao menos um militar." }, { status: 400 });
  }

  const querEnviar = body.acao === "enviar";
  const d = (body.dados || {}) as Record<string, string>;
  const porMilitar = (body.porMilitar || {}) as Record<string, Record<string, string>>;

  const limpo = (x: unknown) => {
    const s = x == null ? "" : String(x).trim();
    return s === "" ? null : s;
  };

  const amparoLegal = limpo(d.amparoLegal);
  const infoAdicional = limpo(d.infoAdicional);
  const modalidadeOutros = limpo(d.modalidadeOutros);
  const p2Complementares = limpo(d.p2Complementares);

  try {
    // ---- 1) carrega as fichas e confere o que falta ----
    type Preparado = {
      efetivoId: string;
      pessoais: Record<string, string>;
      p2: Record<string, string | null>;
    };
    const preparados: Preparado[] = [];
    const semFicha: string[] = [];
    const pendencias: string[] = [];

    for (const efetivoId of idsPmma) {
      const pessoais = await dadosPessoais(efetivoId);
      if (!pessoais) { semFicha.push(efetivoId); continue; }

      // página 2: o que veio por militar; se não veio, cai no valor comum
      const doMilitar = porMilitar[efetivoId] || {};
      const p2: Record<string, string | null> = {};
      for (const k of CAMPOS_PAGINA2) p2[k] = limpo(doMilitar[k] ?? d[k]);

      if (querEnviar && modelo === "cursos") {
        const falta = [
          ...(["cpf", "email"] as const).filter((k) => !limpo(pessoais[k])),
          ...CAMPOS_PAGINA2.filter((k) => !p2[k]),
        ];
        if (falta.length) {
          const quem = [pessoais.postoGrad, pessoais.nomeCompleto].filter(Boolean).join(" ").trim() || efetivoId;
          pendencias.push(`${quem}: falta ${falta.map((k) => ROTULO_FALTA[k] || k).join(", ")}`);
        }
      }

      preparados.push({ efetivoId, pessoais, p2 });
    }

    if (!preparados.length) {
      return NextResponse.json(
        { error: "Nenhum dos militares selecionados tem ficha de efetivo." },
        { status: 400 }
      );
    }

    if (pendencias.length) {
      return NextResponse.json(
        {
          error:
            "Nada foi criado — requerimento não pode ser editado depois, então não dá para enviar incompleto.\n\n" +
            pendencias.join("\n") +
            "\n\nComplete os dados (ou use “Criar como rascunho”).",
        },
        { status: 400 }
      );
    }

    // ---- 2) cria ----
    const status = querEnviar ? "enviado" : "rascunho";

    for (const { efetivoId, pessoais, p2 } of preparados) {
      const p = (k: string) => limpo(pessoais[k]);

      // O banco não tem colunas próprias para "Nº do BG" e "Data do BG" — como
      // no POST individual, os dois vão como JSON na coluna p2SituacaoJur, que
      // nunca foi usada. A página 2 é composta na hora de GERAR o documento.
      const p2SituacaoJur = (p2.p2BgNumero || p2.p2BgData)
        ? JSON.stringify({ bgNumero: p2.p2BgNumero || "", bgData: p2.p2BgData || "" })
        : null;

      await prisma.requerimento.create({
        data: {
          efetivoId,
          modelo,
          modalidade,
          modalidadeOutros,
          nomeCompleto: p("nomeCompleto"),
          endereco: p("endereco"),
          complemento: p("complemento"),
          bairro: p("bairro"),
          municipio: p("municipio"),
          fone: p("fone"),
          dataNasc: p("dataNasc"),
          dataInclusao: p("dataInclusao"),
          matricula: p("matricula"),
          idPmmaTxt: p("idPmmaTxt"),
          postoGrad: p("postoGrad"),
          numeroPm: p("numeroPm"),
          tempoServico: p("tempoServico"),
          cargoFuncao: p("cargoFuncao"),
          estadoCivil: p("estadoCivil"),
          opmClassificado: p("opmClassificado"),
          opmExercicio: p("opmExercicio"),
          cpf: p("cpf"),
          email: p("email"),
          amparoLegal,
          infoAdicional,
          p2Conceito: p2.p2Conceito,
          p2SituacaoJur,
          p2UltimaPromocao: p2.p2UltimaPromocao,
          p2Complementares,
          status,
        },
      });
    }

    try {
      await registrar({
        acao: "requerimento_em_lote",
        alvo: modalidade,
        alvoNome: modalidade,
        detalhe: `${preparados.length} requerimento(s) de "${modalidade}" criado(s) em lote como ${status}`,
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      total: preparados.length,
      status,
      semFicha: semFicha.length,
    });
  } catch (err) {
    console.error("[POST /api/requerimentos/lote]", err);
    return NextResponse.json({ error: "Falha ao criar os requerimentos" }, { status: 500 });
  }
}
