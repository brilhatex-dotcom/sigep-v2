import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conferirSenha } from "@/lib/senha";
import { podeComoEncargo, cargoDocDe, encargoDe } from "@/lib/encargos";
import { criarAssinaturas, assinaturasDoDoc } from "@/lib/assinaturaSigep";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
async function senhaConfere(session: any, senha: string): Promise<boolean> {
  const login = String(session?.user?.login || "");
  if (!login || !senha) return false;
  const u = await prisma.usuario.findFirst({ where: { login: { equals: login, mode: "insensitive" } } });
  if (!u?.senhaHash) return false;
  const { ok } = await conferirSenha(senha, u.senhaHash, u.salt);
  return ok;
}

// GET ?tipo=&ref=  -> assinaturas atuais do documento (para carimbo/QR)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ assinaturas: [] });
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo") || "";
  const ref = u.searchParams.get("ref") || "";
  if (!tipo || !ref) return NextResponse.json({ assinaturas: [] });
  const arr = await assinaturasDoDoc(tipo, ref);
  // não expõe o hash; só o necessário para o carimbo
  return NextResponse.json({ assinaturas: arr.map((a) => ({ id: a.id, token: a.token, papel: a.papel, nome: a.nome, cargo: a.cargo, em: a.em })) });
}

/* POST — ASSINA (reautenticação por senha). Aceita lote.
   body: { papel:"chefe_p1"|"cmt", senha, itens:[{tipo, ref, conteudo}] } */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  try {
    const b = await req.json();
    const papel = String(b?.papel || "");
    const senha = String(b?.senha || "");
    const itens = Array.isArray(b?.itens) ? b.itens : [];
    if (!["chefe_p1", "cmt"].includes(papel)) return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
    if (!itens.length) return NextResponse.json({ error: "Nada para assinar." }, { status: 400 });
    // só o titular do encargo (ou admin) assina naquele papel
    if (!(await podeComoEncargo(meuId, papel, admin))) {
      return NextResponse.json({ error: `Apenas ${papel === "chefe_p1" ? "o Chefe do P/1" : "o Comandante"} pode assinar.` }, { status: 403 });
    }
    if (!(await senhaConfere(session, senha))) {
      return NextResponse.json({ error: "Senha incorreta — confirme sua senha para assinar." }, { status: 401 });
    }

    // nome/cargo do signatário
    const nome = String((session.user as any).name || "").trim();
    const enc = await encargoDe(meuId);
    const cargo = (enc && cargoDocDe(enc)) || (papel === "chefe_p1" ? "Chefe do P/1 do 18º BPM" : "Comandante do 18º BPM");

    const limpos = itens
      .filter((i: any) => i && i.tipo && i.ref)
      .map((i: any) => ({ tipo: String(i.tipo), ref: String(i.ref), conteudo: String(i.conteudo || "") }));
    const criadas = await criarAssinaturas(limpos, { papel, nome, cargo, efetivoId: meuId });

    await registrar({
      acao: "assinatura_sigep",
      detalhe: `Assinou ${criadas.length} documento(s) como ${cargo} (assinatura avançada SIGEP).`,
    });
    return NextResponse.json({ ok: true, assinaturas: criadas });
  } catch (err) {
    console.error("[POST /api/assinatura-sigep]", err);
    return NextResponse.json({ error: "Falha ao assinar." }, { status: 500 });
  }
}
