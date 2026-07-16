import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { conferirSenha, gerarHash, validarSenhaForte } from '@/lib/senha';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function obterIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'desconhecido';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;

  if (!session || !login) {
    return NextResponse.json({ erro: 'Sessao invalida.' }, { status: 401 });
  }

  let body: { senhaAtual: string | null; novaSenha: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisicao invalida.' }, { status: 400 });
  }

  const { senhaAtual, novaSenha } = body;

  const fraca = validarSenhaForte(String(novaSenha ?? ""), [login]);
  if (fraca) return NextResponse.json({ erro: fraca }, { status: 400 });

  const usuario = await prisma.usuario.findFirst({
    where: { login: { equals: login, mode: 'insensitive' } },
  });

  if (!usuario || !usuario.senhaHash) {
    return NextResponse.json({ erro: 'Usuario nao encontrado.' }, { status: 404 });
  }

  if ((usuario.ativo ?? '').toUpperCase() !== 'SIM') {
    return NextResponse.json({ erro: 'Usuario inativo.' }, { status: 403 });
  }

  const precisaTrocar = (usuario as any).precisaTrocar ?? false;

  // Se NAO esta em troca obrigatoria, exige senha atual
  if (!precisaTrocar) {
    if (typeof senhaAtual !== 'string' || senhaAtual.length < 4) {
      return NextResponse.json({ erro: 'Senha atual obrigatoria.' }, { status: 400 });
    }
    const conf = await conferirSenha(senhaAtual, usuario.senhaHash, usuario.salt);
    if (!conf.ok) {
      return NextResponse.json({ erro: 'Senha atual incorreta.' }, { status: 400 });
    }
    // nova nao pode ser igual a atual
    const confNova = await conferirSenha(novaSenha, usuario.senhaHash, usuario.salt);
    if (confNova.ok) {
      return NextResponse.json({ erro: 'A nova senha deve ser diferente da atual.' }, { status: 400 });
    }
  }

  // Grava a nova senha em bcrypt (o hash ja embute o sal).
  const novoHash = await gerarHash(novaSenha);
  const ip = obterIp(req);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      senhaHash: novoHash,
      salt: "",
      precisaTrocar: false,
      tentativas: 0,
      bloqueadoAte: null,
    } as any,
  });

  try {
    await prisma.auditoria.create({
      data: {
        acao: 'senha_trocada',
        autorLogin: usuario.login,
        autorNome: usuario.nomeCompleto ?? usuario.login,
        detalhe: `Senha alterada via /trocar-senha (IP ${ip})`,
      } as any,
    });
  } catch {}

  return NextResponse.json({ ok: true });
}