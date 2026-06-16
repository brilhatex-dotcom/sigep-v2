"use client";

import { useEffect, useMemo, useState } from "react";

type Ficha = { id: string; postoGrad: string | null; numeroBarra: string | null; nome: string | null; nomeGuerra: string | null };
type Interessado = { efetivoId: string; inscritoEm: string; ficha: Ficha | null };
type Curso = {
  id: string; nome: string; local: string | null; vagas: number; prazo: string | null;
  descricao: string | null; status: "aberto" | "encerrado";
  totalInteressados: number; jaInscrito: boolean; interessados?: Interessado[];
};

function nomeCurto(f: Ficha | null, id: string): string {
  if (!f) return "ID " + id;
  const posto = (f.postoGrad || "").trim();
  const barra = (f.numeroBarra || "").trim();
  const guerra = (f.nomeGuerra || f.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", cap].filter(Boolean).join(" ").trim() || ("ID " + id);
}

function brData(iso: string | null): string {
  if (!iso || iso.length < 10) return iso || "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export default function CursosClient({ perfil }: { perfil: string }) {
  const ehAdmin = useMemo(() => (perfil || "").toLowerCase() === "admin", [perfil]);

  const [lista, setLista] = useState<Curso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const vazio = { nome: "", local: "", vagas: "", prazo: "", descricao: "" };
  const [form, setForm] = useState({ ...vazio });
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/cursos");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      setLista(d.cursos || []);
      setErro(null);
    } catch (e) {
      setErro("Falha ao carregar os cursos (" + String(e) + ").");
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const criar = async () => {
    if (!form.nome.trim()) return aviso("Informe o nome do curso.");
    setCriando(true);
    try {
      const r = await fetch("/api/cursos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) return aviso(d.error || "Falha ao criar.");
      setForm({ ...vazio });
      aviso("Curso aberto.");
      carregar();
    } finally {
      setCriando(false);
    }
  };

  const acao = async (cursoId: string, body: any, okMsg?: string) => {
    setOcupado(cursoId);
    try {
      const r = await fetch(`/api/cursos/${cursoId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha."); return; }
      if (okMsg) aviso(okMsg);
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async (cursoId: string) => {
    if (!confirm("Excluir este curso e todos os interesses? Nao pode ser desfeito.")) return;
    setOcupado(cursoId);
    try {
      const r = await fetch(`/api/cursos/${cursoId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha ao excluir."); return; }
      aviso("Curso excluido.");
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="cur-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cur-head">
        <div>
          <h1 className="cur-title">Cursos</h1>
          <p className="cur-sub">
            {ehAdmin ? "Abra cursos e acompanhe os militares interessados." : "Cursos ofertados. Demonstre seu interesse."}
          </p>
        </div>
        <span className={"cur-perfil " + (ehAdmin ? "adm" : "pol")}>{ehAdmin ? "Admin" : "Policial"}</span>
      </div>

      {msg && <div className="cur-toast">{msg}</div>}
      {erro && <div className="cur-banner erro">{erro}</div>}

      {ehAdmin && (
        <div className="cur-card form">
          <div className="cur-card-tit">Abrir novo curso</div>
          <div className="cur-form-grid">
            <label className="f-nome">Nome do curso
              <input value={form.nome} placeholder="ex: Curso de Formação de Sargentos" onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label>Local
              <input value={form.local} placeholder="ex: CFAP" onChange={(e) => setForm({ ...form, local: e.target.value })} />
            </label>
            <label>Vagas
              <input type="number" min={0} value={form.vagas} placeholder="0 = não informado" onChange={(e) => setForm({ ...form, vagas: e.target.value })} />
            </label>
            <label>Prazo de inscrição
              <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
            </label>
            <label className="f-desc">Descrição
              <input value={form.descricao} placeholder="requisitos, observações..." onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </label>
          </div>
          <div className="cur-form-acoes">
            <button className="btn primary" disabled={criando} onClick={criar}>{criando ? "Abrindo..." : "+ Abrir curso"}</button>
          </div>
        </div>
      )}

      {carregando && <div className="cur-banner info">Carregando...</div>}
      {!carregando && lista.length === 0 && (
        <div className="cur-vazio">{ehAdmin ? "Nenhum curso aberto ainda." : "Nenhum curso disponível no momento."}</div>
      )}

      <div className="cur-grid">
        {lista.map((c) => (
          <div key={c.id} className={"cur-card item" + (c.status !== "aberto" ? " off" : "")}>
            <div className="ci-top">
              <div className="ci-nome">{c.nome}</div>
              <span className={"ci-status " + c.status}>{c.status === "aberto" ? "Aberto" : "Encerrado"}</span>
            </div>

            <div className="ci-meta">
              {c.local && <span>📍 {c.local}</span>}
              {c.vagas > 0 && <span>{c.vagas} vaga(s)</span>}
              {c.prazo && <span>Até {brData(c.prazo)}</span>}
              <span>{c.totalInteressados} interessado(s)</span>
            </div>

            {c.descricao && <div className="ci-desc">{c.descricao}</div>}

            {/* POLICIAL */}
            {!ehAdmin && (
              <div className="ci-acao">
                {c.jaInscrito ? (
                  <>
                    <div className="ci-stat ok">✓ Interesse registrado</div>
                    {c.status === "aberto" && (
                      <button className="btn" disabled={ocupado === c.id} onClick={() => acao(c.id, { acao: "cancelar" }, "Interesse retirado.")}>Retirar interesse</button>
                    )}
                  </>
                ) : c.status !== "aberto" ? (
                  <div className="ci-stat fechado">Inscrições encerradas</div>
                ) : (
                  <button className="btn primary full" disabled={ocupado === c.id} onClick={() => acao(c.id, { acao: "interesse" }, "Interesse registrado.")}>
                    {ocupado === c.id ? "..." : "Tenho interesse"}
                  </button>
                )}
              </div>
            )}

            {/* ADMIN */}
            {ehAdmin && (
              <div className="ci-admin">
                <div className="ci-admin-cab">Interessados</div>
                {(!c.interessados || c.interessados.length === 0) ? (
                  <div className="ci-sem">Ninguém demonstrou interesse ainda.</div>
                ) : (
                  <ol className="ci-lista">
                    {c.interessados.map((i, idx) => (
                      <li key={i.efetivoId}><span className="ci-num">{idx + 1}.</span> {nomeCurto(i.ficha, i.efetivoId)}</li>
                    ))}
                  </ol>
                )}
                <div className="ci-rod">
                  {c.status === "aberto"
                    ? <button className="link-btn" disabled={ocupado === c.id} onClick={() => acao(c.id, { acao: "encerrar" }, "Curso encerrado.")}>Encerrar inscrições</button>
                    : <button className="link-btn" disabled={ocupado === c.id} onClick={() => acao(c.id, { acao: "reabrir" }, "Curso reaberto.")}>Reabrir</button>}
                  <button className="link-btn danger" disabled={ocupado === c.id} onClick={() => excluir(c.id)}>Excluir</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.cur-shell{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }
.cur-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.cur-title{ margin:0; font-size:20px; font-weight:700; color:#D4AF37; }
.cur-sub{ margin:3px 0 0; font-size:13px; color:#9fb0c7; }
.cur-perfil{ font-size:12px; border-radius:999px; padding:4px 12px; white-space:nowrap; }
.cur-perfil.adm{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.cur-perfil.pol{ background:#16243a; color:#9fd9ff; border:1px solid #2b4f7a; }
.cur-toast{ background:#10301f; color:#bff0d0; border:1px solid #2e6b48; border-radius:9px; padding:9px 13px; font-size:13px; margin-bottom:12px; }
.cur-banner{ border-radius:9px; padding:10px 13px; font-size:13px; margin-bottom:12px; }
.cur-banner.erro{ background:#3a1414; color:#ffb3b3; border:1px solid #7a1f1f; }
.cur-banner.info{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }
.cur-vazio{ background:#0F1B2D; border:1px dashed #2b3f63; border-radius:12px; padding:24px; text-align:center; color:#9fb0c7; font-size:14px; }
.cur-card{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.cur-card.form{ margin-bottom:18px; }
.cur-card-tit{ color:#D4AF37; font-weight:700; font-size:14px; margin-bottom:12px; }
.cur-form-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:10px; }
.cur-form-grid label{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.cur-form-grid .f-nome{ grid-column: span 2; }
.cur-form-grid .f-desc{ grid-column: 1 / -1; }
.cur-form-grid input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.cur-form-grid input:focus{ outline:none; border-color:#D4AF37; }
.cur-form-acoes{ margin-top:12px; display:flex; justify-content:flex-end; }
.btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; }
.btn:hover:not(:disabled){ border-color:#D4AF37; }
.btn:disabled{ opacity:.5; cursor:default; }
.btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.btn.full{ width:100%; }
.cur-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
.cur-card.item{ display:flex; flex-direction:column; gap:10px; }
.cur-card.item.off{ opacity:.72; }
.ci-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.ci-nome{ font-size:16px; font-weight:700; color:#E8EEF6; line-height:1.25; }
.ci-status{ font-size:11px; border-radius:999px; padding:3px 9px; white-space:nowrap; }
.ci-status.aberto{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.ci-status.encerrado{ background:#2a3550; color:#9fb0c7; border:1px solid #3d5580; }
.ci-meta{ display:flex; flex-wrap:wrap; gap:12px; font-size:12.5px; color:#cdd9ea; }
.ci-desc{ font-size:12.5px; color:#9fb0c7; background:#0a1626; border-left:3px solid #2b3f63; border-radius:6px; padding:7px 10px; }
.ci-acao{ display:flex; flex-direction:column; gap:8px; }
.ci-stat{ font-size:13px; border-radius:8px; padding:9px 11px; text-align:center; }
.ci-stat.ok{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; font-weight:600; }
.ci-stat.fechado{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }
.ci-admin{ border-top:1px solid #1d2c44; padding-top:10px; display:flex; flex-direction:column; gap:8px; }
.ci-admin-cab{ font-size:12px; color:#9fb0c7; }
.ci-sem{ font-size:12.5px; color:#6f82a0; }
.ci-lista{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px; }
.ci-lista li{ font-size:13px; color:#E8EEF6; background:#13223a; border:1px solid #28395a; border-radius:7px; padding:5px 9px; }
.ci-num{ color:#6f82a0; margin-right:4px; }
.ci-rod{ display:flex; justify-content:space-between; margin-top:2px; }
.link-btn{ background:none; border:none; color:#9fb0c7; font-size:12px; cursor:pointer; padding:2px; }
.link-btn:hover:not(:disabled){ color:#D4AF37; text-decoration:underline; }
.link-btn.danger:hover:not(:disabled){ color:#ffb3b3; }
.link-btn:disabled{ opacity:.5; cursor:default; }
`;
