"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Controle de Movimentação de Efetivo (Centro de Comando).
   Registra a SAÍDA (policial transferido/deixou a unidade) e a CHEGADA
   (policial novo apresentado na unidade). Movimentação por DATA — sem hora e
   sem "retorno". Admin. Tabela cc_acesso (uma linha por movimentação). */

type Mov = {
  id: string; efetivoId: string; nome: string; tipo: "saida" | "chegada";
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

  // formulário de nova movimentação
  const [tipo, setTipo] = useState<"saida" | "chegada">("saida");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Militar | null>(null);
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje());
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

  const limpar = () => { setSel(null); setBusca(""); setDestino(""); setMotivo(""); setObs(""); setData(hoje()); };

  const registrar = async () => {
    if (!sel) { alert("Escolha o policial no buscador."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/centro-comando", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId: sel.id, nome: nomeMil(sel), tipo, data, destino, motivo, obs }),
      });
      if (!r.ok) throw new Error();
      limpar(); carregar();
    } catch { alert("Não foi possível registrar a movimentação."); }
    finally { setSalvando(false); }
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
  const nSaidas = itens.filter((m) => m.tipo === "saida").length;
  const nChegadas = itens.filter((m) => m.tipo === "chegada").length;
  const ehChegada = tipo === "chegada";

  return (
    <div className="cc-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cc-top">
        <div>
          <h1 className="cc-tit">🔁 Controle de Movimentação de Efetivo</h1>
          <p className="cc-sub">Centro de Comando — registro de chegada (novos PMs) e saída de policiais da unidade.</p>
        </div>
      </div>

      {/* resumo */}
      <div className="cc-resumo">
        <span className="cc-res chegada"><b>{nChegadas}</b> chegada{nChegadas === 1 ? "" : "s"}</span>
        <span className="cc-res saida"><b>{nSaidas}</b> saída{nSaidas === 1 ? "" : "s"}</span>
        <span className="cc-res total"><b>{itens.length}</b> em {ano}</span>
      </div>

      {/* nova movimentação */}
      <div className="cc-form">
        <div className="cc-form-tit">Registrar movimentação</div>

        <div className="cc-tipo">
          <button className={!ehChegada ? "on saida" : ""} onClick={() => setTipo("saida")}>➡ Saída (deixou a unidade)</button>
          <button className={ehChegada ? "on chegada" : ""} onClick={() => setTipo("chegada")}>⬅ Chegada (novo PM)</button>
        </div>

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
          <div className="cc-campo"><label>{ehChegada ? "Origem (de onde veio)" : "Destino (para onde foi)"}</label><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder={ehChegada ? "unidade de origem" : "unidade de destino"} /></div>
          <div className="cc-campo cc-col2"><label>Motivo</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={ehChegada ? "apresentação, transferência, movimentação…" : "transferência, movimentação, agregação…"} /></div>
          <div className="cc-campo cc-col2"><label>Observações</label><input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <div className="cc-form-btns">
          <button className="ok" onClick={registrar} disabled={salvando || !sel}>{salvando ? "Salvando…" : ehChegada ? "Registrar chegada" : "Registrar saída"}</button>
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
        <input className="cc-busca2" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por policial, origem/destino, motivo…" />
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
              <tr><th>Movimentação</th><th>Policial</th><th>Data</th><th>Origem / Destino</th><th>Motivo</th><th>Obs.</th><th></th></tr>
            </thead>
            <tbody>
              {visiveis.map((m) => (
                <tr key={m.id} className={m.tipo === "chegada" ? "cc-lin-chegada" : "cc-lin-saida"}>
                  <td><span className={`cc-badge ${m.tipo}`}>{m.tipo === "chegada" ? "⬅ Chegada" : "➡ Saída"}</span></td>
                  <td className="cc-nome">{m.nome}</td>
                  <td>{brData(m.data)}</td>
                  <td>{m.destino || "—"}</td>
                  <td>{m.motivo || "—"}</td>
                  <td>{m.obs || "—"}</td>
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
.cc-resumo{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
.cc-res{ font-size:13px; border-radius:10px; padding:8px 14px; border:1px solid #1d2c44; background:#0F1B2D; color:#cdd9ea; }
.cc-res b{ font-size:16px; margin-right:4px; }
.cc-res.chegada{ border-color:#235b3c; } .cc-res.chegada b{ color:#9fe6bd; }
.cc-res.saida{ border-color:#7a4d12; } .cc-res.saida b{ color:#f3df9d; }
.cc-res.total b{ color:#fff; }
.cc-form{ background:#0F1B2D; border:1px solid #2b3f63; border-radius:12px; padding:16px; margin-bottom:16px; }
.cc-form-tit{ font-weight:700; color:#D4AF37; margin-bottom:12px; }
.cc-tipo{ display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.cc-tipo button{ flex:1; min-width:180px; background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:9px; padding:9px 12px; font-size:13px; cursor:pointer; font-weight:600; }
.cc-tipo button.on.saida{ background:#3a2f10; color:#ffe9a8; border-color:#7a4d12; }
.cc-tipo button.on.chegada{ background:#10301f; color:#9fe6bd; border-color:#235b3c; }
.cc-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
@media(max-width:820px){ .cc-grid{ grid-template-columns:1fr 1fr; } }
@media(max-width:520px){ .cc-grid{ grid-template-columns:1fr; } }
.cc-campo{ display:flex; flex-direction:column; gap:4px; }
.cc-col2{ grid-column:span 2; }
@media(max-width:520px){ .cc-col2{ grid-column:1 / -1; } }
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
.cc-lin-chegada td{ background:#0a1a11; }
.cc-nome{ font-weight:600; color:#fff; white-space:nowrap; }
.cc-badge{ font-size:11px; font-weight:700; border-radius:999px; padding:2px 10px; white-space:nowrap; }
.cc-badge.saida{ background:#3a2f10; color:#f3df9d; }
.cc-badge.chegada{ background:#12351f; color:#9fe6bd; }
.cc-del{ background:none; border:1px solid #2b3f63; border-radius:7px; padding:3px 7px; cursor:pointer; font-size:12px; }
.cc-del:hover{ border-color:#e06464; }
.cc-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
`;
