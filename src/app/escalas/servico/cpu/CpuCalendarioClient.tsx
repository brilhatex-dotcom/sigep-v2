"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* =========================================================================
   CPU de dia — calendário mensal (colunas por semana, terça→segunda).
   Cada dia tem um seletor (buscar militar / Folga / Excluir / Automático) que
   grava na FONTE ÚNICA (cad.cpuOverrides), a mesma da escala diária e do mapa.
   O botão "Imprimir escala semanal CPU" gera a folha da semana selecionada.
   ========================================================================= */

const DAY = 86400000;
const parseISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const toISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const somaDias = (iso: string, n: number) => toISO(new Date(parseISO(iso).getTime() + n * DAY));
const diasEntre = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
const proxDia = (iso: string) => somaDias(iso, 1);
const brData = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DSEM = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const DSEM_FULL = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const ORG = [
  "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA", "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2", "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];

function difAteTerca(g: number): number { let d = 2 - g; if (d > 0) d -= 7; return d; }
function semanasDoMes(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number);
  const primeiro = new Date(y, (m || 1) - 1, 1);
  let ter = new Date(primeiro.getTime() + difAteTerca(primeiro.getDay()) * DAY);
  const ultimo = new Date(y, (m || 1), 0);
  const out: string[] = []; let n = 0;
  while (ter <= ultimo && n < 6) { out.push(toISO(ter)); ter = new Date(ter.getTime() + 7 * DAY); n++; }
  return out;
}

type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; telefone?: string; quadro?: string };
type Afastamento = { militar: string; tipo: string; inicio: string; fim: string };
type Cadastro = { cpu: string[]; afastamentos: Afastamento[]; refCpuISO: string; cpuOverrides?: Record<string, string> };
type Chefe = { nome: string; funcao: string; assinatura: string; assinarGov: boolean; cmtAssinatura: string };
type Brasoes = { pmma: string; ma: string; bpm: string };
const BRASOES_PADRAO: Brasoes = { pmma: "/brasoes/pmma-190.jpg", ma: "/brasao-estado-ma.png", bpm: "/brasoes/brasao-18bpm.png" };

// Abrevia o posto no padrão da folha (Cap, Asp. Of., Sub Ten, 1º Ten...).
function abrevPosto(p: string): string {
  const map: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "tenente coronel": "Ten Cel", "major": "Maj",
    "capitão": "Cap", "capitao": "Cap", "1º tenente": "1º Ten", "1° tenente": "1º Ten", "primeiro tenente": "1º Ten",
    "2º tenente": "2º Ten", "2° tenente": "2º Ten", "segundo tenente": "2º Ten",
    "aspirante a oficial": "Asp. Of.", "aspirante": "Asp. Of.", "subtenente": "Sub Ten",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt", "cabo": "Cb", "soldado": "Sd",
  };
  return map[(p || "").trim().toLowerCase()] ?? (p || "").trim();
}
// Nome no padrão do modelo: posto abreviado + QUADRO + nome de guerra.
// Regra do Cmt: Subtenente e Aspirante a Oficial NÃO exibem o quadro da ficha —
// saem sempre como "PM" (ex.: "Sub Ten PM Martins", "Asp. Of. PM Macêdo").
function nomeCpu(m: Militar): string {
  const posto = abrevPosto(m.postoGrad);
  const bruto = (m.postoGrad || "").trim().toLowerCase();
  const semQuadro = bruto === "subtenente" || bruto === "aspirante a oficial" || bruto === "aspirante";
  const q = semQuadro ? "PM" : (m.quadro || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  return [posto, q, guerra].filter(Boolean).join(" ").trim();
}
function foneFmt(t: string) { const s = (t || "").replace(/\D/g, ""); if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`; if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`; return (t || "").trim(); }
function afastado(id: string, data: string, lista: Afastamento[]) { return lista.some((a) => a.militar === id && data >= a.inicio && data <= a.fim); }

// Rodízio do CPU (mesma regra da tela semanal): sugestão para dias não editados.
function rodizio(pool: string[], dataAlvo: string, afast: Afastamento[], ref: string): string {
  if (pool.length === 0 || dataAlvo < ref) return "";
  const ultimo: Record<string, string> = {}; let alvo = "";
  const ordena = (arr: string[]) => arr.slice().sort((x, y) => {
    const lx = ultimo[x] ? parseISO(ultimo[x]).getTime() : 0, ly = ultimo[y] ? parseISO(ultimo[y]).getTime() : 0;
    if (lx !== ly) return lx - ly; return pool.indexOf(x) - pool.indexOf(y);
  });
  for (let d = ref; d <= dataAlvo; d = proxDia(d)) {
    const restOK = (m: string) => !ultimo[m] || diasEntre(ultimo[m], d) >= 3;
    let esc = ordena(pool.filter((m) => !afastado(m, d, afast) && restOK(m)))[0] || "";
    if (!esc) esc = ordena(pool.filter((m) => !afastado(m, d, afast)))[0] || "";
    if (esc) ultimo[esc] = d;
    if (d === dataAlvo) alvo = esc;
  }
  return alvo;
}

// Célula editável (contentEditable) para a prévia — inicia uma vez e mantém a
// edição; imprime o próprio texto.
function EdCell({ init, style }: { init: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.innerText = init; }, []);
  return <div ref={ref} contentEditable suppressContentEditableWarning style={{ outline: "none", minHeight: "1em", ...style }} />;
}

export default function CpuCalendarioClient() {
  const [cad, setCad] = useState<Cadastro | null>(null);
  /* Afastamentos vindos do PLANO (férias, licença-prêmio, férias avulsas, JMS
     com data e situação da ficha). Ficam SEPARADOS do `cad`: o `cad` é gravado
     de volta em /api/escala-config, e misturar aqui congelaria no cadastro um
     afastamento que é calculado. Sem isto, o rodízio do CPU só pulava quem
     alguém tinha lembrado de cadastrar à mão — quem estava de férias pelo
     plano continuava entrando na escala. */
  const [planoAfast, setPlanoAfast] = useState<Afastamento[]>([]);
  useEffect(() => {
    fetch("/api/escala/afastamentos-plano")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.afastamentos)) setPlanoAfast(d.afastamentos as Afastamento[]); })
      .catch(() => {});
  }, []);

  const [efMap, setEfMap] = useState<Record<string, Militar>>({});
  const [chefe, setChefe] = useState<Chefe>({ nome: "", funcao: "", assinatura: "", assinarGov: false, cmtAssinatura: "/brasoes/assinatura-cmt.png" });
  const [brasoes, setBrasoes] = useState<Brasoes>(BRASOES_PADRAO);
  const [mes, setMes] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const d = localStorage.getItem("sigep_escala_ultima_data");
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
    }
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [editCpu, setEditCpu] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [previewSem, setPreviewSem] = useState<string | null>(null); // terça da semana a imprimir
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  const cadTimer = useRef<any>(null);

  useEffect(() => {
    fetch("/api/escala-config").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.cad) setCad(d.cad); }).catch(() => {});
    fetch("/api/efetivo").then((r) => r.ok ? r.json() : null).then((d) => { const m: Record<string, Militar> = {}; for (const x of (d?.efetivo || [])) m[x.id] = x; setEfMap(m); }).catch(() => {});
    fetch("/api/escala-chefe").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setChefe({ nome: d.nome || "", funcao: d.funcao || "", assinatura: d.assinatura || "", assinarGov: d.assinarGov === true, cmtAssinatura: d.cmtAssinatura || "/brasoes/assinatura-cmt.png" }); }).catch(() => {});
    fetch("/api/cpu-brasoes").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.brasoes) setBrasoes((b) => ({ pmma: d.brasoes.pmma || b.pmma, ma: d.brasoes.ma || b.ma, bpm: d.brasoes.bpm || b.bpm })); }).catch(() => {});
  }, []);

  const salvarCad = (nc: Cadastro) => {
    if (cadTimer.current) clearTimeout(cadTimer.current);
    cadTimer.current = setTimeout(() => { fetch("/api/escala-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cad: nc }) }).catch(() => {}); }, 500);
  };
  const setCpu = (iso: string, val: string | null) => setCad((c) => {
    if (!c) return c;
    const o = { ...(c.cpuOverrides || {}) };
    if (val === null) delete o[iso]; else o[iso] = val;
    const nc = { ...c, cpuOverrides: o }; salvarCad(nc); return nc;
  });

  const nomeDe = (iso: string): { nome: string; auto: boolean; folga: boolean } => {
    const v = cad?.cpuOverrides?.[iso];
    if (v !== undefined) {
      if (v === "") return { nome: "", auto: false, folga: false };
      if (v.startsWith("__FOLGA")) return { nome: "Folga", auto: false, folga: true };
      const m = efMap[v]; return { nome: m ? nomeCpu(m) : v, auto: false, folga: false };
    }
    if (!cad) return { nome: "", auto: true, folga: false };
    const id = rodizio(cad.cpu || [], iso, [...(cad.afastamentos || []), ...planoAfast], cad.refCpuISO || iso);
    const m = id ? efMap[id] : null;
    return { nome: m ? nomeCpu(m) : "", auto: true, folga: false };
  };
  const foneDe = (iso: string): string => {
    const v = cad?.cpuOverrides?.[iso];
    if (v !== undefined) { if (v && !v.startsWith("__FOLGA") && efMap[v]) return foneFmt(efMap[v].telefone || ""); return ""; }
    if (!cad) return "";
    const id = rodizio(cad.cpu || [], iso, [...(cad.afastamentos || []), ...planoAfast], cad.refCpuISO || iso);
    return id && efMap[id] ? foneFmt(efMap[id].telefone || "") : "";
  };

  const semanas = useMemo(() => semanasDoMes(mes), [mes]);
  const mesNum = Number(mes.split("-")[1]);
  const listaEf = useMemo(() => Object.values(efMap), [efMap]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase(); if (q.length < 1) return [];
    return listaEf.filter((m) => (nomeCpu(m) + " " + (m.nomeGuerra || "") + " " + (m.nome || "")).toLowerCase().includes(q)).slice(0, 14);
  }, [busca, listaEf]);

  function irMes(delta: number) {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="cpuc-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cpuc-bar">
        <a className="cpuc-btn" href="/escalas/mapa">← Voltar</a>
        <button className="cpuc-btn" title="Mês anterior" onClick={() => irMes(-1)}>◀</button>
        <span className="cpuc-mes">{MESES[mesNum - 1]} / {mes.split("-")[0]}</span>
        <button className="cpuc-btn" title="Próximo mês" onClick={() => irMes(1)}>▶</button>
        <span className="cpuc-spacer" />
        <span className="cpuc-hint">Clique num dia para escolher o CPU · tudo salva sozinho e reflete na escala diária</span>
      </div>

      <div className="cpuc-cols">
        {semanas.map((ter, wi) => {
          const dias = Array.from({ length: 7 }, (_, i) => somaDias(ter, i));
          return (
            <div className="cpuc-col" key={ter}>
              <div className="cpuc-colh">
                <span>Semana {wi + 1}</span>
                <button className="cpuc-print" title="Abrir a prévia editável desta semana para imprimir" onClick={() => setPreviewSem(ter)}>🖨 Imprimir semana</button>
              </div>
              {dias.map((iso) => {
                const d = parseISO(iso); const foraMes = (d.getMonth() + 1) !== mesNum;
                const info = nomeDe(iso);
                return (
                  <button key={iso} className={"cpuc-dia" + (foraMes ? " fora" : "") + (info.folga ? " folga" : "")}
                    onClick={() => { setBusca(""); setEditCpu(iso); }}>
                    <span className="cpuc-diah"><b>{DSEM[d.getDay()]}</b> {brData(iso).slice(0, 5)}</span>
                    <span className={"cpuc-dianome" + (info.auto && info.nome ? " auto" : "")}>
                      {info.nome || <span className="cpuc-ph">escolher</span>}
                      {info.auto && info.nome ? <span className="cpuc-autotag">rodízio</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {editCpu && (
        <div className="cpuc-modal-back" onClick={() => setEditCpu(null)}>
          <div className="cpuc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpuc-modal-h"><b>CPU de dia · {brData(editCpu)}</b><button onClick={() => setEditCpu(null)}>×</button></div>
            <div className="cpuc-modal-b">
              <div className="cpuc-atual">Atual: <b>{nomeDe(editCpu).nome || "—"}</b></div>
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar oficial..." />
              {busca.trim().length >= 1 && (
                <div className="cpuc-res">
                  {filtrados.length === 0 ? <div className="cpuc-vazio">nenhum encontrado</div> :
                    filtrados.map((m) => <button key={m.id} onClick={() => { setCpu(editCpu, m.id); setEditCpu(null); }}>{nomeCpu(m)}</button>)}
                </div>
              )}
              <div className="cpuc-acoes">
                <button className="folga" onClick={() => { setCpu(editCpu, "__FOLGA__"); setEditCpu(null); }}>Folga</button>
                <button className="excluir" onClick={() => { setCpu(editCpu, ""); setEditCpu(null); }}>Excluir</button>
                <button onClick={() => { setCpu(editCpu, null); setEditCpu(null); }}>Automático</button>
              </div>
              <p className="cpuc-nota">Vale para a escala diária, o mapa e a impressão (fonte única).</p>
            </div>
          </div>
        </div>
      )}

      {/* Prévia EDITÁVEL da folha semanal (com telefones) para imprimir */}
      {previewSem && montado && createPortal((
        <div id="cpuprev-overlay" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)", overflow: "auto" }}>
          <div className="no-print" style={{ position: "sticky", top: 0, display: "flex", gap: 8, alignItems: "center", background: "#0b1626", padding: "8px 12px" }}>
            <button onClick={() => window.print()} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600 }}>🖨 Imprimir / PDF</button>
            <button onClick={() => setPreviewSem(null)} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Fechar</button>
            <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: 6 }}>Você pode editar os nomes e telefones antes de imprimir (clique nas células).</span>
          </div>
          <div id="cpuprev-sheet" style={{ background: "#fff", color: "#000", width: "277mm", maxWidth: "100%", margin: "16px auto", padding: "12mm", fontFamily: '"Times New Roman", Times, serif', boxShadow: "0 10px 40px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: "26mm", height: "24mm", display: "flex", alignItems: "center", justifyContent: "center" }}>{brasoes.pmma ? <img src={brasoes.pmma} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}</div>
              <div style={{ flex: 1, textAlign: "center" }}>
                {brasoes.ma ? <img src={brasoes.ma} alt="" style={{ height: "17mm", objectFit: "contain", display: "block", margin: "0 auto" }} /> : null}
                {ORG.map((l, i) => <div key={i} style={{ fontSize: i >= 5 ? 10.5 : 13, fontWeight: i >= 5 ? 400 : 700, lineHeight: 1.28 }}>{l}</div>)}
              </div>
              <div style={{ width: "26mm", height: "24mm", display: "flex", alignItems: "center", justifyContent: "center" }}>{brasoes.bpm ? <img src={brasoes.bpm} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "8px 0" }}>
              <div style={{ textAlign: "center", fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>VISTO</div>
                {chefe.cmtAssinatura ? <img src={chefe.cmtAssinatura} alt="" style={{ height: "14mm", objectFit: "contain" }} /> : <div style={{ height: "14mm" }} />}
                <div>Cmt. do 18º BPM</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", fontWeight: 700, textDecoration: "underline", fontSize: 14 }}>ESCALA DE SERVIÇO SEMANAL CPU (18º BPM)</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr>{Array.from({ length: 7 }, (_, i) => somaDias(previewSem, i)).map((iso) => (
                  <th key={iso} style={{ border: "1px solid #000", padding: "6px 4px", fontSize: 11, textAlign: "center" }}>
                    <div>{DSEM_FULL[parseISO(iso).getDay()].replace("-FEIRA", "")}</div><div>({brData(iso)})</div>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                <tr>{Array.from({ length: 7 }, (_, i) => somaDias(previewSem, i)).map((iso) => (
                  <td key={iso} style={{ border: "1px solid #000", padding: "6px 4px", textAlign: "center", fontStyle: "italic", fontSize: 13, height: "48px", verticalAlign: "middle" }}>
                    <EdCell init={nomeDe(iso).nome || ""} />
                  </td>
                ))}</tr>
                <tr>{Array.from({ length: 7 }, (_, i) => somaDias(previewSem, i)).map((iso) => (
                  <td key={iso} style={{ border: "1px solid #000", padding: "6px 4px", textAlign: "center", fontSize: 11 }}>
                    <EdCell init={foneDe(iso)} />
                  </td>
                ))}</tr>
              </tbody>
            </table>
            {/* Assinatura do chefe — bem mais abaixo, com espaço para assinar */}
            <div style={{ textAlign: "center", marginTop: "42mm" }}>
              {!chefe.assinarGov && chefe.assinatura ? <img src={chefe.assinatura} alt="" style={{ height: "16mm", objectFit: "contain", display: "block", margin: "0 auto" }} /> : null}
              <div style={{ fontWeight: 700, fontSize: 12 }}>{chefe.nome || "—"}</div>
              <div style={{ fontSize: 11 }}>{chefe.funcao || ""}</div>
            </div>
          </div>
          <style>{`
            @media print {
              body > *:not(#cpuprev-overlay){ display:none !important; }
              #cpuprev-overlay{ position:static !important; overflow:visible !important; background:#fff !important; }
              #cpuprev-overlay .no-print{ display:none !important; }
              #cpuprev-sheet{ box-shadow:none !important; margin:0 !important; width:100% !important; padding:8mm !important; }
              @page{ size:A4 landscape; margin:8mm; }
            }
          `}</style>
        </div>
      ), document.body)}
    </div>
  );
}

const CSS = `
.cpuc-wrap{ color:#E8EEF6; }
.cpuc-bar{ display:flex; align-items:center; flex-wrap:wrap; gap:10px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:12px 14px; margin-bottom:14px; }
.cpuc-btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 12px; font-size:13px; cursor:pointer; text-decoration:none; }
.cpuc-btn:hover{ border-color:#D4AF37; }
.cpuc-mes{ font-weight:700; text-transform:capitalize; min-width:130px; text-align:center; }
.cpuc-spacer{ flex:1; }
.cpuc-hint{ font-size:12px; color:#94A3B8; }
.cpuc-cols{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
.cpuc-col{ background:#0b1424; border:1px solid #1d2c44; border-radius:10px; overflow:hidden; }
.cpuc-colh{ display:flex; align-items:center; justify-content:space-between; gap:6px; background:#13203a; padding:6px 8px; font-size:12px; font-weight:700; color:#cdd9ea; }
.cpuc-print{ background:#16243a; color:#e8c877; border:1px solid #6b5320; border-radius:6px; padding:3px 6px; font-size:10px; cursor:pointer; }
.cpuc-print:hover{ border-color:#D4AF37; }
.cpuc-dia{ display:flex; flex-direction:column; gap:2px; width:100%; text-align:left; background:none; border:none; border-top:1px solid #16243a; padding:7px 9px; cursor:pointer; color:#E8EEF6; }
.cpuc-dia:hover{ background:#12203a; }
.cpuc-dia.fora{ opacity:.4; }
.cpuc-dia.folga{ background:#241a08; }
.cpuc-diah{ font-size:11px; color:#94A3B8; }
.cpuc-diah b{ color:#cdd9ea; }
.cpuc-dianome{ font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px; min-height:18px; }
.cpuc-dianome.auto{ font-weight:400; color:#9fb0c7; font-style:italic; }
.cpuc-autotag{ font-size:9px; background:#1d2c44; color:#8ea3c4; border-radius:4px; padding:0 4px; }
.cpuc-ph{ color:#5a6b85; font-style:italic; font-weight:400; }
.cpuc-modal-back{ position:fixed; inset:0; z-index:80; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; padding:16px; }
.cpuc-modal{ width:100%; max-width:380px; background:#0F1B2D; border:1px solid rgba(255,255,255,.1); border-radius:14px; }
.cpuc-modal-h{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.1); }
.cpuc-modal-h button{ background:none; border:none; color:#94A3B8; cursor:pointer; font-size:18px; }
.cpuc-modal-b{ padding:14px; }
.cpuc-atual{ font-size:12px; color:#94A3B8; margin-bottom:8px; } .cpuc-atual b{ color:#E8EEF6; }
.cpuc-modal-b input{ width:100%; background:#0a1626; border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:8px 10px; color:#fff; outline:none; font-size:13px; }
.cpuc-res{ margin-top:6px; max-height:220px; overflow-y:auto; border:1px solid rgba(255,255,255,.1); border-radius:8px; }
.cpuc-res button{ display:block; width:100%; text-align:left; padding:7px 10px; background:none; border:none; border-bottom:1px solid rgba(255,255,255,.05); color:#fff; cursor:pointer; font-size:13px; }
.cpuc-res button:hover{ background:rgba(255,255,255,.05); }
.cpuc-vazio{ padding:10px; text-align:center; color:#94A3B8; font-size:13px; }
.cpuc-acoes{ display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.cpuc-acoes button{ flex:1; min-width:92px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:13px; background:#0b1626; border:1px solid rgba(255,255,255,.15); color:#cdd9ea; }
.cpuc-acoes button.folga{ background:#241a08; border-color:#6b5320; color:#e8c877; font-weight:600; }
.cpuc-acoes button.excluir{ background:#2a1414; border-color:#7a1f1f; color:#ffb3b3; font-weight:600; }
.cpuc-nota{ font-size:11px; color:#94A3B8; margin-top:10px; }
`;
