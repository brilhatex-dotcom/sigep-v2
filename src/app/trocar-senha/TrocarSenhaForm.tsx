'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { TERMO_TITULO, TERMO_BLOCOS, TERMO_VERSAO } from '@/lib/termoLgpd';

interface Props {
  precisaTrocar: boolean;
}

export default function TrocarSenhaForm({ precisaTrocar }: Props) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [verTermo, setVerTermo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const validar = (): string | null => {
    if (!precisaTrocar && senhaAtual.length < 4) {
      return 'Informe sua senha atual.';
    }
    if (novaSenha.length < 8) {
      return 'A nova senha deve ter no mínimo 8 caracteres.';
    }
    if (/^(.)\1+$/.test(novaSenha)) {
      return 'A senha não pode ser um único caractere repetido (ex.: 11111111).';
    }
    if (!/[a-zA-ZÀ-ÿ]/.test(novaSenha) || !/[^a-zA-ZÀ-ÿ]/.test(novaSenha)) {
      return 'Misture letras com números ou símbolos (ex.: Sigep@2026).';
    }
    if (/12345678|01234567|abcdefgh|qwertyui/i.test(novaSenha)) {
      return 'A senha não pode ser uma sequência óbvia (ex.: 12345678).';
    }
    if (novaSenha !== confirmar) {
      return 'A confirmacao nao confere com a nova senha.';
    }
    if (!precisaTrocar && novaSenha === senhaAtual) {
      return 'A nova senha deve ser diferente da atual.';
    }
    if (!aceite) {
      return 'É necessário ler e aceitar o Termo de Consentimento (LGPD) para continuar.';
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
          aceiteTermo: aceite,
          termoVersao: TERMO_VERSAO,
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
      <div className="bg-painel border border-ouro/40 rounded-xl p-6 text-center">
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
        <p className="text-texto font-medium">Senha alterada com sucesso!</p>
        <p className="text-sm text-texto/60 mt-1">Redirecionando para o login...</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-painel border border-ouro/20 rounded-xl p-6 space-y-4"
    >
      {!precisaTrocar && (
        <div>
          <label className="block text-sm font-medium text-texto mb-1">
            Senha atual
          </label>
          <input
            type={mostrar ? 'text' : 'password'}
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            maxLength={40}
            className="w-full px-3 py-2 rounded-lg bg-fundo border border-ouro/30 text-texto placeholder-texto/30 focus:outline-none focus:border-ouro focus:ring-1 focus:ring-ouro tracking-widest"
            placeholder="Digite sua senha atual"
            required
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-texto mb-1">
          Nova senha <span className="text-texto/50 font-normal">(mínimo 8 caracteres — misture letras com números ou símbolos)</span>
        </label>
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          maxLength={40}
          className="w-full px-3 py-2 rounded-lg bg-fundo border border-ouro/30 text-texto placeholder-texto/30 focus:outline-none focus:border-ouro focus:ring-1 focus:ring-ouro tracking-widest"
          placeholder="Digite a nova senha"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-texto mb-1">
          Confirmar nova senha
        </label>
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          maxLength={40}
          className="w-full px-3 py-2 rounded-lg bg-fundo border border-ouro/30 text-texto placeholder-texto/30 focus:outline-none focus:border-ouro focus:ring-1 focus:ring-ouro tracking-widest"
          placeholder="Repita a nova senha"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-texto/70 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={mostrar}
          onChange={(e) => setMostrar(e.target.checked)}
          className="accent-ouro"
        />
        Mostrar senhas
      </label>

      {/* Termo de Consentimento LGPD — aceite obrigatório e registrado */}
      <div className="rounded-lg border border-ouro/25 bg-fundo p-3">
        <button
          type="button"
          onClick={() => setVerTermo((v) => !v)}
          className="flex w-full items-center justify-between text-left text-sm font-medium text-texto"
        >
          <span>📄 {TERMO_TITULO}</span>
          <span className="text-ouro">{verTermo ? '▲ ocultar' : '▼ ler'}</span>
        </button>
        {verTermo && (
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 text-[12px] leading-relaxed text-texto/75">
            {TERMO_BLOCOS.map((b) => (
              <p key={b.t}><b className="text-texto">{b.t}</b> {b.c}</p>
            ))}
          </div>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm text-texto/85 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-ouro"
          />
          <span>Li e <b>aceito</b> o Termo de Consentimento (LGPD) e assumo a responsabilidade pelo uso pessoal e sigiloso das minhas credenciais.</span>
        </label>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
          {erro}
        </div>
      )}

      <button
        type="submit"
        disabled={carregando || !aceite}
        className="w-full py-2.5 rounded-lg bg-ouro text-fundo font-semibold hover:bg-ouro/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {carregando ? 'Salvando...' : 'Trocar senha'}
      </button>

      {!precisaTrocar && (
        <button
          type="button"
          onClick={() => router.back()}
          disabled={carregando}
          className="w-full py-2 rounded-lg border border-ouro/30 text-texto hover:bg-ouro/10 transition text-sm"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}