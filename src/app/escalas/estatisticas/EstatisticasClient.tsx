"use client";

import { useEffect, useMemo, useState } from "react";

/* Estatisticas da escala (Fase 4): carga de servico por policial no mes, dias
   trabalhados, folgas e alertas de sobrecarga. Le os dias salvos da escala
   (/api/escala-dias) — reflete o que foi realmente lancado/publicado. */

type Slot = { titular?: string; permuta?: string | null };
type Escala = Record<string, any>;

const CAMPOS: { campo: string; label: string; lista: boolean }[] = [
  { campo: "cpuDeDia", label: "CPU de dia", lista: false },
  { campo: "guardaPermanente", label: "Permanência", lista: true },
  { campo: "rpAdjunto", label: "RP · Adjunto", lista: false },
  { campo: "rpMotorista", label: "RP · Motorista", lista: false },
  { campo: "rpPatrulheiro", label: "RP · Patrulheiro", lista: true },
  { campo: "inteligencia", label: "Inteligência", lista: true },
  { campo: "ftGraduado", label: "FT · Graduado", lista: false },
  { campo: "ftMotorista", label: "FT · Motorista", lista: false },
  { campo: "ftPatrulheiro", label: "FT · Patrulheiro", lista: false },
  { campo: "rotemMilitares", label: "ROTEM", lista: true },
];

const MES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function limpa(s?: string | null): string { return String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(); }

export default function EstatisticasClient() {
  const [escalas, setEscalas] = useState<Record<string, Escala>>({});
  const [carregando, setCarregando] = useState(true);
  const hoje = new Date();
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);

  const carregar = () => {
    setCarregando(true);
    fetch("/api/escala-dias")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEscalas(d?.escalas && typeof d.escalas === "object" ? d.escalas : {}))
      .catch(() => {})
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, []);

  const [ano, m] = mes.split("-").map(Number);
  const nDias = new Date(ano, m, 0).getDate();

  const dados = useMemo(() => {
    const servicos = new Map<string, number>();      // total de servicos no mes
    const diasTrab = new Map<string, Set<string>>(); // dias distintos trabalhados
    const porFuncao = new Map<string, Map<string, number>>(); // nome -> {funcao: qtd}
    let diasComEscala = 0;

    for (let d = 1; d <= nDias; d++) {
      const iso = `${mes}-${String(d).padStart(2, "0")}`;
      const e = escalas[iso];
      if (!e || typeof e !== "object") continue;
      diasComEscala++;
      for (const { campo, label, lista } of CAMPOS) {
        const val = (e as any)[campo];
        const slots: Slot[] = lista ? (Array.isArray(val) ? val : []) : (val ? [val] : []);
        for (const sl of slots) {
          const nome = limpa(sl?.titular);
          if (!nome) continue;
          servicos.set(nome, (servicos.get(nome) || 0) + 1);
          if (!diasTrab.has(nome)) diasTrab.set(nome, new Set());
          diasTrab.get(nome)!.add(iso);
          if (!porFuncao.has(nome)) porFuncao.set(nome, new Map());
          const pf = porFuncao.get(nome)!;
          pf.set(label, (pf.get(label) || 0) + 1);
        }
      }
    }

    const linhas = Array.from(servicos.keys()).map((nome) => {
      const serv = servicos.get(nome) || 0;
      const dias = diasTrab.get(nome)?.size || 0;
      const folgas = nDias - dias;
      const pf = porFuncao.get(nome)!;
      const detalhe = Array.from(pf.entries()).sort((a, b) => b[1] - a[1]).map(([f, q]) => `${f}: ${q}`).join(" · ");
      return { nome, serv, dias, folgas, detalhe };
    }).sort((a, b) => b.serv - a.serv || a.nome.localeCompare(b.nome));

    const totalServ = linhas.reduce((s, l) => s + l.serv, 0);
    const media = linhas.length ? totalServ / linhas.length : 0;
    const limiteAlerta = Math.max(media + 3, media * 1.5);
    const sobrecarregados = linhas.filter((l) => l.serv >= limiteAlerta && l.serv >= 4);

    return { linhas, totalServ, media, diasComEscala, sobrecarregados };
  }, [escalas, mes, nDias]);

  return (
    <div className="est-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="est-top">
        <div>
          <h1 className="est-tit">📊 Estatísticas da Escala</h1>
          <p className="est-sub">Carga de serviço por policial, dias trabalhados e folgas — a partir da escala lançada.</p>
        </div>
        <div className="est-acoes">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mes)} className="est-mes" />
          <button className="est-refresh" onClick={carregar} title="Atualizar">⟳</button>
        </div>
      </div>

      <div className="est-cards">
        <div className="est-card"><span className="est-num">{dados.linhas.length}</span><span className="est-lbl">policiais escalados</span></div>
        <div className="est-card"><span className="est-num">{dados.totalServ}</span><span className="est-lbl">serviços no mês</span></div>
        <div className="est-card"><span className="est-num">{dados.media.toFixed(1)}</span><span className="est-lbl">média por policial</span></div>
        <div className="est-card"><span className="est-num">{dados.diasComEscala}/{nDias}</span><span className="est-lbl">dias com escala</span></div>
      </div>

      {dados.sobrecarregados.length > 0 && (
        <div className="est-alerta">
          <b>⚠️ Possível sobrecarga:</b>{" "}
          {dados.sobrecarregados.map((l, i) => (
            <span key={l.nome}>{l.nome} ({l.serv}){i < dados.sobrecarregados.length - 1 ? " · " : ""}</span>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="est-vazio">Carregando…</div>
      ) : dados.linhas.length === 0 ? (
        <div className="est-vazio">Nenhuma escala lançada em {MES_NOME[(m || 1) - 1]} de {ano}.<div className="est-dica">Gere/edite dias na Escala Diária ou no Mapa para alimentar as estatísticas.</div></div>
      ) : (
        <div className="est-scroll">
          <table className="est-tab">
            <thead>
              <tr><th>#</th><th>Policial</th><th>Serviços</th><th>Dias trab.</th><th>Folgas</th><th>Detalhe</th></tr>
            </thead>
            <tbody>
              {dados.linhas.map((l, i) => (
                <tr key={l.nome} className={dados.sobrecarregados.includes(l) ? "sobrecarga" : ""}>
                  <td className="est-pos">{i + 1}</td>
                  <td className="est-nome">{l.nome}</td>
                  <td><b>{l.serv}</b></td>
                  <td>{l.dias}</td>
                  <td>{l.folgas}</td>
                  <td className="est-det">{l.detalhe}</td>
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
.est-wrap{ color:#cdd9ea; }
.est-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
.est-tit{ font-size:20px; font-weight:800; color:#fff; margin:0; }
.est-sub{ font-size:13px; color:#8fa3bf; margin:2px 0 0; }
.est-acoes{ display:flex; align-items:center; gap:10px; }
.est-mes{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 10px; font-size:13px; }
.est-refresh{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:16px; }
.est-refresh:hover{ border-color:#D4AF37; color:#fff; }
.est-cards{ display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:14px; }
@media(min-width:700px){ .est-cards{ grid-template-columns:repeat(4,1fr); } }
.est-card{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:3px; }
.est-num{ font-size:24px; font-weight:800; color:#D4AF37; }
.est-lbl{ font-size:12px; color:#8fa3bf; }
.est-alerta{ background:#3a2410; border:1px solid #8a5a1f; color:#ffd9b0; border-radius:9px; padding:10px 12px; margin-bottom:14px; font-size:13px; }
.est-alerta b{ color:#ffe1b0; }
.est-vazio{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:26px; text-align:center; color:#8fa3bf; }
.est-dica{ font-size:12px; color:#6f88a8; margin-top:8px; }
.est-scroll{ overflow-x:auto; border:1px solid #1d2c44; border-radius:12px; }
.est-tab{ width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
.est-tab thead th{ text-align:left; background:#0f1b2d; color:#9fb4d4; font-weight:700; padding:10px 12px; border-bottom:1px solid #1d2c44; white-space:nowrap; }
.est-tab td{ padding:8px 12px; border-bottom:1px solid #16233a; }
.est-tab tbody tr:hover{ background:#0e1a2b; }
.est-tab tr.sobrecarga{ background:#2a1810; }
.est-pos{ color:#D4AF37; font-weight:700; width:34px; }
.est-nome{ color:#e7eefb; font-weight:600; white-space:nowrap; }
.est-det{ color:#8fa3bf; font-size:11.5px; }
`;
