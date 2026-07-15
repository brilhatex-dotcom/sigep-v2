"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Controle de Entrada e Saída (Centro de Comando).
   Registra a SAÍDA do policial (destino/motivo) e depois o RETORNO (entrada).
   Painel de quem está fora agora, filtro por ano e totais. Admin. Config. */

type Mov = {
  id: string; efetivoId: string; nome: string;
  data: string; horaSaida: string; destino: string; motivo: string;
  horaEntrada: string; dataEntrada: string; status: "fora" | "retornou";
  obs: string; registradoPor: string; criadoEm: string;
};
type Militar = { id: string; postoGrad: string; nome: string; nomeGuerra: string; numeroBarra: string };

function brData(iso: string) { return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—"; }
function abrev(p: string) {
  const m: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "major": "Maj", "capitão": "Cap", "capitao": "Cap",
    "1º tenente": "1º Ten", "2º tenente": "2º Ten", "aspirante a oficial": "Asp. Of.", "subtenente": "Sub Ten",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt", "cabo": "Cb", "soldado": "Sd",
  };
  return m[(p || "").trim().toLowerCase()] ?? (p || "").trim();
}
function nomeMil(m: Militar) { return [abrev(m.postoGrad), (m.nomeGuerra || m.nome || "").trim()].filter(Boolean).join(" "); }
function agoraHora() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
const hoje = () => new Date().toISOString().slice(0, 10);

export default function CentroComandoClient() {
  const [itens, setItens] = useState<Mov[]>([]);
  const [anos, setAnos] = useState<string[]>([]);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // efetivo para o buscador
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null)).then((d) => setEfetivo(Array.isArray(d?.efetivo) ? d.efetivo : [])).catch(() => {});
  }, []);

  // formulário de nova saída
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Militar | null>(null);
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje());
  const [horaSaida, setHoraSaida] = useState(agoraHora());
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const buscaRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/centro-comando?ano=${encodeURIComponent(ano)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setItens(Array.isArray(d?.itens) ? d.itens : []); if (Array.isArray(d?.anos)) setAnos(d.anos); })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setAberto(false); };
    window.addEventListener("click", fora);
    return () => window.removeEventListener("click", fora);
  }, []);

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return efetivo.slice(0, 8);
    return efetivo.filter((m) => `${m.postoGrad} ${m.nome} ${m.nomeGuerra} ${m.numeroBarra}`.toLowerCase().includes(t)).slice(0, 12);
  }, [busca, efetivo]);

  const limpar = () => { setSel(null); setBusca(""); setDestino(""); setMotivo(""); setObs(""); setData(hoje()); setHoraSaida(agoraHora()); };

  const registrarSaida = async () => {
    if (!sel) { alert("Escolha o policial no buscador."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/centro-comando", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId: sel.id, nome: nomeMil(sel), data, horaSaida, destino, motivo, obs, status: "fora" }),
      });
      if (!r.ok) throw new Error();
      limpar(); carregar();
    } catch { alert("Não foi possível registrar a saída."); }
    finally { setSalvando(false); }
  };

  const registrarRetorno = async (m: Mov) => {
    const h = prompt("Hora do retorno (HH:MM):", agoraHora());
    if (h === null) return;
    try {
      const r = await fetch(`/api/centro-comando?id=${encodeURIComponent(m.id)}&acao=retorno`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ horaEntrada: h.trim() }),
      });
      if (!r.ok) throw new Error();
      carregar();
    } catch { alert("Não foi possível registrar o retorno."); }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover este registro de movimentação?")) return;
    try {
      const r = await fetch(`/api/centro-comando?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItens((l) => l.filter((x) => x.id !== id));
    } catch { alert("Não foi possível remover."); }
  };

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo
    ? itens.filter((m) => `${m.nome} ${m.destino} ${m.motivo}`.toLowerCase().includes(termo))
    : itens;
  const fora = itens.filter((m) => m.status === "fora");

  return (
    <div className="cc-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cc-top">
        <div>
          <h1 className="cc-tit">🚪 Controle de Entrada e Saída</h1>
          <p className="cc-sub">Centro de Comando — registro de movimentação do efetivo (saída e retorno).</p>
        </div>
      </div>

      {/* painel: quem está fora agora */}
      <div className={`cc-fora ${fora.length ? "on" : ""}`}>
        <div className="cc-fora-h"><b>{fora.length}</b> {fora.length === 1 ? "policial fora" : "policiais fora"} do Centro de Comando agora</div>
        {fora.length > 0 && (
          <div className="cc-fora-lista">
            {fora.map((m) => (
              <span key={m.id} className="cc-chip">
                {m.nome} · saiu {m.horaSaida || "—"}{m.destino ? ` → ${m.destino}` : ""}
                <button onClick={() => registrarRetorno(m)} title="Registrar retorno">↩ retorno</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* nova saída */}
      <div className="cc-form">
        <div className="cc-form-tit">Registrar saída</div>
        <div className="cc-grid">
          <div className="cc-campo cc-col2" ref={buscaRef}>
            <label>Policial</label>
            <div className="cc-busca-wrap">
              <input
                value={sel ? nomeMil(sel) : busca}
                onChange={(e) => { setSel(null); setBusca(e.target.value); setAberto(true); }}
                onFocus={() => setAberto(true)}
                placeholder="Digite posto, nome ou nº/barra…"
              />
              {sel && <button className="cc-x" onClick={() => { setSel(null); setBusca(""); }} title="Trocar">✕</button>}
              {aberto && !sel && sugestoes.length > 0 && (
                <div className="cc-sug">
                  {sugestoes.map((m) => (
                    <button key={m.id} onClick={() => { setSel(m); setAberto(false); setBusca(""); }}>
                      <b>{nomeMil(m)}</b>{m.numeroBarra ? <span className="cc-barra"> · {m.numeroBarra}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="cc-campo"><label>Data</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="cc-campo"><label>Hora de saída</label><input type="time" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} /></div>
          <div className="cc-campo cc-col2"><label>Destino</label><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="para onde vai" /></div>
          <div className="cc-campo cc-col2"><label>Motivo</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="diligência, missão, dispensa…" /></div>
          <div className="cc-campo cc-col4"><label>Observações</label><input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <div className="cc-form-btns">
          <button className="ok" onClick={registrarSaida} disabled={salvando || !sel}>{salvando ? "Salvando…" : "Registrar saída"}</button>
          {(sel || destino || motivo) && <button onClick={limpar}>Limpar</button>}
        </div>
      </div>

      {/* controle / histórico */}
      <div className="cc-controle">
        <label className="cc-ano">Ano
          <select value={ano} onChange={(e) => setAno(e.target.value)}>
            {[String(new Date().getFullYear()), ...anos.filter((a) => a !== String(new Date().getFullYear()))].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div className="cc-stat"><b>{itens.length}</b> movimentações em {ano}</div>
        <div className="cc-stat"><b>{itens.filter((m) => m.status === "retornou").length}</b> concluídas</div>
        <input className="cc-busca2" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por policial, destino, motivo…" />
        <button className="cc-refresh" onClick={carregar} title="Atualizar">⟳</button>
      </div>

      {carregando ? (
        <div className="cc-vazio">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="cc-vazio">{termo ? "Nenhum resultado." : `Nenhuma movimentação registrada em ${ano}.`}</div>
      ) : (
        <div className="cc-tabela-wrap">
          <table className="cc-tabela">
            <thead>
              <tr><th>Policial</th><th>Data</th><th>Saída</th><th>Destino</th><th>Motivo</th><th>Retorno</th><th>Situação</th><th></th></tr>
            </thead>
            <tbody>
              {visiveis.map((m) => (
                <tr key={m.id} className={m.status === "fora" ? "cc-lin-fora" : ""}>
                  <td className="cc-nome">{m.nome}</td>
                  <td>{brData(m.data)}</td>
                  <td>{m.horaSaida || "—"}</td>
                  <td>{m.destino || "—"}</td>
                  <td>{m.motivo || "—"}</td>
                  <td>{m.status === "retornou" ? `${m.horaEntrada || "—"}${m.dataEntrada && m.dataEntrada !== m.data ? " (" + brData(m.dataEntrada) + ")" : ""}` : <button className="cc-ret" onClick={() => registrarRetorno(m)}>↩ registrar</button>}</td>
                  <td><span className={`cc-badge ${m.status}`}>{m.status === "fora" ? "Fora" : "Retornou"}</span></td>
                  <td><button className="cc-del" onClick={() => remover(m.id)} title="Remover">🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.cc-wrap{ color:#cdd9ea; }
.cc-tit{ font-size:20px; font-weight:800; color:#fff; margin:0; }
.cc-sub{ font-size:13px; color:#8fa3bf; margin:2px 0 14px; }
.cc-fora{ border:1px solid #1d2c44; background:#0F1B2D; border-radius:12px; padding:12px 14px; margin-bottom:14px; }
.cc-fora.on{ border-color:#7a4d12; background:#1c1608; }
.cc-fora-h{ font-size:13px; color:#cdd9ea; } .cc-fora-h b{ color:#f3df9d; font-size:16px; }
.cc-fora-lista{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.cc-chip{ display:inline-flex; align-items:center; gap:8px; background:#0a1626; border:1px solid #3a2f10; color:#f3df9d; border-radius:999px; padding:4px 6px 4px 12px; font-size:12px; }
.cc-chip button{ background:#3a2f10; color:#ffe9a8; border:none; border-radius:999px; padding:3px 9px; cursor:pointer; font-size:11px; }
.cc-chip button:hover{ background:#5a4718; }
.cc-form{ background:#0F1B2D; border:1px solid #2b3f63; border-radius:12px; padding:16px; margin-bottom:16px; }
.cc-form-tit{ font-weight:700; color:#D4AF37; margin-bottom:12px; }
.cc-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
@media(max-width:820px){ .cc-grid{ grid-template-columns:1fr 1fr; } }
@media(max-width:520px){ .cc-grid{ grid-template-columns:1fr; } }
.cc-campo{ display:flex; flex-direction:column; gap:4px; }
.cc-col2{ grid-column:span 2; } .cc-col4{ grid-column:1 / -1; }
@media(max-width:520px){ .cc-col2,.cc-col4{ grid-column:1 / -1; } }
.cc-campo label{ font-size:12px; color:#94a3b8; }
.cc-campo input, .cc-campo select{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.cc-campo input:focus, .cc-campo select:focus{ outline:none; border-color:#D4AF37; }
.cc-busca-wrap{ position:relative; }
.cc-busca-wrap > input{ width:100%; box-sizing:border-box; }
.cc-x{ position:absolute; right:6px; top:6px; background:#16233f; color:#cdd9ea; border:1px solid #28395a; border-radius:6px; width:24px; height:24px; cursor:pointer; }
.cc-sug{ position:absolute; z-index:30; left:0; right:0; top:calc(100% + 4px); background:#0F1B2D; border:1px solid #2b3f63; border-radius:9px; padding:4px; max-height:260px; overflow:auto; box-shadow:0 10px 30px rgba(0,0,0,.5); }
.cc-sug button{ display:block; width:100%; text-align:left; background:none; border:none; color:#cdd9ea; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; }
.cc-sug button:hover{ background:#16233f; color:#fff; }
.cc-barra{ color:#7f93b3; font-size:11px; }
.cc-form-btns{ display:flex; gap:10px; margin-top:14px; }
.cc-form-btns button{ border:1px solid #2b3f63; background:#16243a; color:#E8EEF6; border-radius:8px; padding:9px 16px; font-size:13px; cursor:pointer; }
.cc-form-btns .ok{ background:#D4AF37; color:#1a1205; border-color:#D4AF37; font-weight:700; }
.cc-form-btns .ok:disabled{ opacity:.5; cursor:not-allowed; }
.cc-controle{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; padding:10px 12px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:10px; }
.cc-ano{ font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:6px; }
.cc-ano select{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:6px 8px; font-size:13px; }
.cc-stat{ font-size:13px; color:#9fb4d4; } .cc-stat b{ color:#fff; }
.cc-busca2{ flex:1; min-width:180px; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 10px; font-size:13px; }
.cc-refresh{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:8px; width:34px; height:34px; cursor:pointer; }
.cc-refresh:hover{ border-color:#D4AF37; color:#fff; }
.cc-tabela-wrap{ overflow-x:auto; border:1px solid #1d2c44; border-radius:12px; }
.cc-tabela{ width:100%; border-collapse:collapse; font-size:13px; }
.cc-tabela th{ text-align:left; background:#0a1626; color:#9fb4d4; font-weight:600; padding:9px 10px; border-bottom:1px solid #1d2c44; white-space:nowrap; }
.cc-tabela td{ padding:9px 10px; border-bottom:1px solid #16233a; color:#cdd9ea; }
.cc-tabela tr:last-child td{ border-bottom:none; }
.cc-lin-fora td{ background:#160f04; }
.cc-nome{ font-weight:600; color:#fff; white-space:nowrap; }
.cc-badge{ font-size:11px; font-weight:700; border-radius:999px; padding:2px 10px; }
.cc-badge.fora{ background:#3a2f10; color:#f3df9d; }
.cc-badge.retornou{ background:#12351f; color:#9fe6bd; }
.cc-ret{ background:#16233f; color:#bcd2ff; border:1px solid #3f6bd4; border-radius:7px; padding:3px 8px; cursor:pointer; font-size:11.5px; }
.cc-ret:hover{ border-color:#D4AF37; color:#fff; }
.cc-del{ background:none; border:1px solid #2b3f63; border-radius:7px; padding:3px 7px; cursor:pointer; font-size:12px; }
.cc-del:hover{ border-color:#e06464; }
.cc-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
`;
