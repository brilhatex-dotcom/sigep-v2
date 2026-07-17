"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  CalendarDays,
  ClipboardList,
  Gavel,
  Users,
  BarChart3,
  History,
  ShieldAlert,
  Quote,
} from "lucide-react";
import Chuva from "@/components/Chuva";
import "./login.css";

const RECURSOS = [
  { Icone: CalendarDays, texto: "Escalas e Serviços" },
  { Icone: ClipboardList, texto: "Boletins e Ocorrências" },
  { Icone: Gavel, texto: "Audiências" },
  { Icone: Users, texto: "Efetivo" },
  { Icone: BarChart3, texto: "Relatórios Gerenciais" },
  { Icone: History, texto: "Histórico e Movimentações" },
  { Icone: ShieldAlert, texto: "Segurança e Auditoria" },
];

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro("");
    setCarregando(true);
    const res = await signIn("credentials", {
      login,
      senha,
      redirect: false,
    });
    setCarregando(false);
    if (res?.error) {
      setErro("Usuário ou senha inválidos.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070f] text-white">
      {/* fundo: viatura (esq) + sala de operacoes (dir) */}
      <div className="absolute inset-0">
        <div className="absolute inset-y-0 left-0 hidden w-1/2 lg:block">
          <Image
            src="/login/viatura.png"
            alt="Viatura Polícia Militar"
            fill
            priority
            className="object-cover object-center opacity-80"
          />
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block">
          <Image
            src="/login/sala-operacoes.png"
            alt="Centro de Operações"
            fill
            priority
            className="object-cover object-center opacity-60"
          />
        </div>
        {/* mobile: so a viatura cobrindo tudo */}
        <div className="absolute inset-0 lg:hidden">
          <Image
            src="/login/viatura.png"
            alt=""
            fill
            priority
            className="object-cover opacity-50"
          />
        </div>
      </div>

      {/* camadas de atmosfera */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070f]/70 via-[#05070f]/40 to-[#05070f]/95" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent_30%,#05070f_100%)]" />
      <div className="giro-azul" />
      <div className="giro-vermelho" />
      <Chuva quantidade={70} />

      {/* conteudo */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6">
        {/* topo institucional */}
        <header className="sigep-fade sigep-d1 mb-6 text-center">
          <p className="text-xs font-semibold tracking-[0.35em] text-sigep-dourado sm:text-sm">
            ★ POLÍCIA MILITAR DO MARANHÃO ★
          </p>
          <h1 className="mt-1 text-2xl font-extrabold uppercase tracking-wide drop-shadow-lg sm:text-4xl">
            18º Batalhão de Polícia Militar
          </h1>
          <p className="mt-1 text-xs tracking-[0.3em] text-white/70 sm:text-sm">
            — GUARDIÃO DA REGIÃO CENTRAL DO MARANHÃO —
          </p>
        </header>

        {/* tres colunas */}
        <div className="grid flex-1 grid-cols-1 items-start gap-6 lg:grid-cols-3">
          {/* esquerda: sistema integrado */}
          <aside className="sigep-fade sigep-d2 order-2 hidden lg:order-1 lg:mt-64 lg:block">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-sigep-dourado">
                Sistema Integrado
              </h2>
              <ul className="space-y-3">
                {RECURSOS.map(({ Icone, texto }) => (
                  <li key={texto} className="flex items-center gap-3 text-sm text-white/85">
                    <Icone className="h-4 w-4 shrink-0 text-sigep-dourado" />
                    {texto}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* centro: brasao + card de login */}
          <div className="order-1 lg:order-2">
            <div className="sigep-fade sigep-d2 mb-5 flex flex-col items-center text-center">
              <div className="relative">
                <div className="glow-dourado absolute -inset-3 rounded-full bg-sigep-dourado/30 blur-xl" />
                <Image
                  src="/login/brasao-18bpm.png"
                  alt="Brasão 18º BPM"
                  width={96}
                  height={120}
                  className="relative drop-shadow-2xl"
                />
              </div>
              <h2 className="mt-3 text-2xl font-extrabold">
                SIGEP-<span className="text-sigep-dourado">18BPM</span>
              </h2>
              <p className="text-xs text-white/70">
                Sistema Integrado de Gestão de Efetivo Policial
              </p>
              <span className="mt-2 rounded-full border border-sigep-dourado/50 px-3 py-0.5 text-[11px] font-medium tracking-wide text-sigep-dourado">
                18º BPM • PRESIDENTE DUTRA - MA
              </span>
            </div>

            <div className="sigep-fade sigep-d3 rounded-2xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-center gap-2 text-sigep-dourado">
                <Lock className="h-5 w-5" />
                <h3 className="text-base font-bold">Acesso ao Sistema</h3>
              </div>

              <label className="mb-1 block text-xs font-medium text-white/80">Login</label>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3">
                <User className="h-4 w-4 text-white/50" />
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Digite seu usuário"
                  className="w-full bg-transparent py-2.5 text-sm text-white placeholder-white/40 outline-none"
                />
              </div>

              <label className="mb-1 block text-xs font-medium text-white/80">Senha</label>
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3">
                <Lock className="h-4 w-4 text-white/50" />
                <input
                  type={verSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && entrar()}
                  placeholder="Digite sua senha"
                  className="w-full bg-transparent py-2.5 text-sm text-white placeholder-white/40 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  className="text-white/50 hover:text-white"
                  aria-label="Mostrar senha"
                >
                  {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {erro && (
                <p className="mb-3 rounded-lg bg-red-500/20 py-2 text-center text-sm text-red-200">
                  {erro}
                </p>
              )}

              <button
                onClick={entrar}
                disabled={carregando}
                className="btn-dourado flex w-full items-center justify-center gap-2 rounded-lg py-3 font-bold text-[#1a1205] disabled:opacity-70"
              >
                <ShieldCheck className="h-5 w-5" />
                {carregando ? "ENTRANDO..." : "ENTRAR"}
              </button>

              <div className="mt-4 rounded-lg border border-sigep-dourado/30 bg-black/20 p-3 text-center text-xs italic text-white/75">
                <p className="leading-relaxed">
                  Se o SENHOR não edificar a casa, em vão trabalham os que a
                  edificam; se o SENHOR não guardar a cidade, em vão vigia a
                  sentinela.
                </p>
                <p className="mt-1 not-italic font-semibold text-sigep-dourado">
                  Salmos 127.1
                </p>
              </div>

              <a href="/verificar" className="mt-4 block text-center text-xs text-white/70 hover:text-sigep-dourado">
                🔎 Verificar autenticidade de documento
              </a>
            </div>
          </div>

          {/* direita: citacao */}
          <aside className="sigep-fade sigep-d4 order-3 hidden lg:mt-64 lg:block">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
              <Quote className="mb-3 h-8 w-8 text-sigep-dourado" />
              <p className="text-sm italic leading-relaxed text-white/85">
                A missão da Polícia Militar é servir e proteger a sociedade,
                garantindo a ordem pública com honra, disciplina e
                responsabilidade.
              </p>
            </div>
          </aside>
        </div>

        {/* rodape */}
        <footer className="sigep-fade sigep-d4 mt-6 border-t border-white/10 pt-4 text-center text-xs text-white/60">
          <p className="font-semibold text-white/80">Polícia Militar do Maranhão</p>
          <p>18º BPM - Presidente Dutra - MA · Sistema Integrado de Gestão de Efetivo Policial</p>
          <p className="mt-1 text-sigep-dourado/80">
            &lt;/&gt; Desenvolvido por CB PM ELVYS DANILO
          </p>
        </footer>
      </div>
    </main>
  );
}
