"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function TrocaSenhaClient({ nome }: { nome: string }) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const primeiro = (nome || "").split(" ")[0] || "Policial";

  const enviar = async () => {
    setErro(null);
    if (nova.length < 6) return setErro("A nova senha deve ter ao menos 6 caracteres.");
    if (nova !== conf) return setErro("A confirmação não confere com a nova senha.");
    if (nova === senhaAtual) return setErro("A nova senha deve ser diferente da atual.");

    setCarregando(true);
    try {
      const r = await fetch("/api/conta/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha: nova }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao trocar a senha."); return; }
      setOk(true);
      // forca novo login para a sessao refletir precisaTrocar=false
      setTimeout(() => signOut({ callbackUrl: "/login" }), 1600);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={S.wrap}>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL }} />
      <div style={S.card}>
        <div style={S.brasaoLinha}>
          <div style={S.logoTxt}>SIGEP-<span style={{ color: "#D4AF37" }}>18BPM</span></div>
        </div>

        <h1 style={S.titulo}>Defina sua senha</h1>
        <p style={S.sub}>
          Olá, {primeiro}. Este é seu primeiro acesso. Por segurança, troque a senha
          inicial (seu ID) por uma senha pessoal antes de continuar.
        </p>

        {ok ? (
          <div style={S.sucesso}>
            ✓ Senha alterada com sucesso. Redirecionando para um novo login...
          </div>
        ) : (
          <>
            <label style={S.label}>Senha atual (seu ID)
              <input style={S.input} type="password" value={senhaAtual} autoComplete="current-password"
                onChange={(e) => setSenhaAtual(e.target.value)} placeholder="ex: 849988" />
            </label>
            <label style={S.label}>Nova senha
              <input style={S.input} type="password" value={nova} autoComplete="new-password"
                onChange={(e) => setNova(e.target.value)} placeholder="mínimo 6 caracteres" />
            </label>
            <label style={S.label}>Confirme a nova senha
              <input style={S.input} type="password" value={conf} autoComplete="new-password"
                onChange={(e) => setConf(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} placeholder="repita a nova senha" />
            </label>

            {erro && <div style={S.erro}>{erro}</div>}

            <button style={{ ...S.btn, opacity: carregando ? 0.6 : 1 }} disabled={carregando} onClick={enviar}>
              {carregando ? "Salvando..." : "Salvar nova senha"}
            </button>

            <button style={S.sair} onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
          </>
        )}
      </div>
    </div>
  );
}

const GLOBAL = `body{ margin:0; background:#08111F; }`;

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08111F", padding: 20, fontFamily: "ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif" },
  card: { width: "100%", maxWidth: 380, background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 16, padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,.5)", color: "#E8EEF6" },
  brasaoLinha: { display: "flex", justifyContent: "center", marginBottom: 14 },
  logoTxt: { fontSize: 18, fontWeight: 800, letterSpacing: ".5px" },
  titulo: { margin: "0 0 6px", fontSize: 19, fontWeight: 700, color: "#D4AF37", textAlign: "center" },
  sub: { margin: "0 0 18px", fontSize: 13, color: "#9fb0c7", lineHeight: 1.5, textAlign: "center" },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#9fb0c7", marginBottom: 12 },
  input: { background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 9, padding: "10px 12px", fontSize: 14 },
  erro: { background: "#3a1414", color: "#ffb3b3", border: "1px solid #7a1f1f", borderRadius: 9, padding: "9px 12px", fontSize: 13, marginBottom: 12 },
  sucesso: { background: "#10301f", color: "#bff0d0", border: "1px solid #2e6b48", borderRadius: 9, padding: "12px 14px", fontSize: 14, textAlign: "center" },
  btn: { width: "100%", background: "#D4AF37", color: "#0a1020", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  sair: { width: "100%", marginTop: 10, background: "none", color: "#9fb0c7", border: "1px solid #2b3f63", borderRadius: 9, padding: "9px", fontSize: 13, cursor: "pointer" },
};
