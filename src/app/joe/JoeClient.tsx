"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================================================================
   SIGEP-18BPM · JOE — Jornada Operacional Extraordinaria (servico extra
   remunerado). Duas visoes no mesmo componente:
   - ADMIN (P1): abre JOE (evento, data, horario, vagas, valor) e aprova/
     recusa cada candidato, respeitando o numero de vagas.
   - POLICIAL: ve os JOE abertos, candidata-se e acompanha o status.
   Tudo via /api/joe e /api/joe/[id]. Tema escuro do SIGEP.
   ========================================================================= */

type Ficha = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
};
type Candidato = {
  id: string;
  efetivoId: string;
  status: "pendente" | "aprovado" | "recusado";
  inscritoEm: string;
  ficha: Ficha | null;
};
type Joe = {
  id: string;
  evento: string;
  local: string | null;
  data: string;
  horaInicio: string;
  horaFim: string;
  vagas: number;
  valor: number;
  observacao: string | null;
  status: "aberta" | "encerrada";
  totalCandidatos: number;
  totalAprovados: number;
  vagasRestantes: number;
  minhaInscricao: { id: string; status: string } | null;
  candidatos?: Candidato[];
};

function nomeCurto(f: Ficha | null, fallbackId: string): string {
  if (!f) return "ID " + fallbackId;
  const posto = (f.postoGrad || "").trim();
  const barra = (f.numeroBarra || "").trim();
  const guerra = (f.nomeGuerra || f.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", cap].filter(Boolean).join(" ").trim() || ("ID " + fallbackId);
}

function brData(iso: string): string {
  if (!iso || iso.length < 10) return iso || "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function reais(v: number): string {
  return "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function diaSemana(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const g = new Date(y, m - 1, d).getDay();
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][g];
}

export default function JoeClient({ perfil }: { perfil: string }) {
  const ehAdmin = useMemo(() => {
    const p = (perfil || "").toLowerCase();
    return p !== "" && p !== "policial";
  }, [perfil]);

  const [lista, setLista] = useState<Joe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // id em processamento

  // formulario admin
  const vazio = {
    evento: "", local: "", data: "", horaInicio: "", horaFim: "", vagas: "1", valor: "", observacao: "",
    comandanteOp: "", horario: "", areaAtuacao: "", processoSei: "",
  };
  const [form, setForm] = useState({ ...vazio });
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/joe");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      setLista(d.joe || []);
      setErro(null);
    } catch (e) {
      setErro("Falha ao carregar os JOE (" + String(e) + ").");
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const criarJoe = async () => {
    if (!form.evento.trim()) return aviso("Informe o evento.");
    if (!form.data) return aviso("Informe a data.");
    if (!form.horaInicio || !form.horaFim) return aviso("Informe início e fim.");
    setCriando(true);
    try {
      const r = await fetch("/api/joe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) return aviso(d.error || "Falha ao criar.");
      setForm({ ...vazio });
      aviso("JOE aberto.");
      carregar();
    } finally {
      setCriando(false);
    }
  };

  const acao = async (joeId: string, body: any, okMsg?: string) => {
    setOcupado(joeId);
    try {
      const r = await fetch(`/api/joe/${joeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha na operação."); return false; }
      if (okMsg) aviso(okMsg);
      await carregar();
      return true;
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async (joeId: string) => {
    if (!confirm("Excluir este JOE e todas as candidaturas? Esta ação não pode ser desfeita.")) return;
    setOcupado(joeId);
    try {
      const r = await fetch(`/api/joe/${joeId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha ao excluir."); return; }
      aviso("JOE excluído.");
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  const abertos = lista.filter((j) => j.status === "aberta");
  const encerrados = lista.filter((j) => j.status !== "aberta");

  return (
    <div className="joe-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="joe-head">
        <div>
          <h1 className="joe-title">JOE · Jornada Operacional Extraordinária</h1>
          <p className="joe-sub">
            {ehAdmin
              ? "Abra serviços extraordinários remunerados e aprove os candidatos."
              : "Candidate-se aos serviços extraordinários remunerados disponíveis."}
          </p>
        </div>
        <span className={"joe-perfil " + (ehAdmin ? "adm" : "pol")}>{ehAdmin ? "P1 / Admin" : "Policial"}</span>
      </div>

      {msg && <div className="joe-toast">{msg}</div>}
      {erro && <div className="joe-banner erro">{erro}</div>}

      {/* ---------------- ADMIN: criar JOE ---------------- */}
      {ehAdmin && (
        <div className="joe-card form">
          <div className="joe-card-tit">Abrir novo JOE</div>
          <div className="joe-form-grid">
            <label className="f-evento">Evento / operação
              <input value={form.evento} placeholder="ex: Festejo de São Pedro" onChange={(e) => setForm({ ...form, evento: e.target.value })} />
            </label>
            <label>Local
              <input value={form.local} placeholder="ex: Praça da Matriz" onChange={(e) => setForm({ ...form, local: e.target.value })} />
            </label>
            <label>Data
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </label>
            <label>Início
              <input type="time" value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} />
            </label>
            <label>Fim
              <input type="time" value={form.horaFim} onChange={(e) => setForm({ ...form, horaFim: e.target.value })} />
            </label>
            <label>Vagas
              <input type="number" min={1} value={form.vagas} onChange={(e) => setForm({ ...form, vagas: e.target.value })} />
            </label>
            <label>Valor por militar (R$)
              <input type="number" min={0} step="0.01" value={form.valor} placeholder="0,00" onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </label>
            <label>Comandante da operação
              <input value={form.comandanteOp} placeholder="ex: MAJOR FRANS" onChange={(e) => setForm({ ...form, comandanteOp: e.target.value })} />
            </label>
            <label>Horário (RENE)
              <input value={form.horario} placeholder="ex: 20h às 02h" onChange={(e) => setForm({ ...form, horario: e.target.value })} />
            </label>
            <label>Área de atuação
              <input value={form.areaAtuacao} placeholder="ex: Graça Aranha-MA" onChange={(e) => setForm({ ...form, areaAtuacao: e.target.value })} />
            </label>
            <label>Nº processo SEI – autorização
              <input value={form.processoSei} placeholder="ex: 2026.190.110.24899" onChange={(e) => setForm({ ...form, processoSei: e.target.value })} />
            </label>
            <label className="f-obs">Observação
              <input value={form.observacao} placeholder="detalhes, fardamento, ponto de encontro..." onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
          </div>
          <div className="joe-form-acoes">
            <button className="btn primary" disabled={criando} onClick={criarJoe}>
              {criando ? "Abrindo..." : "+ Abrir JOE"}
            </button>
          </div>
        </div>
      )}

      {carregando && <div className="joe-banner info">Carregando...</div>}

      {!carregando && lista.length === 0 && (
        <div className="joe-vazio">
          {ehAdmin ? "Nenhum JOE aberto ainda. Use o formulário acima para abrir o primeiro." : "Nenhum JOE disponível no momento."}
        </div>
      )}

      {/* ---------------- LISTA ---------------- */}
      {abertos.length > 0 && <div className="joe-secao">Abertos</div>}
      <div className="joe-grid">
        {abertos.map((j) => (
          <JoeCardComp
            key={j.id} j={j} ehAdmin={ehAdmin} ocupado={ocupado === j.id}
            onCandidatar={() => acao(j.id, { acao: "candidatar" }, "Candidatura enviada.")}
            onCancelar={() => acao(j.id, { acao: "cancelar" }, "Candidatura cancelada.")}
            onDecidir={(inscricaoId, decisao) => acao(j.id, { acao: "decidir", inscricaoId, decisao }, decisao === "aprovado" ? "Aprovado." : "Recusado.")}
            onEncerrar={() => acao(j.id, { acao: "encerrar" }, "JOE encerrado.")}
            onReabrir={() => acao(j.id, { acao: "reabrir" }, "JOE reaberto.")}
            onExcluir={() => excluir(j.id)}
          />
        ))}
      </div>

      {encerrados.length > 0 && <div className="joe-secao">Encerrados</div>}
      <div className="joe-grid">
        {encerrados.map((j) => (
          <JoeCardComp
            key={j.id} j={j} ehAdmin={ehAdmin} ocupado={ocupado === j.id}
            onCandidatar={() => {}}
            onCancelar={() => {}}
            onDecidir={(inscricaoId, decisao) => acao(j.id, { acao: "decidir", inscricaoId, decisao }, "Atualizado.")}
            onEncerrar={() => {}}
            onReabrir={() => acao(j.id, { acao: "reabrir" }, "JOE reaberto.")}
            onExcluir={() => excluir(j.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================== CARD ============================== */

function JoeCardComp({
  j, ehAdmin, ocupado, onCandidatar, onCancelar, onDecidir, onEncerrar, onReabrir, onExcluir,
}: {
  j: Joe;
  ehAdmin: boolean;
  ocupado: boolean;
  onCandidatar: () => void;
  onCancelar: () => void;
  onDecidir: (inscricaoId: string, decisao: "aprovado" | "recusado") => void;
  onEncerrar: () => void;
  onReabrir: () => void;
  onExcluir: () => void;
}) {
  const lotado = j.vagasRestantes <= 0;
  const minha = j.minhaInscricao;
  const totalAprov = (j.valor || 0) * j.totalAprovados;

  return (
    <div className={"joe-card item" + (j.status !== "aberta" ? " off" : "")}>
      <div className="jc-top">
        <div className="jc-evento">{j.evento}</div>
        <span className={"jc-status " + j.status}>{j.status === "aberta" ? "Aberto" : "Encerrado"}</span>
      </div>

      <div className="jc-meta">
        <span title="Data"><b>{brData(j.data)}</b> <i>{diaSemana(j.data)}</i></span>
        <span title="Horário">{j.horaInicio}–{j.horaFim}</span>
        {j.local && <span title="Local">📍 {j.local}</span>}
      </div>

      <div className="jc-numeros">
        <div className="jc-num">
          <span className="jc-num-v">{reais(j.valor)}</span>
          <span className="jc-num-l">por militar</span>
        </div>
        <div className="jc-num">
          <span className="jc-num-v">{j.totalAprovados}/{j.vagas}</span>
          <span className="jc-num-l">vagas preenchidas</span>
        </div>
        <div className="jc-num">
          <span className="jc-num-v">{j.totalCandidatos}</span>
          <span className="jc-num-l">candidatos</span>
        </div>
      </div>

      {j.observacao && <div className="jc-obs">{j.observacao}</div>}

      {/* ---- POLICIAL ---- */}
      {!ehAdmin && (
        <div className="jc-acao-pol">
          {minha?.status === "aprovado" ? (
            <div className="jc-stat aprovado">✓ Você foi aprovado neste JOE</div>
          ) : minha?.status === "recusado" ? (
            <div className="jc-stat recusado">Não selecionado desta vez</div>
          ) : minha?.status === "pendente" ? (
            <>
              <div className="jc-stat pendente">⏳ Candidatura enviada, aguardando o P1</div>
              {j.status === "aberta" && (
                <button className="btn" disabled={ocupado} onClick={onCancelar}>Cancelar candidatura</button>
              )}
            </>
          ) : j.status !== "aberta" ? (
            <div className="jc-stat fechado">Encerrado</div>
          ) : lotado ? (
            <div className="jc-stat fechado">Vagas preenchidas</div>
          ) : (
            <button className="btn primary full" disabled={ocupado} onClick={onCandidatar}>
              {ocupado ? "..." : "Candidatar-se"}
            </button>
          )}
        </div>
      )}

      {/* ---- ADMIN ---- */}
      {ehAdmin && (
        <div className="jc-admin">
          <div className="jc-admin-cab">
            <span>Candidatos</span>
            {j.totalAprovados > 0 && <span className="jc-total">Total a pagar: <b>{reais(totalAprov)}</b></span>}
          </div>

          {(!j.candidatos || j.candidatos.length === 0) ? (
            <div className="jc-sem-cand">Nenhum candidato ainda.</div>
          ) : (
            <div className="jc-cand-lista">
              {j.candidatos.map((c) => (
                <div key={c.id} className={"jc-cand " + c.status}>
                  <span className="jc-cand-nome">{nomeCurto(c.ficha, c.efetivoId)}</span>
                  {c.status === "aprovado" ? (
                    <span className="jc-cand-acoes">
                      <span className="tag ok">aprovado</span>
                      <button className="mini-btn" disabled={ocupado} title="Reverter para pendente" onClick={() => onDecidir(c.id, "recusado")}>↺</button>
                    </span>
                  ) : c.status === "recusado" ? (
                    <span className="jc-cand-acoes">
                      <span className="tag no">recusado</span>
                      <button className="mini-btn ok" disabled={ocupado || lotado} title={lotado ? "Vagas cheias" : "Aprovar"} onClick={() => onDecidir(c.id, "aprovado")}>✓</button>
                    </span>
                  ) : (
                    <span className="jc-cand-acoes">
                      <button className="mini-btn ok" disabled={ocupado || lotado} title={lotado ? "Vagas cheias" : "Aprovar"} onClick={() => onDecidir(c.id, "aprovado")}>✓ aprovar</button>
                      <button className="mini-btn no" disabled={ocupado} title="Recusar" onClick={() => onDecidir(c.id, "recusado")}>✕</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="jc-admin-rod">
            {j.totalAprovados > 0 && (
              <a
                className="link-btn"
                href={`/api/joe/${j.id}/rene`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#D4AF37" }}
              >
                📄 Gerar RENE
              </a>
            )}
            {j.status === "aberta"
              ? <button className="link-btn" disabled={ocupado} onClick={onEncerrar}>Encerrar inscrições</button>
              : <button className="link-btn" disabled={ocupado} onClick={onReabrir}>Reabrir</button>}
            <button className="link-btn danger" disabled={ocupado} onClick={onExcluir}>Excluir</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== CSS ============================== */

const CSS = `
.joe-shell{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }

.joe-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.joe-title{ margin:0; font-size:20px; font-weight:700; color:#D4AF37; }
.joe-sub{ margin:3px 0 0; font-size:13px; color:#9fb0c7; }
.joe-perfil{ font-size:12px; border-radius:999px; padding:4px 12px; white-space:nowrap; }
.joe-perfil.adm{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.joe-perfil.pol{ background:#16243a; color:#9fd9ff; border:1px solid #2b4f7a; }

.joe-toast{ background:#10301f; color:#bff0d0; border:1px solid #2e6b48; border-radius:9px; padding:9px 13px; font-size:13px; margin-bottom:12px; }
.joe-banner{ border-radius:9px; padding:10px 13px; font-size:13px; margin-bottom:12px; }
.joe-banner.erro{ background:#3a1414; color:#ffb3b3; border:1px solid #7a1f1f; }
.joe-banner.info{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }
.joe-vazio{ background:#0F1B2D; border:1px dashed #2b3f63; border-radius:12px; padding:24px; text-align:center; color:#9fb0c7; font-size:14px; }

.joe-card{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.joe-card.form{ margin-bottom:18px; }
.joe-card-tit{ color:#D4AF37; font-weight:700; font-size:14px; margin-bottom:12px; }
.joe-form-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
.joe-form-grid label{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.joe-form-grid .f-evento{ grid-column: span 2; }
.joe-form-grid .f-obs{ grid-column: 1 / -1; }
.joe-form-grid input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.joe-form-grid input:focus{ outline:none; border-color:#D4AF37; }
.joe-form-acoes{ margin-top:12px; display:flex; justify-content:flex-end; }

.btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; }
.btn:hover:not(:disabled){ border-color:#D4AF37; }
.btn:disabled{ opacity:.5; cursor:default; }
.btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.btn.full{ width:100%; }

.joe-secao{ font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:#6f82a0; margin:18px 2px 8px; }
.joe-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:14px; }

.joe-card.item{ display:flex; flex-direction:column; gap:10px; }
.joe-card.item.off{ opacity:.72; }
.jc-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.jc-evento{ font-size:16px; font-weight:700; color:#E8EEF6; line-height:1.25; }
.jc-status{ font-size:11px; border-radius:999px; padding:3px 9px; white-space:nowrap; }
.jc-status.aberta{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.jc-status.encerrada{ background:#2a3550; color:#9fb0c7; border:1px solid #3d5580; }

.jc-meta{ display:flex; flex-wrap:wrap; gap:12px; font-size:13px; color:#cdd9ea; }
.jc-meta i{ color:#6f82a0; font-style:normal; font-size:11px; }
.jc-meta b{ color:#E8EEF6; }

.jc-numeros{ display:flex; gap:8px; }
.jc-num{ flex:1; background:#0a1626; border:1px solid #1d2c44; border-radius:9px; padding:8px; text-align:center; }
.jc-num-v{ display:block; font-size:15px; font-weight:700; color:#D4AF37; }
.jc-num-l{ display:block; font-size:10px; color:#6f82a0; margin-top:2px; }

.jc-obs{ font-size:12.5px; color:#9fb0c7; background:#0a1626; border-left:3px solid #2b3f63; border-radius:6px; padding:7px 10px; }

.jc-acao-pol{ display:flex; flex-direction:column; gap:8px; }
.jc-stat{ font-size:13px; border-radius:8px; padding:9px 11px; text-align:center; }
.jc-stat.aprovado{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; font-weight:600; }
.jc-stat.pendente{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.jc-stat.recusado{ background:#2a1a1a; color:#e6a3a3; border:1px solid #5b2323; }
.jc-stat.fechado{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }

.jc-admin{ border-top:1px solid #1d2c44; padding-top:10px; display:flex; flex-direction:column; gap:8px; }
.jc-admin-cab{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#9fb0c7; }
.jc-total b{ color:#D4AF37; }
.jc-sem-cand{ font-size:12.5px; color:#6f82a0; padding:4px 2px; }
.jc-cand-lista{ display:flex; flex-direction:column; gap:5px; }
.jc-cand{ display:flex; justify-content:space-between; align-items:center; gap:8px; background:#13223a; border:1px solid #28395a; border-radius:8px; padding:6px 10px; }
.jc-cand.aprovado{ border-color:#235b3c; background:#102a1f; }
.jc-cand.recusado{ opacity:.7; }
.jc-cand-nome{ font-size:13px; }
.jc-cand-acoes{ display:flex; align-items:center; gap:5px; }
.tag{ font-size:10.5px; border-radius:999px; padding:2px 8px; }
.tag.ok{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.tag.no{ background:#2a1a1a; color:#e6a3a3; border:1px solid #5b2323; }
.mini-btn{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:6px; padding:3px 9px; font-size:11.5px; cursor:pointer; }
.mini-btn:hover:not(:disabled){ border-color:#D4AF37; }
.mini-btn:disabled{ opacity:.4; cursor:default; }
.mini-btn.ok:hover:not(:disabled){ border-color:#46c47e; color:#bff0d0; }
.mini-btn.no:hover:not(:disabled){ border-color:#e06464; color:#ffb3b3; }

.jc-admin-rod{ display:flex; justify-content:space-between; margin-top:2px; }
.link-btn{ background:none; border:none; color:#9fb0c7; font-size:12px; cursor:pointer; padding:2px; }
.link-btn:hover:not(:disabled){ color:#D4AF37; text-decoration:underline; }
.link-btn.danger:hover:not(:disabled){ color:#ffb3b3; }
.link-btn:disabled{ opacity:.5; cursor:default; }
`;