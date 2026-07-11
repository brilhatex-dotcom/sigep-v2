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
          <h1 className="text-2xl font-bold text-[#E8EEF6]">Trocar Senha</h1>
          <p className="text-sm text-[#E8EEF6]/60 mt-1">
            {usuario.nomeCompleto ?? usuario.login} — Login: {usuario.login}
          </p>
        </div>

        {precisaTrocar && (
          <div className="mb-4 p-3 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/40 text-[#D4AF37] text-sm">
            Sua senha foi resetada pelo administrador. Defina uma nova senha pessoal para continuar.
          </div>
        )}

        <TrocarSenhaForm precisaTrocar={precisaTrocar} />
      </div>
    </div>
  );
}