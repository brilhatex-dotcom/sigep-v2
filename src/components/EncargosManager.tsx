"use client";

import { useEffect, useState } from "react";

/* Gestão de ENCARGOS (funções) dos logins. Busca o militar, escolhe a função e
   atribui. Dirige permissões (ex.: só o Chefe do P/1 dá o parecer da permuta e
   só o Subcmt dá o visto). Admin. */

type Opcao = { id: string; label: string };
type Item = { efetivoId: string; encargo: string; label: string; nome: string; numeroBarra: string };
type Achado = { efetivoId: string; postoGrad: string | null; numeroBarra: string | null; nome: string | null; nomeGuerra: string | null };

export default function EncargosManager() {
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<Achado | null>(null);
  const [encargo, setEncargo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    fetch("/api/admin/encargos").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setOpcoes(d.opcoes || []); setItens(d.itens || []); if (!encargo && d.opcoes?.[0]) setEncargo(d.opcoes[0].id); }
    }).catch(() => {});
  };
  useEffect(carregar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = async () => {
    if (busca.trim().length < 2) return;
    setBuscando(true);
    try {
      const r = await fetch("/api/admin/resetar-senha?busca=" + encodeURIComponent(busca.trim()));
      const d = await r.json().catch(() => ({}));
      setAchados(d.resultados || []);
    } finally { setBuscando(false); }
  };

  const nomeAchado = (a: Achado) => [a.postoGrad || "", (a.numeroBarra ? "nº " + a.numeroBarra : ""), (a.nomeGuerra || a.nome || "")].filter(Boolean).join(" ").trim();

  const atribuir = async () => {
    if (!sel || !encargo) { setMsg("Escolha o militar e a função."); return; }
    setSalvando(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/encargos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efetivoId: sel.efetivoId, encargo }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error || "Falha ao salvar."); return; }
      setMsg(`✓ ${nomeAchado(sel)} → ${opcoes.find((o) => o.id === encargo)?.label}.`);
      setSel(null); setBusca(""); setAchados([]); carregar();
    } catch { setMsg("Erro de conexão."); }
    finally { setSalvando(false); }
  };

  const remover = async (efetivoId: string) => {
    if (!confirm("Remover esta função?")) return;
    try {
      const r = await fetch("/api/admin/encargos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efetivoId, encargo: "" }) });
      if (r.ok) carregar();
    } catch {}
  };

  return (
    <div style={{ background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 12, padding: 18, marginBottom: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#D4AF37", marginBottom: 4 }}>Encargos / Funções</div>
      <p style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 12 }}>
        Defina quem é o Comandante, Subcmt, Chefe do P/1 etc. Isso trava quem assina o quê — ex.: só o <b>Chefe do P/1</b> dá o parecer da permuta e só o <b>Subcomandante</b> dá o visto (favorável/não).
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, color: "#94A3B8" }}>Militar</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={sel ? nomeAchado(sel) : busca} onChange={(e) => { setSel(null); setBusca(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} placeholder="nome, matrícula, barra…"
              style={inp} />
            {sel ? <button onClick={() => { setSel(null); setBusca(""); }} style={btnSec}>✕</button>
              : <button onClick={buscar} disabled={buscando} style={btnSec}>{buscando ? "…" : "Buscar"}</button>}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#94A3B8" }}>Função</label>
          <select value={encargo} onChange={(e) => setEncargo(e.target.value)} style={{ ...inp, minWidth: 200 }}>
            {opcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={atribuir} disabled={salvando || !sel} style={btnPri}>{salvando ? "Salvando…" : "Atribuir"}</button>
      </div>

      {!sel && achados.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {achados.map((a) => (
            <button key={a.efetivoId} onClick={() => { setSel(a); setAchados([]); }} style={achadoBtn}>{nomeAchado(a)}</button>
          ))}
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, color: "#cfe6d6", background: "#12351f", border: "1px solid #1f5a34", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>{msg}</div>}

      <div style={{ borderTop: "1px solid #16233a", paddingTop: 10 }}>
        {itens.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#7f93b3" }}>Nenhuma função atribuída ainda.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {itens.map((it) => (
              <li key={it.efetivoId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a1626", border: "1px solid #28395a", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 13, color: "#E8EEF6" }}><b style={{ color: "#D4AF37" }}>{it.label}</b> — {it.nome}{it.numeroBarra ? ` (nº ${it.numeroBarra})` : ""}</span>
                <button onClick={() => remover(it.efetivoId)} style={{ background: "none", border: "1px solid #7a1f1f", color: "#ffb3b3", borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontSize: 12 }}>Remover</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 8, padding: "8px 10px", fontSize: 13 };
const btnSec: React.CSSProperties = { background: "#16243a", color: "#E8EEF6", border: "1px solid #2b3f63", borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13 };
const btnPri: React.CSSProperties = { background: "#D4AF37", color: "#1a1205", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const achadoBtn: React.CSSProperties = { textAlign: "left", background: "#0a1626", color: "#cdd9ea", border: "1px solid #28395a", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13 };
