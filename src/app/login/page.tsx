"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
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
      setErro("Login ou senha inválidos.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sigep-navy p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sigep-navy">
            <ShieldCheck className="h-8 w-8 text-sigep-dourado" />
          </div>
          <h1 className="text-xl font-bold text-sigep-navy">SIGEP 18º BPM</h1>
          <p className="text-sm text-gray-500">Sistema de Gestão de Pessoal</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Login
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-sigep-dourado"
              placeholder="Seu login"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-sigep-dourado"
              placeholder="••••••••"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            onClick={entrar}
            disabled={carregando}
            className="w-full rounded-lg bg-sigep-navy py-2.5 font-semibold text-white transition hover:bg-sigep-azul disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </main>
  );
}
