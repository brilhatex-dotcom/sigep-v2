import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conferirSenha } from "@/lib/senha";
import { criarAssinaturas } from "@/lib/assinaturaSigep";
import { memorandosDoMilitar, conteudoAssinatura } from "@/lib/memorandoFerias";
import { enviarParaAdmins } from "@/lib/push";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/ferias/meu-memorando

   GET  -> os memorandos do próprio militar (férias e licença-prêmio), com
           o andamento da assinatura.
   POST -> o militar ASSINA o seu memorando (confirma com a senha). Ao
           assinar, o P/1 e os auxiliares recebem o aviso para dar
           seguimento — é o primeiro passo da dinâmica.
   ========================================================================= */

async function senhaConfere(login: string, senha: string): Promise<boolean> {
  if (!login || !senha) return false;
  const u = await prisma.usuario.findFirst({ where: { login: { equals: login, mode: "insensitive" } } });
  if (!u?.senhaHash) return false;
  const { ok } = await conferirSenha(senha, u.senhaHash, u.salt);
  return ok;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const meuId = (session?.user as any)?.refEfetivo as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!meuId) return NextResponse.json({ memorandos: [], semFicha: true });

  try {
    const memorandos = await memorandosDoMilitar(meuId);
    return NextResponse.json({ memorandos });
  } catch (err) {
    console.error("[GET /api/ferias/meu-memorando]", err);
    return NextResponse.json({ memorandos: [] });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const meuId = u?.refEfetivo as string | undefined;
  const login = u?.login as string | undefined;
  if (!login) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!meuId) return NextResponse.json({ error: "Seu login não está vinculado a uma ficha. Procure o P/1." }, { status: 400 });

  try {
    const b = await req.json();
    const ref = String(b?.ref || "").trim();
    const tipo = String(b?.tipo || "memorando_ferias");
    const senha = String(b?.senha || "");
    if (!ref) return NextResponse.json({ error: "Documento não informado." }, { status: 400 });
    if (!["memorando_ferias", "memorando_lp"].includes(tipo)) {
      return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    }
    // trava dura: a referência começa com o ID do próprio militar
    if (!ref.startsWith(meuId + ":")) {
      return NextResponse.json({ error: "Você só pode assinar o seu próprio memorando." }, { status: 403 });
    }
    if (!(await senhaConfere(login, senha))) {
      return NextResponse.json({ error: "Senha incorreta — confirme sua senha para assinar." }, { status: 401 });
    }

    // confere que o memorando existe de fato e assina o conteúdo dele
    const meus = await memorandosDoMilitar(meuId);
    const m = meus.find((x) => x.ref === ref && x.tipo === tipo);
    if (!m) return NextResponse.json({ error: "Memorando não encontrado." }, { status: 404 });
    if (m.assinaturaMilitar) return NextResponse.json({ ok: true, jaAssinado: true });

    const nomeMilitar = [m.postoGrad, m.nome || m.nomeGuerra].filter(Boolean).join(" ").trim();
    await criarAssinaturas(
      [{
        tipo, ref,
        conteudo: conteudoAssinatura({ tipo, efetivoId: meuId, anoGozo: m.anoGozo, inicioBR: m.inicioBR, apresentacaoBR: m.apresentacaoBR }),
        resumo: `${m.rotuloPeriodo} · ${m.inicioBR} a ${m.fimBR} · ciência do militar`,
      }],
      { papel: "militar", nome: nomeMilitar, cargo: "Militar interessado", efetivoId: meuId },
    );

    // avisa a seção: o P/1 e os auxiliares dão seguimento
    try {
      await enviarParaAdmins({
        title: "Memorando assinado pelo militar",
        body: `${nomeMilitar} assinou o memorando de ${tipo === "memorando_lp" ? "licença-prêmio" : "férias"} (${m.inicioBR} a ${m.fimBR}). Aguardando a assinatura da seção.`,
        url: "/ferias",
        tag: "memo-" + ref,
      });
    } catch { /* push é best-effort */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/ferias/meu-memorando]", err);
    return NextResponse.json({ error: "Falha ao assinar" }, { status: 500 });
  }
}
