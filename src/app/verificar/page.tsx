"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* Página PÚBLICA de verificação de autenticidade (tipo "validar documento").
   A pessoa digita o número do protocolo e é levada ao resultado. Não precisa
   de login. Também é o destino dos QR Codes das permutas. */
export default function VerificarPage() {
  const router = useRouter();
  const [valor, setValor] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let v = valor.trim();
    if (!v) return;
    // aceita colar a URL inteira ou só o protocolo
    const m = v.match(/permuta\/([^/?#]+)/i);
    if (m) v = decodeURIComponent(m[1]);
    v = v.toUpperCase().replace(/\s+/g, "");
    router.push(`/verificar/permuta/${encodeURIComponent(v)}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a1220", color: "#e6edf7", fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 16, padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>🔎</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>Verificar Autenticidade</div>
          <div style={{ fontSize: 13, color: "#8fa3bf", marginTop: 2 }}>SIGEP · 18º BPM — documentos e permutas</div>
        </div>

        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, color: "#cdd9ea", marginBottom: 6 }}>Número do protocolo</label>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="PER-2026-000245"
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 10, padding: "12px 14px", fontSize: 15, outline: "none", letterSpacing: 0.5 }}
          />
          <button type="submit" style={{ width: "100%", marginTop: 12, background: "#D4AF37", color: "#1a1205", border: "none", borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Verificar
          </button>
        </form>

        <p style={{ fontSize: 12, color: "#8fa3bf", marginTop: 16, lineHeight: 1.6, textAlign: "center" }}>
          Digite o número do protocolo do documento (ex.: <b>PER-2026-000245</b>) ou aponte a câmera no <b>QR Code</b> da folha. A verificação confirma se o documento é autêntico e não foi alterado — sem exibir dados pessoais (LGPD).
        </p>
      </div>
    </div>
  );
}
