"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* Arquivo das escalas publicadas (Fase 4). Lista o historico do que foi emitido,
   agrupado por mes, e permite rebaixar a versao exata (Word/PDF). */

type Meta = { id: string; dataEscala: string; tipo: string; publicadoEm: string; publicadoPor: string; versao?: number; vigente?: boolean };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DSEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function brData(iso: string): string {
  const [a, m, d] = (iso || "").split("-").map(Number);
  if (!a || !m || !d) return iso;
  const dt = new Date(a, m - 1, d);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a} · ${DSEM[dt.getDay()]}`;
}
function brDataHora(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const TIPO_LABEL: Record<string, string> = { normal: "Normal", feriado: "Feriado", facultativo: "Ponto facultativo", extraordinaria: "Extraordinária", joe: "JOE / RENE" };

export default function PublicacoesClient({ isAdmin }: { isAdmin: boolean }) {
  const [itens, setItens] = useState<Meta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);
  // Versões substituídas (republicação do mesmo dia) ficam escondidas por padrão.
  const [verAnteriores, setVerAnteriores] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch("/api/publicacoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItens(Array.isArray(d?.publicacoes) ? d.publicacoes : []))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Quantas versões foram substituídas (para oferecer o "ver anteriores").
  const nSubstituidas = useMemo(() => itens.filter((p) => p.vigente === false).length, [itens]);

  const porMes = useMemo(() => {
    const visiveis = verAnteriores ? itens : itens.filter((p) => p.vigente !== false);
    const map = new Map<string, Meta[]>();
    for (const p of visiveis) {
      const chave = (p.dataEscala || "").slice(0, 7);
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(p);
    }
    return Array.from(map.keys()).sort((a, b) => b.localeCompare(a)).map((mes) => ({
      mes,
      itens: map.get(mes)!.sort((a, b) =>
        b.dataEscala.localeCompare(a.dataEscala) || (b.versao || 1) - (a.versao || 1)),
    }));
  }, [itens, verAnteriores]);

  const baixar = async (id: string, fmt: "docx" | "pdf") => {
    setBaixando(`${id}-${fmt}`);
    try {
      const r = await fetch(`/api/publicacoes?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error();
      const { publicacao } = await r.json();
      const r2 = await fetch(`/api/escala/${fmt}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escala: publicacao.escala, brasoes: publicacao.brasoes, chefe: publicacao.chefe }),
      });
      if (!r2.ok) throw new Error();
      const blob = await r2.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `escala-${publicacao.dataEscala}.${fmt}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      alert("Não foi possível baixar a publicação.");
    } finally {
      setBaixando(null);
    }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover esta publicação do arquivo?")) return;
    try {
      const r = await fetch(`/api/publicacoes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItens((l) => l.filter((p) => p.id !== id));
    } catch { alert("Não foi possível remover."); }
  };

  return (
    <div className="pub-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pub-top">
        <div>
          <h1 className="pub-tit">📄 Publicações</h1>
          <p className="pub-sub">Arquivo das escalas emitidas. Publique na Escala Diária (botão “Publicar”) e o histórico oficial fica aqui.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {nSubstituidas > 0 && (
            <button className="pub-refresh" style={{ width: "auto", padding: "0 10px", fontSize: 12 }}
              onClick={() => setVerAnteriores((v) => !v)}
              title="Quando a escala do mesmo dia é publicada de novo, vale a última; as anteriores ficam guardadas">
              {verAnteriores ? "ocultar" : `ver`} versões anteriores ({nSubstituidas})
            </button>
          )}
          <button className="pub-refresh" onClick={carregar} title="Atualizar">⟳</button>
        </div>
      </div>

      {carregando ? (
        <div className="pub-vazio">Carregando…</div>
      ) : porMes.length === 0 ? (
        <div className="pub-vazio">Nenhuma escala publicada ainda.<div className="pub-dica">Na Escala Diária, gere a escala do dia e clique em <b>📢 Publicar</b> para arquivar.</div></div>
      ) : (
        <div className="pub-lista">
          {porMes.map((g) => (
            <div key={g.mes}>
              <h3 className="pub-mes">{MESES[Number(g.mes.slice(5, 7)) - 1]} de {g.mes.slice(0, 4)}<span>{g.itens.length}</span></h3>
              <ul>
                {g.itens.map((p) => (
                  <li key={p.id} className={"pub-item" + (p.vigente === false ? " velha" : "")}>
                    <div className="pub-info">
                      <span className="pub-data">{brData(p.dataEscala)}</span>
                      <span className="pub-tag">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                      {(p.versao || 1) > 1 && <span className="pub-ver">v{p.versao}</span>}
                      {p.vigente === false
                        ? <span className="pub-velha" title="Foi republicada depois; vale a versão mais recente deste dia">substituída</span>
                        : (p.versao || 1) > 1 && <span className="pub-vig" title="É a última publicada deste dia — é a que vale">vigente</span>}
                      <span className="pub-meta">publicado {brDataHora(p.publicadoEm)} por {p.publicadoPor}</span>
                    </div>
                    <div className="pub-btns">
                      <button disabled={baixando === `${p.id}-docx`} onClick={() => baixar(p.id, "docx")}>📝 Word</button>
                      <button disabled={baixando === `${p.id}-pdf`} onClick={() => baixar(p.id, "pdf")}>📄 PDF</button>
                      {isAdmin && <button className="del" onClick={() => remover(p.id)} title="Remover">🗑</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.pub-wrap{ color:#cdd9ea; }
.pub-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:14px; }
.pub-tit{ font-size:20px; font-weight:800; color:#fff; margin:0; }
.pub-sub{ font-size:13px; color:#8fa3bf; margin:2px 0 0; max-width:640px; }
.pub-refresh{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:16px; }
.pub-refresh:hover{ border-color:#D4AF37; color:#fff; }
.pub-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
.pub-dica{ font-size:12px; color:#6f88a8; margin-top:8px; }
.pub-lista{ display:flex; flex-direction:column; gap:20px; }
.pub-mes{ display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:#D4AF37; margin:0 0 8px; }
.pub-mes span{ background:rgba(255,255,255,.06); color:#94a3b8; border-radius:999px; padding:1px 8px; font-weight:400; letter-spacing:0; }
.pub-item{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; background:#0F1B2D; border:1px solid #1d2c44; border-radius:10px; padding:12px 14px; margin-bottom:8px; }
.pub-info{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.pub-data{ font-weight:700; color:#e7eefb; }
.pub-tag{ font-size:11px; background:#12351f; color:#9fe6bd; border-radius:999px; padding:1px 9px; }
.pub-meta{ font-size:11.5px; color:#8fa3bf; }
.pub-ver{ font-size:11px; background:#1b2a44; color:#9fc4ea; border-radius:999px; padding:1px 8px; font-weight:700; }
.pub-vig{ font-size:11px; background:#12351f; color:#9fe6bd; border:1px solid #2e6b45; border-radius:999px; padding:1px 9px; font-weight:700; text-transform:uppercase; }
.pub-velha{ font-size:11px; background:#3a2410; color:#f0bd8a; border-radius:999px; padding:1px 9px; }
.pub-item.velha{ opacity:.62; }
.pub-btns{ display:flex; gap:6px; }
.pub-btns button{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:6px 11px; font-size:12.5px; cursor:pointer; }
.pub-btns button:hover{ border-color:#D4AF37; }
.pub-btns button:disabled{ opacity:.5; cursor:default; }
.pub-btns .del:hover{ border-color:#e06464; }
`;
