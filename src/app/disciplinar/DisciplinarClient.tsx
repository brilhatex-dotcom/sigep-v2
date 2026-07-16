"use client";

import { useCallback, useEffect, useState } from "react";
import FatdDoc, { type FatdRegistro } from "@/components/FatdDoc";
import PortariaDoc, { type PortariaRegistro } from "@/components/PortariaDoc";
import TermoDoc, { type TermoRegistro, type TermoModelo, TERMO_LABEL } from "@/components/TermoDoc";
import SeletorEfetivo, { type MilitarLite } from "@/components/SeletorEfetivo";

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

// Converte "DD/MM/AAAA" (ou "AAAA-MM-DD") para ISO. Vazio -> "".
function dataParaISO(v: string): string {
  const s = (v || "").trim();
  const br = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (br) { const a = br[3].length === 2 ? "20" + br[3] : br[3]; return `${a}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`; }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
}
// Parseia o texto colado (Excel = TAB; aceita ; também). Colunas por posição:
// Número | Envolvido | Objeto | Encarregado | Portaria | Data | Status
function parseImport(texto: string, statusPadrao: string) {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((linha) => {
    const c = linha.includes("\t") ? linha.split("\t") : linha.split(";");
    const g = (i: number) => (c[i] || "").trim();
    return {
      numero: g(0), envolvido: g(1), objeto: g(2), encarregado: g(3),
      portaria: g(4), dataInstauracao: dataParaISO(g(5)), status: g(6) || statusPadrao,
    };
  });
}
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
  const [termoDoc, setTermoDoc] = useState<{ reg: TermoRegistro; modelo: TermoModelo } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  // importação em massa (colar do Excel)
  const [impAberto, setImpAberto] = useState(false);
  const [impTexto, setImpTexto] = useState("");
  const [impStatus, setImpStatus] = useState("Concluído");
  const [importando, setImportando] = useState(false);
  const [impMsg, setImpMsg] = useState<string | null>(null);

  // Efetivo p/ o buscador + Chefe do P/1 e Comandante (mesma fonte da Escala).
  const [efetivo, setEfetivo] = useState<MilitarLite[]>([]);
  const [chefeP1, setChefeP1] = useState("");
  const [comandante, setComandante] = useState("");
  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null)).then((d) => setEfetivo(Array.isArray(d?.efetivo) ? d.efetivo : [])).catch(() => {});
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setChefeP1(d.nome || ""); setComandante(d.comandante || ""); } }).catch(() => {});
  }, []);

  // Fecha o menu de peças ao clicar fora.
  useEffect(() => {
    if (!menuId) return;
    const fechar = () => setMenuId(null);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [menuId]);

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

  const previaImport = parseImport(impTexto, impStatus);
  const importar = async () => {
    if (previaImport.length === 0) { setImpMsg("Cole ao menos uma linha."); return; }
    setImportando(true); setImpMsg(null);
    try {
      const r = await fetch("/api/disciplinar/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, itens: previaImport }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setImpMsg(d.error || "Falha ao importar."); return; }
      setImpMsg(`✓ ${d.criados} importado(s)${d.pulados ? `, ${d.pulados} já existiam (pulados)` : ""}.`);
      setImpTexto(""); carregar();
    } catch { setImpMsg("Erro de conexão."); }
    finally { setImportando(false); }
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
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="dsc-import" onClick={() => { setImpAberto(true); setImpMsg(null); }}>⬆ Importar histórico</button>
            <button className="dsc-novo" onClick={() => setForm(vazio(tipo))}>+ Novo {tipoLabel}</button>
          </div>
        )}
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
            <label>{tipo === "fatd" ? "Chefe do P/1 (participante)" : "Encarregado / Sindicante"}
              <SeletorEfetivo value={form.encarregado} onChange={(v) => set("encarregado", v)} efetivo={efetivo}
                placeholder={tipo === "fatd" ? "vazio = usa o Chefe do P/1 da escala" : "busque o posto/nome…"} />
            </label>
            <label>Portaria (nº / data)<input value={form.portaria} onChange={(e) => set("portaria", e.target.value)} placeholder="ex: Port. 12/2026" /></label>
            <label>Data de instauração<input type="date" value={form.dataInstauracao} onChange={(e) => set("dataInstauracao", e.target.value)} /></label>
            <label>Prazo / conclusão<input type="date" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} /></label>
            <label>Status
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="dsc-col2">Envolvido(s)
              <SeletorEfetivo value={form.envolvido} onChange={(v) => set("envolvido", v)} efetivo={efetivo} placeholder="busque o militar envolvido…" />
            </label>
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
                  {tipo === "fatd" ? (
                    <button className="peca" onClick={() => setPeca(r)} title="Gerar FATD (PDF/Word)">📄 FATD</button>
                  ) : (
                    <span className="dsc-menu-wrap" onClick={(e) => e.stopPropagation()}>
                      <button className="peca" onClick={() => setMenuId((m) => (m === r.id ? null : r.id))} title="Gerar peças (PDF/Word)">📄 Peças ▾</button>
                      {menuId === r.id && (
                        <div className="dsc-menu">
                          <button onClick={() => { setPortaria({ ...r, tipo }); setMenuId(null); }}>Portaria de instauração</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "autuacao" }); setMenuId(null); }}>{TERMO_LABEL.autuacao}</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "juntada" }); setMenuId(null); }}>{TERMO_LABEL.juntada}</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "notificacao" }); setMenuId(null); }}>{TERMO_LABEL.notificacao}</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "declaracoes" }); setMenuId(null); }}>{TERMO_LABEL.declaracoes}</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "relatorio" }); setMenuId(null); }}>{TERMO_LABEL.relatorio}</button>
                          <button onClick={() => { setTermoDoc({ reg: { ...r, tipo }, modelo: "solucao" }); setMenuId(null); }}>{TERMO_LABEL.solucao}</button>
                        </div>
                      )}
                    </span>
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

      {impAberto && (
        <div className="dsc-modal-bg" onClick={() => setImpAberto(false)}>
          <div className="dsc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dsc-modal-h">
              <b>Importar histórico de {tipoLabel}</b>
              <button onClick={() => setImpAberto(false)}>✕</button>
            </div>
            <p className="dsc-imp-ajuda">
              Cole direto do Excel/planilha (uma linha por procedimento). As colunas, <b>nesta ordem</b>, separadas por TAB (Excel) ou ponto-e-vírgula:
            </p>
            <div className="dsc-imp-cols">Número&nbsp;•&nbsp;Envolvido&nbsp;•&nbsp;Objeto&nbsp;•&nbsp;Encarregado&nbsp;•&nbsp;Portaria&nbsp;•&nbsp;Data(DD/MM/AAAA)&nbsp;•&nbsp;Status</div>
            <textarea
              className="dsc-imp-txt" rows={9} value={impTexto}
              onChange={(e) => setImpTexto(e.target.value)}
              placeholder={"001/2024;SD PM 200/20 Fulano;Abandono de posto;ASP OF PM Macêdo;Port. 05/2024;12/03/2024;Concluído\n002/2024;CB PM 150/15 Beltrano;Atraso;;Port. 06/2024;20/04/2024;Arquivado"}
            />
            <div className="dsc-imp-linha">
              <label>Status padrão (p/ linhas sem status)
                <select value={impStatus} onChange={(e) => setImpStatus(e.target.value)}>
                  {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <span className="dsc-imp-conta">{previaImport.length} linha(s) detectada(s)</span>
            </div>
            {impMsg && <div className="dsc-imp-msg">{impMsg}</div>}
            <div className="dsc-form-btns">
              <button className="ok" onClick={importar} disabled={importando || previaImport.length === 0}>
                {importando ? "Importando…" : `Importar ${previaImport.length || ""}`}
              </button>
              <button onClick={() => setImpAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {peca && <FatdDoc reg={peca} chefeP1={chefeP1} comandante={comandante} onFechar={() => setPeca(null)} />}
      {portaria && <PortariaDoc reg={portaria} comandante={comandante} onFechar={() => setPortaria(null)} />}
      {termoDoc && <TermoDoc reg={termoDoc.reg} modelo={termoDoc.modelo} comandante={comandante} onFechar={() => setTermoDoc(null)} />}
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
.dsc-import{ background:#16243a; color:#bcd2ff; border:1px solid #3f6bd4; border-radius:9px; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
.dsc-import:hover{ border-color:#D4AF37; color:#fff; }
.dsc-modal-bg{ position:fixed; inset:0; z-index:80; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; padding:16px; }
.dsc-modal{ width:100%; max-width:620px; background:#0F1B2D; border:1px solid #2b3f63; border-radius:14px; padding:18px; box-shadow:0 20px 60px rgba(0,0,0,.6); }
.dsc-modal-h{ display:flex; align-items:center; justify-content:space-between; color:#fff; font-size:15px; margin-bottom:10px; }
.dsc-modal-h button{ background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; }
.dsc-imp-ajuda{ font-size:12.5px; color:#9fb4d4; margin:0 0 8px; }
.dsc-imp-cols{ font-size:12px; color:#f3df9d; background:#0a1626; border:1px solid #28395a; border-radius:8px; padding:7px 10px; margin-bottom:10px; }
.dsc-imp-txt{ width:100%; box-sizing:border-box; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:9px 11px; font-size:12.5px; font-family:ui-monospace,Menlo,Consolas,monospace; resize:vertical; }
.dsc-imp-linha{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin:10px 0; flex-wrap:wrap; }
.dsc-imp-linha label{ font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:6px; }
.dsc-imp-linha select{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:6px 8px; font-size:13px; }
.dsc-imp-conta{ font-size:12px; color:#9fb4d4; }
.dsc-imp-msg{ font-size:12.5px; color:#cfe6d6; background:#12351f; border:1px solid #1f5a34; border-radius:8px; padding:8px 10px; margin-bottom:10px; }
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
.dsc-menu-wrap{ position:relative; display:inline-block; }
.dsc-menu{ position:absolute; right:0; top:calc(100% + 4px); z-index:20; min-width:190px; background:#0F1B2D; border:1px solid #2b3f63; border-radius:9px; padding:4px; box-shadow:0 10px 30px rgba(0,0,0,.5); display:flex; flex-direction:column; }
.dsc-menu button{ text-align:left; background:none; border:none; color:#cdd9ea; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:12.5px; white-space:nowrap; }
.dsc-menu button:hover{ background:#16233f; color:#fff; }
.dsc-linhas{ font-size:12.5px; color:#cdd9ea; line-height:1.7; }
.dsc-linhas b{ color:#9fb4d4; font-weight:600; }
.dsc-obj{ margin-top:4px; }
.dsc-obs{ margin-top:4px; color:#8fa3bf; font-style:italic; }
.dsc-meta{ margin-top:10px; padding-top:8px; border-top:1px solid #16233a; font-size:11px; color:#6f88a8; }
`;
