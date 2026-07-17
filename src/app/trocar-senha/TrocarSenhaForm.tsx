'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface Props {
  precisaTrocar: boolean;
}

export default function TrocarSenhaForm({ precisaTrocar }: Props) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const validar = (): string | null => {
    if (!precisaTrocar && senhaAtual.length < 4) {
      return 'Informe sua senha atual.';
    }
    if (novaSenha.length < 4) {
      return 'A nova senha deve ter no mínimo 4 caracteres.';
    }
    if (/^(.)\1+$/.test(novaSenha)) {
      return 'A senha não pode ser um único caractere repetido (ex.: 1111).';
    }
    if (novaSenha === '123456') {
      return 'Por segurança, escolha uma senha diferente da padrão.';
    }
    if (novaSenha !== confirmar) {
      return 'A confirmacao nao confere com a nova senha.';
    }
    if (!precisaTrocar && novaSenha === senhaAtual) {
      return 'A nova senha deve ser diferente da atual.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const erroValidacao = validar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    setCarregando(true);
    try {
      const resp = await fetch('/api/trocar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senhaAtual: precisaTrocar ? null : senhaAtual,
          novaSenha,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setErro(data?.erro || 'Falha ao trocar a senha.');
        setCarregando(false);
        return;
      }

      setSucesso(true);
      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push('/login?trocada=1');
      }, 1500);
    } catch {
      setErro('Erro de comunicacao com o servidor.');
      setCarregando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="bg-[#0F1B2D] border border-[#D4AF37]/40 rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-[#E8EEF6] font-medium">Senha alterada com sucesso!</p>
        <p className="text-sm text-[#E8EEF6]/60 mt-1">Redirecionando para o login...</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#0F1B2D] border border-[#D4AF37]/20 rounded-xl p-6 space-y-4"
    >
      {!precisaTrocar && (
        <div>
          <label className="block text-sm font-medium text-[#E8EEF6] mb-1">
            Senha atual
          </label>
          <input
            type={mostrar ? 'text' : 'password'}
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            maxLength={40}
            className="w-full px-3 py-2 rounded-lg bg-[#08111F] border border-[#D4AF37]/30 text-[#E8EEF6] placeholder-[#E8EEF6]/30 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] tracking-widest"
            placeholder="Digite sua senha atual"
            required
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-[#E8EEF6] mb-1">
          Nova senha <span className="text-[#E8EEF6]/50 font-normal">(mínimo 4 caracteres — pode usar letras e números)</span>
        </label>
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          maxLength={40}
          className="w-full px-3 py-2 rounded-lg bg-[#08111F] border border-[#D4AF37]/30 text-[#E8EEF6] placeholder-[#E8EEF6]/30 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] tracking-widest"
          placeholder="Digite a nova senha"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#E8EEF6] mb-1">
          Confirmar nova senha
        </label>
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          maxLength={40}
          className="w-full px-3 py-2 rounded-lg bg-[#08111F] border border-[#D4AF37]/30 text-[#E8EEF6] placeholder-[#E8EEF6]/30 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] tracking-widest"
          placeholder="Repita a nova senha"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-[#E8EEF6]/70 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={mostrar}
          onChange={(e) => setMostrar(e.target.checked)}
          className="accent-[#D4AF37]"
        />
        Mostrar senhas
      </label>

      {erro && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
          {erro}
        </div>
      )}

      <button
        type="submit"
        disabled={carregando}
        className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-[#08111F] font-semibold hover:bg-[#D4AF37]/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {carregando ? 'Salvando...' : 'Trocar senha'}
      </button>

      {!precisaTrocar && (
        <button
          type="button"
          onClick={() => router.back()}
          disabled={carregando}
          className="w-full py-2 rounded-lg border border-[#D4AF37]/30 text-[#E8EEF6] hover:bg-[#D4AF37]/10 transition text-sm"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}