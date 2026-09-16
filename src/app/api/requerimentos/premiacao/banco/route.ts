import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { assinaturasDoConjunto } from "@/lib/assinaturaSigep";
import { TIPO_ASSINATURA, lerPecunia, responderBanco } from "@/lib/requerimentoPecunia";

export const dynamic = "force-dynamic";

/* =========================================================================
   O QUESTIONÁRIO: cada policial escreve o PRÓPRIO banco, agência e conta.

   Até aqui a coluna DADOS BANCÁRIOS só se preenchia de dois jeitos: o P/1
   puxando da ficha, ou alguém digitando a conta do colega na tabela. Os dois
   funcionam, mas o segundo é o que mais dá errado na prática — conta ditada
   por WhatsApp, dígito trocado, e o pagamento volta.

   Aqui quem responde é o dono da conta. Três campos, e o sistema monta a linha
   do papel ("AG: 1234-5 CC: 98765-4 BANCO DO BRASIL").

   POR QUE UMA ROTA SEPARADA da que salva o requerimento:

   salvar o documento é do P/1 (ou de quem montou). O policial incluído não
   pode alterar o texto, a lista nem a linha de ninguém — mas precisa poder
   escrever a conta dele. Esta rota faz exatamente isso e nada além: mexe numa
   linha só, e só nos campos bancários.

   RESPONDER VEM ANTES DE ASSINAR. A conta faz parte do que é assinado, então
   um documento que já tem assinatura não aceita resposta nova: teria de
   reabrir, e reabrir cancela assinatura de gente que não errou nada. A tela
   avisa disso antes de alguém assinar cedo demais.
   ========================================================================= */

const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const u = session.user as any;
  const meuId = String(u.refEfetivo || "");
  const meuLogin = String(u.login || "");
  const admin = ehAdmin(u.perfil);

  try {
    const b = await req.json();
    const id = String(b?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Sem o requerimento." }, { status: 400 });

    const r = await lerPecunia(id);
    if (!r) return NextResponse.json({ error: "Requerimento não encontrado." }, { status: 404 });

    const alvo = String(b?.efetivoId || "").trim() || meuId;
    if (!alvo) {
      return NextResponse.json({ error: "Seu usuário não está ligado a uma ficha do efetivo — fale com o P/1." }, { status: 403 });
    }
    /* O policial responde por si. Quem montou o documento (e o P/1) também
       pode preencher pelos outros — é o caso de sempre, o P/1 montando o
       requerimento da equipe inteira com os dados em mãos. */
    const souDono = admin || (!!meuLogin && r.criadoPor === meuLogin);
    if (alvo !== meuId && !souDono) {
      return NextResponse.json({ error: "Você só pode preencher os seus próprios dados bancários." }, { status: 403 });
    }
    if (!r.dados.linhas.some((l) => l.efetivoId === alvo)) {
      return NextResponse.json({ error: "Este policial não está na lista do requerimento." }, { status: 403 });
    }

    const assinadas = await assinaturasDoConjunto(TIPO_ASSINATURA, id);
    if (assinadas.length) {
      return NextResponse.json({
        error: "Este requerimento já tem assinatura — a conta faz parte do que foi assinado. Peça para reabrir antes de corrigir.",
        assinantes: assinadas.map((a) => a.nome).filter(Boolean),
      }, { status: 409 });
    }

    const resposta = {
      bancoNome: String(b?.bancoNome ?? "").trim(),
      agencia: String(b?.agencia ?? "").trim(),
      conta: String(b?.conta ?? "").trim(),
      tipoConta: String(b?.tipoConta ?? "CC").trim().toUpperCase() === "CP" ? "CP" : "CC",
    };

    const atual = await responderBanco(id, alvo, resposta);
    if (!atual) return NextResponse.json({ error: "Não foi possível gravar a resposta." }, { status: 404 });

    /* Guardar também na ficha, se a pessoa pediu.

       Não é atalho para privilégio nenhum: banco/agência/conta já são campos
       que o policial edita na própria ficha, e o admin em qualquer uma. O que
       muda é só o caminho — quem acabou de digitar a conta certa não precisa
       ir digitar de novo em outra tela para o próximo requerimento já vir
       preenchido. A gravação passa pelo Prisma, então entra CIFRADA como
       qualquer outra escrita nesses campos. */
    let naFicha = false;
    if (b?.guardarNaFicha && (alvo === meuId || admin)) {
      try {
        await prisma.efetivo.update({
          where: { id: alvo },
          data: {
            banco: resposta.bancoNome, agencia: resposta.agencia,
            conta: resposta.conta, tipoConta: resposta.tipoConta,
          },
        });
        naFicha = true;
        await registrar({
          acao: "editar_ficha", alvo,
          detalhe: `Atualizou os dados bancários da ficha ao responder o requerimento ${id}.`,
        });
      } catch (e) { console.error("[premiacao/banco] ficha", e); }
    }

    await registrar({
      acao: "requerimento_pecunia_banco", alvo: id,
      detalhe: alvo === meuId
        ? `Preencheu os próprios dados bancários no requerimento ${id}.`
        : `Preencheu os dados bancários de ${alvo} no requerimento ${id}.`,
    });

    return NextResponse.json({ ok: true, requerimento: atual, naFicha });
  } catch (err) {
    console.error("[POST /api/requerimentos/premiacao/banco]", err);
    return NextResponse.json({ error: "Falha ao gravar os dados bancários." }, { status: 503 });
  }
}
