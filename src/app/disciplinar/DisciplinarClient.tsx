"use client";

import { useCallback, useEffect, useState } from "react";
import FatdDoc, { type FatdRegistro } from "@/components/FatdDoc";
import PortariaDoc, { type PortariaRegistro } from "@/components/PortariaDoc";

/* Modulo Disciplinar (FATD / Sindicancia / IPS / IPM). Para cada tipo:
   uma AREA DE CONTROLE no topo (criar novo + ver os passados) com os campos de
   controle (numero, encarregado/sindicante, portaria, envolvido, objeto,
   prazo, status...). Salvo em /api/disciplinar (Config), valendo em todos os PCs. */

type Registro = {
  id: string; tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
  status: string; obs: string; criadoEm: string; criadoPor: string;
};
const STATUS = ["Em andamento", "Prorrogado", "Concluído", "Arquivado"];
const STATUS_COR: Record<string, string> = {
  "Em andamento": "#3a2f10;#f3df9d", "Prorrogado": "#12233a;#8fc6ff",
  "Concluído": "#12351f;#9fe6bd", "Arquivado": "#22262b;#9aa6b2",
};
const vazio = (tipo: string): Registro => ({
  id: "", tipo, numero: "", encarregado: "", portaria: "", dataInstauracao: "",
  envolvido: "", objeto: "", prazo: "", status: "Em andamento", obs: "", criadoEm: "", criadoPor: "",
});
function brData(iso: string) { return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—"; }
function brDataHora(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

export default function DisciplinarClient({ tipo, tipoLabel, descricao, isAdmin }: {
  tipo: string; tipoLabel: string; descricao: string; isAdmin: boolean;
}) {
  const [itens, setItens] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Registro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [peca, setPeca] = useState<FatdRegistro | null>(null);
  const [portaria, setPortaria] = useState<PortariaRegistro | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/disciplinar?tipo=${encodeURIComponent(tipo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItens(Array.isArray(d?.itens) ? d.itens : []))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [tipo]);
  useEffect(() => { carregar(); }, [carregar]);

  const set = (k: keyof Registro, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const salvar = async () => {
    if (!form) return;
    if (!form.numero.trim() && !form.objeto.trim()) { alert("Informe ao menos o número ou o objeto."); return; }
    setSalvando(true);
    try {
      const editando = !!form.id;
      const url = editando ? `/api/disciplinar?id=${encodeURIComponent(form.id)}` : "/api/disciplinar";
      const r = await fetch(url, { method: editando ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tipo }) });
      if (!r.ok) throw new Error();
      setForm(null); carregar();
    } catch { alert("Não foi possível salvar."); }
    finally { setSalvando(false); }
  };
  const remover = async (id: string) => {
    if (!confirm("Remover este procedimento?")) return;
    try {
      const r = await fetch(`/api/disciplinar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItens((l) => l.filter((x) => x.id !== id));
    } catch { alert("Não foi possível remover."); }
  };

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo
    ? itens.filter((r) => `${r.numero} ${r.encarregado} ${r.envolvido} ${r.objeto} ${r.status}`.toLowerCase().includes(termo))
    : itens;
  const emAndamento = itens.filter((r) => r.status === "Em andamento" || r.status === "Prorrogado").length;

  const cor = (s: string) => { const [bg, fg] = (STATUS_COR[s] || "#22262b;#9aa6b2").split(";"); return { background: bg, color: fg }; };

  return (
    <div className="dsc-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="dsc-top">
        <div>
          <h1 className="dsc-tit">⚖️ {tipoLabel}</h1>
          <p className="dsc-sub">{descricao}</p>
        </div>
        {isAdmin && <button className="dsc-novo" onClick={() => setForm(vazio(tipo))}>+ Novo {tipoLabel}</button>}
      </div>

      <div className="dsc-controle">
        <div className="dsc-stat"><b>{itens.length}</b> no total</div>
        <div className="dsc-stat"><b>{emAndamento}</b> em andamento</div>
        <input className="dsc-busca" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por número, encarregado, envolvido..." />
        <button className="dsc-refresh" onClick={carregar} title="Atualizar">⟳</button>
      </div>

      {form && (
        <div className="dsc-form">
          <div className="dsc-form-tit">{form.id ? "Editar" : "Novo"} procedimento — {tipoLabel}</div>
          <div className="dsc-grid">
            <label>Número<input value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder="ex: 001/2026" /></label>
            <label>Encarregado / Sindicante<input value={form.encarregado} onChange={(e) => set("encarregado", e.target.value)} placeholder="posto e nome" /></label>
            <label>Portaria (nº / data)<input value={form.portaria} onChange={(e) => set("portaria", e.target.value)} placeholder="ex: Port. 12/2026" /></label>
            <label>Data de instauração<input type="date" value={form.dataInstauracao} onChange={(e) => set("dataInstauracao", e.target.value)} /></label>
            <label>Prazo / conclusão<input type="date" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} /></label>
            <label>Status
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="dsc-col2">Envolvido(s)<input value={form.envolvido} onChange={(e) => set("envolvido", e.target.value)} placeholder="militar(es) envolvido(s)" /></label>
            <label className="dsc-col2">Objeto / resumo<textarea rows={2} value={form.objeto} onChange={(e) => set("objeto", e.target.value)} placeholder="fato apurado" /></label>
            <label className="dsc-col2">Observações<textarea rows={2} value={form.obs} onChange={(e) => set("obs", e.target.value)} /></label>
          </div>
          <div className="dsc-form-btns">
            <button className="ok" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
            <button onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="dsc-vazio">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="dsc-vazio">{termo ? "Nenhum resultado." : `Nenhum ${tipoLabel} registrado ainda.`}{isAdmin && !termo && <div className="dsc-dica">Clique em <b>+ Novo {tipoLabel}</b> para registrar o primeiro.</div>}</div>
      ) : (
        <div className="dsc-lista">
          {visiveis.map((r) => (
            <div key={r.id} className="dsc-card">
              <div className="dsc-card-h">
                <span className="dsc-num">{r.numero || "(sem número)"}</span>
                <span className="dsc-badge" style={cor(r.status)}>{r.status}</span>
                <span className="dsc-acoes">
                  {tipo === "fatd" && (
                    <button className="peca" onClick={() => setPeca(r)} title="Gerar FATD (PDF/Word)">📄 FATD</button>
                  )}
                  {tipo !== "fatd" && (
                    <button className="peca" onClick={() => setPortaria({ ...r, tipo })} title="Gerar Portaria de instauração (PDF/Word)">📄 Portaria</button>
                  )}
                  {isAdmin && <button onClick={() => setForm(r)} title="Editar">✏️</button>}
                  {isAdmin && <button className="del" onClick={() => remover(r.id)} title="Remover">🗑</button>}
                </span>
              </div>
              <div className="dsc-linhas">
                {r.encarregado && <div><b>Encarregado:</b> {r.encarregado}</div>}
                {r.envolvido && <div><b>Envolvido:</b> {r.envolvido}</div>}
                {r.portaria && <div><b>Portaria:</b> {r.portaria}</div>}
                {(r.dataInstauracao || r.prazo) && <div><b>Instaurado:</b> {brData(r.dataInstauracao)}{r.prazo ? ` · Prazo: ${brData(r.prazo)}` : ""}</div>}
                {r.objeto && <div className="dsc-obj"><b>Objeto:</b> {r.objeto}</div>}
                {r.obs && <div className="dsc-obs">{r.obs}</div>}
              </div>
              {r.criadoPor && <div className="dsc-meta">registrado por {r.criadoPor} · {brDataHora(r.criadoEm)}</div>}
            </div>
          ))}
        </div>
      )}

      {peca && <FatdDoc reg={peca} onFechar={() => setPeca(null)} />}
      {portaria && <PortariaDoc reg={portaria} onFechar={() => setPortaria(null)} />}
    </div>
  );
}

const CSS = `
.dsc-wrap{ color:#cdd9ea; }
.dsc-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
.dsc-tit{ font-size:20px; font-weight:800; color:#fff; margin:0; }
.dsc-sub{ font-size:13px; color:#8fa3bf; margin:2px 0 0; max-width:640px; }
.dsc-novo{ background:#D4AF37; color:#1a1205; border:none; border-radius:9px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; }
.dsc-novo:hover{ filter:brightness(1.1); }
.dsc-controle{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; padding:10px 12px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:10px; }
.dsc-stat{ font-size:13px; color:#9fb4d4; } .dsc-stat b{ color:#fff; }
.dsc-busca{ flex:1; min-width:200px; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 10px; font-size:13px; }
.dsc-refresh{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:15px; }
.dsc-refresh:hover{ border-color:#D4AF37; color:#fff; }
.dsc-form{ background:#0F1B2D; border:1px solid #2b3f63; border-radius:12px; padding:16px; margin-bottom:16px; }
.dsc-form-tit{ font-weight:700; color:#D4AF37; margin-bottom:12px; }
.dsc-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media(max-width:640px){ .dsc-grid{ grid-template-columns:1fr; } }
.dsc-grid label{ display:flex; flex-direction:column; gap:4px; font-size:12px; color:#94a3b8; }
.dsc-col2{ grid-column:1 / -1; }
.dsc-grid input, .dsc-grid select, .dsc-grid textarea{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; }
.dsc-grid input:focus, .dsc-grid select:focus, .dsc-grid textarea:focus{ outline:none; border-color:#D4AF37; }
.dsc-form-btns{ display:flex; gap:10px; margin-top:14px; }
.dsc-form-btns button{ border:1px solid #2b3f63; background:#16243a; color:#E8EEF6; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; }
.dsc-form-btns .ok{ background:#D4AF37; color:#1a1205; border-color:#D4AF37; font-weight:700; }
.dsc-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
.dsc-dica{ font-size:12px; color:#6f88a8; margin-top:8px; }
.dsc-lista{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
.dsc-card{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.dsc-card-h{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.dsc-num{ font-weight:800; color:#fff; font-size:15px; }
.dsc-badge{ font-size:11px; font-weight:700; border-radius:999px; padding:2px 10px; }
.dsc-acoes{ margin-left:auto; display:flex; gap:4px; align-items:center; }
.dsc-acoes button{ background:none; border:1px solid #2b3f63; border-radius:7px; padding:3px 7px; cursor:pointer; font-size:12px; color:#cdd9ea; }
.dsc-acoes .del:hover{ border-color:#e06464; }
.dsc-acoes .peca{ border-color:#3f6bd4; color:#bcd2ff; font-weight:600; white-space:nowrap; }
.dsc-acoes .peca:hover{ background:#16233f; border-color:#D4AF37; color:#fff; }
.dsc-linhas{ font-size:12.5px; color:#cdd9ea; line-height:1.7; }
.dsc-linhas b{ color:#9fb4d4; font-weight:600; }
.dsc-obj{ margin-top:4px; }
.dsc-obs{ margin-top:4px; color:#8fa3bf; font-style:italic; }
.dsc-meta{ margin-top:10px; padding-top:8px; border-top:1px solid #16233a; font-size:11px; color:#6f88a8; }
`;
