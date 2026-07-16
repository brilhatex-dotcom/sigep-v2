import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { conferirSenha, gerarHash } from "@/lib/senha";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   POST /api/conta/trocar-senha
   body { senhaAtual, novaSenha }
   - confere a senha atual (mesmo hash do auth)
   - grava a nova senha com um SALT NOVO
   - marca precisaTrocar = false (encerra o 1o acesso)
   Regras minimas da nova senha: >= 6 caracteres e != senha atual.
   ========================================================================= */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const userId = (session.user as any).id || (session.user as any).login;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const senhaAtual = String(body.senhaAtual || "");
  const novaSenha = String(body.novaSenha || "");

  if (novaSenha.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter ao menos 6 caracteres." }, { status: 400 });
  }
  if (novaSenha === senhaAtual) {
    return NextResponse.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });
  }

  try {
    // localiza o usuario logado (por id; se nao achar, por login)
    let usuario = await prisma.usuario.findUnique({ where: { id: String(userId) } }).catch(() => null);
    if (!usuario) {
      usuario = await prisma.usuario.findFirst({
        where: { login: { equals: String((session.user as any).login || ""), mode: "insensitive" } },
      });
    }
    if (!usuario || !usuario.senhaHash) {
      return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
    }

    // confere a senha atual (bcrypt ou legado)
    const conf = await conferirSenha(senhaAtual, usuario.senhaHash, usuario.salt);
    if (!conf.ok) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    // grava a nova em bcrypt (o hash embute o sal)
    const novoHash = await gerarHash(novaSenha);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        salt: "",
        senhaHash: novoHash,
        precisaTrocar: false,
        tentativas: 0,
        bloqueadoAte: null,
      } as any,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/conta/trocar-senha]", err);
    return NextResponse.json({ error: "Falha ao trocar a senha" }, { status: 500 });
  }
}
