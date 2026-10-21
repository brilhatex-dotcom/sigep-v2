import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import TrocarSenhaForm from './TrocarSenhaForm';

export const metadata = { title: 'Trocar Senha | SIGEP-18BPM' };
export const dynamic = 'force-dynamic';

export default async function TrocarSenhaPage() {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login as string | undefined;

  if (!session || !login) {
    redirect('/login');
  }

  const usuario = await prisma.usuario.findFirst({
    where: { login: { equals: login, mode: 'insensitive' } },
    select: {
      id: true,
      login: true,
      nomeCompleto: true,
      perfil: true,
    },
  });

  if (!usuario) redirect('/login');

  // precisaTrocar nao esta no select por seguranca de tipo; busca cru
  const dadosExtra = await prisma.usuario.findUnique({
    where: { id: usuario.id },
  });
  const precisaTrocar = ((dadosExtra as any)?.precisaTrocar ?? false) as boolean;
  // admin (inclusive por encargo) segue com a regra forte de senha
  const admin = String((session?.user as any)?.perfil ?? '').toLowerCase() === 'admin';

  return (
    <div className="min-h-screen bg-[#08111F] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0F1B2D] border-2 border-[#D4AF37] mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#E8EEF6]">{precisaTrocar ? 'Crie a sua senha' : 'Trocar Senha'}</h1>
          <p className="text-sm text-[#E8EEF6]/60 mt-1">
            {usuario.nomeCompleto ?? usuario.login} — Login: {usuario.login}
          </p>
        </div>

        {/* 1º acesso: o caminho em 4 passos curtos (a tropa tem dificuldade com informática) */}
        {precisaTrocar && (
          <div className="mb-4 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 p-4 text-sm text-[#f3df9d]">
            <p className="mb-2 font-bold text-[#D4AF37]">Primeiro acesso: é rápido!</p>
            <ol className="space-y-1.5">
              {(admin
                ? ['Digite a senha nova (mínimo 8 caracteres, com letras e números).', 'Repita a mesma senha.', 'Marque “Li e aceito”.', 'Toque em “Salvar e continuar”.']
                : ['Digite uma senha nova (pelo menos 6 números ou letras).', 'Repita a mesma senha.', 'Marque “Li e aceito”.', 'Toque em “Salvar e continuar”.']
              ).map((p, k) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-[11px] font-bold text-[#1a1205]">{k + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-[#E8EEF6]/70">Você continua no sistema depois de salvar — não precisa entrar de novo.</p>
          </div>
        )}

        <TrocarSenhaForm precisaTrocar={precisaTrocar} admin={admin} />
      </div>
    </div>
  );
}