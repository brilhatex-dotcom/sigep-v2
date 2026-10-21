'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TERMO_TITULO, TERMO_BLOCOS, TERMO_VERSAO } from '@/lib/termoLgpd';

interface Props {
  precisaTrocar: boolean;
  /* admin segue com a regra forte de senha; o policial, com a simples
     (pedido do P/1: a tropa tem dificuldade com informática) */
  admin: boolean;
}

export default function TrocarSenhaForm({ precisaTrocar, admin }: Props) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [verTermo, setVerTermo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [destino, setDestino] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const validar = (): string | null => {
    if (!precisaTrocar && senhaAtual.length < 4) {
      return 'Informe a sua senha atual.';
    }
    if (!admin) {
      // policial: qualquer senha com 6 ou mais caracteres (o servidor confere de novo)
      if (novaSenha.length < 6) return 'A senha precisa ter pelo menos 6 números ou letras.';
      if (novaSenha === '12345678') return 'Essa é a senha inicial. Crie uma senha diferente de 12345678.';
      if (['123456', '654321', '123123'].includes(novaSenha) || /^(.)\1+$/.test(novaSenha)) {
        return 'Essa senha é muito fácil de adivinhar (ex.: 123456, 111111). Escolha outra — pode ser só números.';
      }
    } else {
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
    }
    if (novaSenha !== confirmar) {
      return 'As duas senhas não estão iguais. Digite a mesma senha nos dois campos.';
    }
    if (!precisaTrocar && novaSenha === senhaAtual) {
      return 'A nova senha deve ser diferente da atual.';
    }
    if (!aceite) {
      return 'Marque o quadradinho “Li e aceito” para continuar.';
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

      /* Continua LOGADO (pedido do P/1: não precisa sair e entrar de novo).
         No 1º acesso o token ainda diz "precisa trocar a senha": a chamada a
         /api/auth/session regrava o token (ver o jwt em lib/auth) e o
         policial segue para onde o servidor mandou — as certidões, para quem
         está no Limite Quantitativo. Carga completa, não router.push: o
         navegador guarda as telas por alguns segundos (staleTimes) e
         devolveria a tela de "primeiro acesso". */
      setSucesso(true);
      if (precisaTrocar) {
        const ir = typeof data?.destino === 'string' && data.destino.startsWith('/') ? data.destino : '/ficha';
        setDestino(ir);
        try { await fetch('/api/auth/session', { cache: 'no-store' }); } catch { /* segue: o servidor confere de novo */ }
        setTimeout(() => window.location.assign(ir), 900);
      } else {
        setTimeout(() => {
          if (window.history.length > 1) router.back();
          else window.location.assign('/ficha');
        }, 1200);
      }
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
        <p className="text-[#E8EEF6] font-medium">{precisaTrocar ? 'Senha criada!' : 'Senha alterada com sucesso!'}</p>
        <p className="text-sm text-[#E8EEF6]/60 mt-1">
          {!precisaTrocar ? 'Voltando...'
            : destino?.includes('minhas-certidoes') ? 'Abrindo a aba Promoções / Certidões...'
            : 'Entrando no sistema...'}
        </p>
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
          {admin
            ? <>Nova senha <span className="text-[#E8EEF6]/50 font-normal">(mínimo 8 caracteres — misture letras com números ou símbolos)</span></>
            : <>{precisaTrocar ? 'Crie a sua senha' : 'Nova senha'} <span className="text-[#E8EEF6]/50 font-normal">(pelo menos 6 números ou letras)</span></>}
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
          {admin ? 'Confirmar nova senha' : 'Repita a mesma senha'}
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

      {/* Termo de Consentimento LGPD — aceite obrigatório e registrado */}
      <div className="rounded-lg border border-[#D4AF37]/25 bg-[#08111F] p-3">
        <button
          type="button"
          onClick={() => setVerTermo((v) => !v)}
          className="flex w-full items-center justify-between text-left text-sm font-medium text-[#E8EEF6]"
        >
          <span>📄 {TERMO_TITULO}</span>
          <span className="text-[#D4AF37]">{verTermo ? '▲ ocultar' : '▼ ler'}</span>
        </button>
        {verTermo && (
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 text-[12px] leading-relaxed text-[#E8EEF6]/75">
            {TERMO_BLOCOS.map((b) => (
              <p key={b.t}><b className="text-[#E8EEF6]">{b.t}</b> {b.c}</p>
            ))}
          </div>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm text-[#E8EEF6]/85 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-[#D4AF37]"
          />
          <span>Li e <b>aceito</b> o Termo de Consentimento (LGPD) e assumo a responsabilidade pelo uso pessoal e sigiloso das minhas credenciais.</span>
        </label>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
          {erro}
        </div>
      )}

      {/* não fica apagado sem o aceite: tocado, ele diz o que falta (quem
          tem pouca intimidade com o celular achava que estava travado) */}
      <button
        type="submit"
        disabled={carregando}
        className="w-full py-3 rounded-lg bg-[#D4AF37] text-base text-[#08111F] font-bold hover:bg-[#D4AF37]/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {carregando ? 'Salvando...' : precisaTrocar ? 'Salvar e continuar' : 'Trocar senha'}
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