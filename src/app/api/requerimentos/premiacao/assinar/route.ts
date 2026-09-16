import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conferirSenha } from "@/lib/senha";
import { registrar } from "@/lib/auditoria";
import { criarAssinaturas, origemDaRequisicao, apagarAssinatura } from "@/lib/assinaturaSigep";
import {
  TIPO_ASSINATURA, lerPecunia, conteudoAssinavel, resumoAssinatura, refAssinatura, marcarGov,
} from "@/lib/requerimentoPecunia";

export const dynamic = "force-dynamic";

/* =========================================================================
   ASSINATURA DO REQUERENTE no requerimento de premiação pecuniária.

   Rota própria, e não o /api/assinatura-sigep comum, por duas diferenças de
   fundo:

   1. QUEM PODE. Lá a autorização é o ENCARGO ("só o Chefe do P/1 assina como
      Chefe do P/1"). Aqui é a PARTICIPAÇÃO: assina quem está na lista do
      requerimento, cada um a sua própria linha. Nem o P/1 assina pelo outro —
      assinatura por procuração não é assinatura, e um requerimento de
      premiação é um pedido de dinheiro em nome de quem assina.

   2. O QUE É ASSINADO. Lá o conteúdo vem da tela, porque a escala é montada
      ali na hora. Aqui o documento está guardado, então o conteúdo lacrado é
      lido DO BANCO — o navegador diz qual requerimento, nunca o que ele diz.

   Continua valendo o resto: reautenticação por senha, carimbo de data/hora,
   IP e aparelho dentro do lacre, QR para a verificação pública.
   Base: MP 2.200-2/2001 e Lei 14.063/2020 (assinatura eletrônica avançada).
   ========================================================================= */

async function senhaConfere(session: any, senha: string): Promise<boolean> {
  const login = String(session?.user?.login || "");
  if (!login || !senha) return false;
  const u = await prisma.usuario.findFirst({ where: { login: { equals: login, mode: "insensitive" } } });
  if (!u?.senhaHash) return false;
  const { ok } = await conferirSenha(senha, u.senhaHash, u.salt);
  return ok;
}

const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

/* POST — como cada policial vai assinar.
   body: { id, modo: "sigep" | "gov" | "nenhum", senha?, efetivoId? }

   "sigep"   assina aqui, com a senha (só o próprio);
   "gov"     deixa o espaço em branco para assinar o PDF pelo Gov.br;
   "nenhum"  volta à assinatura à caneta (espaço em branco, sem observação). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = ((session.user as any).refEfetivo || "") as string;
  const admin = ehAdmin((session.user as any).perfil);
  const meuLogin = String((session.user as any).login || "");

  try {
    const b = await req.json();
    const reqId = String(b?.id || "").trim();
    const senha = String(b?.senha || "");
    const modo = String(b?.modo || "sigep");
    if (!reqId) return NextResponse.json({ error: "Sem o requerimento." }, { status: 400 });
    if (!["sigep", "gov", "nenhum"].includes(modo)) {
      return NextResponse.json({ error: "Modo de assinatura inválido." }, { status: 400 });
    }

    const r = await lerPecunia(reqId);
    if (!r) return NextResponse.json({ error: "Requerimento não encontrado." }, { status: 404 });

    /* Quem monta o documento pode marcar o Gov.br pelos colegas — é só deixar
       o espaço em branco no papel, não afirma que alguém assinou. ASSINAR pelo
       outro, não: isso o SIGEP não faz nem para o P/1. */
    const alvoId = String(b?.efetivoId || "").trim() || meuId;
    const souDono = admin || (!!meuLogin && r.criadoPor === meuLogin);
    if (alvoId !== meuId && !souDono) {
      return NextResponse.json({ error: "Você só pode escolher como VOCÊ vai assinar." }, { status: 403 });
    }
    if (!alvoId) {
      return NextResponse.json({ error: "Seu usuário não está ligado a uma ficha do efetivo — fale com o P/1." }, { status: 403 });
    }

    const linha = r.dados.linhas.find((l) => l.efetivoId === alvoId);
    if (!linha) {
      return NextResponse.json({ error: "Este policial não está na lista do requerimento." }, { status: 403 });
    }

    /* Gov.br e "nenhum" não assinam nada: só mudam o que sai no papel. Se a
       pessoa já tinha assinado no SIGEP, a assinatura cai — o documento não
       pode ficar com o carimbo do SIGEP e o espaço reservado ao Gov.br. */
    if (modo !== "sigep") {
      await apagarAssinatura(TIPO_ASSINATURA, refAssinatura(reqId, alvoId));
      const atual = await marcarGov(reqId, alvoId, modo === "gov");
      return NextResponse.json({ ok: true, requerimento: atual });
    }

    if (alvoId !== meuId) {
      return NextResponse.json({ error: "Cada policial assina a sua própria linha." }, { status: 403 });
    }
    const minha = linha;

    if (!(await senhaConfere(session, senha))) {
      return NextResponse.json({ error: "Senha incorreta — confirme sua senha para assinar." }, { status: 401 });
    }
    // Assinou no SIGEP: a marca de "vai assinar pelo Gov.br" deixa de valer.
    if (minha.assinarGov) await marcarGov(reqId, meuId, false);

    const [criada] = await criarAssinaturas(
      [{
        tipo: TIPO_ASSINATURA,
        ref: refAssinatura(reqId, meuId),
        conteudo: conteudoAssinavel(r),
        resumo: resumoAssinatura(r),
      }],
      {
        papel: "requerente",
        nome: minha.nome || String((session.user as any).name || "").trim(),
        cargo: [minha.cargo, minha.lotacao].filter(Boolean).join(" · "),
        efetivoId: meuId,
        ...origemDaRequisicao(req),
      },
    );

    await registrar({
      acao: "requerimento_pecunia_assinar", alvo: reqId,
      detalhe: `Assinou o requerimento de premiação pecuniária ${reqId} como requerente (assinatura avançada SIGEP).`,
    });

    return NextResponse.json({
      ok: true,
      assinatura: { efetivoId: meuId, id: criada.id, token: criada.token, nome: minha.nome, cargo: minha.cargo, em: criada.em },
    });
  } catch (err) {
    console.error("[POST /api/requerimentos/premiacao/assinar]", err);
    return NextResponse.json({ error: "Falha ao assinar." }, { status: 503 });
  }
}
