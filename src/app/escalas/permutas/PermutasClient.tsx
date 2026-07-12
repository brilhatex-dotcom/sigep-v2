"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Painel central de Permutas (Fase 4a).
   Junta todas as vagas da escala que tem substituto (permuta) e deixa o admin
   aprovar/negar num lugar so. Le/grava em /api/permutas (tabela Config), entao
   ja e compartilhado e atualiza ao vivo. */

type Linha = {
  data: string; campo: string; idx: number; label: string;
  titular: string; substituto: string; status: string;
};

const DSEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function brDia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  const dt = new Date(a, m - 1, d);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${DSEM[dt.getDay()]}`;
}

const BADGE: Record<string, { txt: string; bg: string; fg: string }> = {
  pendente: { txt: "Pendente", bg: "#3a2f10", fg: "#f3df9d" },
  aprovada: { txt: "Aprovada", bg: "#12351f", fg: "#9fe6bd" },
  negada: { txt: "Negada", bg: "#3a1d24", fg: "#f0a0a0" },
};

export default function PermutasClient() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);

  const chave = (l: Linha) => `${l.data}|${l.campo}|${l.idx}`;

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/permutas");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      setLinhas(Array.isArray(d.permutas) ? d.permutas : []);
      setErro(null);
    } catch (e) {
      setErro("Não foi possível carregar as permutas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // Carga inicial + atualizacao ao vivo (15s + foco da aba).
  const salvandoRef = useRef<string | null>(null);
  salvandoRef.current = salvandoKey;
  useEffect(() => {
    carregar();
    const puxar = () => { if (!document.hidden && !salvandoRef.current) carregar(); };
    const iv = setInterval(puxar, 15000);
    window.addEventListener("focus", puxar);
    return () => { clearInterval(iv); window.removeEventListener("focus", puxar); };
  }, [carregar]);

  const mudarStatus = async (l: Linha, status: string) => {
    const k = chave(l);
    setSalvandoKey(k);
    // otimista: atualiza na tela antes de confirmar
    setLinhas((prev) => prev.map((x) => (chave(x) === k ? { ...x, status } : x)));
    try {
      const r = await fetch("/api/permutas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: l.data, campo: l.campo, idx: l.idx, status }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await carregar();
    } catch (e) {
      setErro("Falha ao salvar. Tente de novo.");
      await carregar();
    } finally {
      setSalvandoKey(null);
    }
  };

  const pendentes = useMemo(() => linhas.filter((l) => (l.status || "pendente") === "pendente").length, [linhas]);
  const visiveis = soPendentes ? linhas.filter((l) => (l.status || "pendente") === "pendente") : linhas;

  return (
    <div className="pm-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="pm-top">
        <div>
          <h1 className="pm-tit">🔄 Permutas</h1>
          <p className="pm-sub">Trocas lançadas na escala (titular → substituto). Aprove ou negue num lugar só.</p>
        </div>
        <div className="pm-acoes">
          <span className="pm-cont">{pendentes} pendente{pendentes === 1 ? "" : "s"}</span>
          <label className="pm-filtro">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            só pendentes
          </label>
          <button className="pm-refresh" onClick={carregar} title="Atualizar agora">⟳</button>
        </div>
      </div>

      {erro && <div className="pm-erro">{erro}</div>}

      {carregando ? (
        <div className="pm-vazio">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="pm-vazio">
          {soPendentes ? "Nenhuma permuta pendente. 🎉" : "Nenhuma permuta lançada ainda."}
          <div className="pm-dica">Para lançar uma permuta, abra a Escala Diária, clique em <b>+ permuta</b> na vaga do militar e informe o substituto. Ela aparece aqui para aprovação.</div>
        </div>
      ) : (
        <div className="pm-scroll">
          <table className="pm-tab">
            <thead>
              <tr>
                <th>Dia</th><th>Serviço</th><th>Titular</th><th>Substituto</th><th>Status</th><th className="no-print">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const st = (l.status || "pendente") as keyof typeof BADGE;
                const b = BADGE[st] || BADGE.pendente;
                const k = chave(l);
                const salvando = salvandoKey === k;
                return (
                  <tr key={k} className={salvando ? "salvando" : ""}>
                    <td className="pm-dia">{brDia(l.data)}</td>
                    <td>{l.label}</td>
                    <td>{l.titular || "—"}</td>
                    <td className="pm-sub-nome">{l.substituto || "—"}</td>
                    <td><span className="pm-badge" style={{ background: b.bg, color: b.fg }}>{b.txt}</span></td>
                    <td className="no-print">
                      <div className="pm-btns">
                        <button className="ok" disabled={salvando || st === "aprovada"} onClick={() => mudarStatus(l, "aprovada")}>Aprovar</button>
                        <button className="no" disabled={salvando || st === "negada"} onClick={() => mudarStatus(l, "negada")}>Negar</button>
                        {st !== "pendente" && (
                          <button className="rev" disabled={salvando} title="Voltar para pendente" onClick={() => mudarStatus(l, "pendente")}>↩</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pm-wrap{ color:#cdd9ea; }
.pm-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
.pm-tit{ font-size:20px; font-weight:800; color:#fff; margin:0; }
.pm-sub{ font-size:13px; color:#8fa3bf; margin:2px 0 0; }
.pm-acoes{ display:flex; align-items:center; gap:12px; }
.pm-cont{ font-size:12px; font-weight:700; background:#3a2f10; color:#f3df9d; border:1px solid #6b5320; border-radius:999px; padding:4px 11px; white-space:nowrap; }
.pm-filtro{ display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#cdd9ea; cursor:pointer; }
.pm-refresh{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:16px; }
.pm-refresh:hover{ border-color:#D4AF37; color:#fff; }
.pm-erro{ background:#3a1d24; color:#f0a0a0; border:1px solid #6b2530; border-radius:9px; padding:9px 12px; margin-bottom:12px; font-size:13px; }
.pm-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
.pm-dica{ font-size:12px; color:#6f88a8; margin-top:10px; max-width:520px; margin-left:auto; margin-right:auto; }
.pm-scroll{ overflow-x:auto; border:1px solid #1d2c44; border-radius:12px; }
.pm-tab{ width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
.pm-tab thead th{ text-align:left; background:#0f1b2d; color:#9fb4d4; font-weight:700; padding:10px 12px; border-bottom:1px solid #1d2c44; white-space:nowrap; }
.pm-tab td{ padding:9px 12px; border-bottom:1px solid #16233a; }
.pm-tab tbody tr:hover{ background:#0e1a2b; }
.pm-tab tr.salvando{ opacity:.55; }
.pm-dia{ white-space:nowrap; color:#e7eefb; font-weight:600; }
.pm-sub-nome{ color:#9fe6bd; }
.pm-badge{ font-size:11px; font-weight:700; border-radius:999px; padding:2px 10px; white-space:nowrap; }
.pm-btns{ display:flex; gap:6px; }
.pm-btns button{ border:none; border-radius:7px; padding:5px 10px; font-size:12px; font-weight:600; cursor:pointer; }
.pm-btns button:disabled{ opacity:.4; cursor:default; }
.pm-btns .ok{ background:#12351f; color:#9fe6bd; }
.pm-btns .no{ background:#3a1d24; color:#f0a0a0; }
.pm-btns .rev{ background:#1d2c44; color:#9fb4d4; }
@media print{ .no-print{ display:none !important; } }
`;
