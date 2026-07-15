"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   Escala de Serviço SEMANAL do CPU (paisagem) — no padrão da Escala Diária.
   UMA SEMANA POR PÁGINA. Tudo editável (nome, telefone, permuta na mesma caixa).
   Nomes arrastaveis entre os dias. Brasoes clicaveis. VISTO do Cmt ao lado do
   titulo (canto inferior esquerdo). Overrides salvos em /api/cpu-permutas.
   ========================================================================= */

type Afastamento = { militar: string; tipo: string; inicio: string; fim: string };
type Cadastro = { cpu: string[]; afastamentos: Afastamento[]; refCpuISO: string; cpuOverrides?: Record<string, string> };
type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; telefone?: string; quadro?: string };
type Chefe = { nome: string; funcao: string; assinatura?: string; assinarGov?: boolean; cmtAssinatura?: string };
type Override = { nome?: string; fone?: string; permuta?: string };
type Brasoes = { pmma: string; ma: string; bpm: string };

const DAY = 86400000;
const parseISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const toISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const diasEntre = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
const proxDia = (iso: string) => toISO(new Date(parseISO(iso).getTime() + DAY));
const somaDias = (iso: string, n: number) => toISO(new Date(parseISO(iso).getTime() + n * DAY));

const DIAS_SEMANA = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
function brData(iso: string) { return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso; }

const ABREV: { re: RegExp; abbr: string }[] = [
  { re: /tenente[-\s]?coronel/i, abbr: "TC PM" }, { re: /coronel/i, abbr: "Cel PM" }, { re: /major/i, abbr: "Maj PM" },
  { re: /capit[aã]o/i, abbr: "Cap PM" }, { re: /1.?\s*tenente|primeiro\s+tenente/i, abbr: "1º Ten PM" },
  { re: /2.?\s*tenente|segundo\s+tenente/i, abbr: "2º Ten PM" }, { re: /aspirante/i, abbr: "Asp Of PM" },
  { re: /subtenente|sub\s*tenente/i, abbr: "Sub Ten PM" }, { re: /1.?\s*sargento/i, abbr: "1º Sgt PM" },
  { re: /2.?\s*sargento/i, abbr: "2º Sgt PM" }, { re: /3.?\s*sargento/i, abbr: "3º Sgt PM" },
  { re: /cabo/i, abbr: "Cb PM" }, { re: /soldado/i, abbr: "Sd PM" },
];
function abreviaPosto(p: string) { p = (p || "").trim(); for (const a of ABREV) if (a.re.test(p)) return a.abbr; return p; }
function ehOficial(p: string) { if (/sub\s*ten/i.test(p)) return false; return /\bTC\b|\bCel\b|\bMaj\b|\bCap\b|\bAsp\b|\d\S*\s*Ten/i.test(p); }
function cap(s: string) { const t = (s || "").trim().toLowerCase(); if (!t) return ""; const lig = new Set(["da", "de", "do", "das", "dos", "e"]); return t.split(/\s+/).map((w, i) => (i > 0 && lig.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }
function nomeCpu(m: Militar): string {
  let posto = abreviaPosto(m.postoGrad || "");
  const q = (m.quadro || "").trim().toUpperCase();
  if (q && ehOficial(posto)) posto = posto.replace(/\bPM\b/, q);
  return [posto, cap(m.nomeGuerra || m.nome || "")].filter(Boolean).join(" ").trim();
}
function fone(t: string) { const s = (t || "").replace(/\D/g, ""); if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`; if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`; return (t || "").trim(); }

function afastado(id: string, data: string, lista: Afastamento[]) { return lista.some((a) => a.militar === id && data >= a.inicio && data <= a.fim); }
function rodizio(pool: string[], dataAlvo: string, afast: Afastamento[], ref: string): string {
  if (pool.length === 0 || dataAlvo < ref) return "";
  const ultimo: Record<string, string> = {};
  let alvo = "";
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

const ORG = [
  "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA", "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2", "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];
// Padrao do 18º BPM: esquerda 190 anos PMMA · centro Governo do Estado (armas
// do MA) · direita 18º BPM. Mesmo padrao da Escala Diaria.
const BRASOES_PADRAO: Brasoes = { pmma: "/brasoes/pmma-190.jpg", ma: "/brasao-estado-ma.png", bpm: "/brasoes/brasao-18bpm.png" };

// A semana do CPU vai de TERÇA a SEGUNDA (começa na terça-feira).
// Deslocamento até a terça da semana que contém a data (getDay: dom=0..sáb=6).
function difAteTerca(g: number): number {
  let diff = 2 - g; // terça=2
  if (diff > 0) diff -= 7; // se cair no futuro (dom/seg), volta para a terça anterior
  return diff;
}
function tercaDaSemana(): string {
  const h = new Date();
  return toISO(new Date(h.getTime() + difAteTerca(h.getDay()) * DAY));
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Terças-feiras de cada semana do mês de referência (1ª, 2ª, ... até 5ª/6ª).
function semanasDoMes(refISO: string): { rotulo: string; iso: string }[] {
  const d = parseISO(refISO);
  const ano = d.getFullYear(), mes = d.getMonth();
  const primeiro = new Date(ano, mes, 1);
  let ter = new Date(primeiro.getTime() + difAteTerca(primeiro.getDay()) * DAY); // terça da semana do dia 1
  const ultimo = new Date(ano, mes + 1, 0);
  const out: { rotulo: string; iso: string }[] = [];
  let n = 1;
  while (ter <= ultimo && n <= 6) {
    out.push({ rotulo: `${n}ª`, iso: toISO(ter) });
    ter = new Date(ter.getTime() + 7 * DAY);
    n++;
  }
  return out;
}

/* Celula editavel que imprime o proprio texto (contentEditable). */
function Editavel({ value, onChange, className, placeholder }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  const ref = (el: HTMLSpanElement | null) => { if (el && el.innerText !== (value || "")) el.innerText = value || ""; };
  return (
    <span ref={ref} contentEditable suppressContentEditableWarning data-ph={placeholder || ""}
      onInput={(e) => onChange(e.currentTarget.innerText)}
      className={"cpuw-edit " + (className || "")} />
  );
}

export default function CpuSemanalClient() {
  const [cad, setCad] = useState<Cadastro | null>(null);
  const [efMap, setEfMap] = useState<Record<string, Militar>>({});
  const [chefe, setChefe] = useState<Chefe>({ nome: "", funcao: "", assinatura: "", assinarGov: false, cmtAssinatura: "/brasoes/assinatura-cmt.png" });
  // Garante que o início caia sempre numa TERÇA (semana terça→segunda).
  const snapTerca = (iso: string) => { const d = parseISO(iso); return toISO(new Date(d.getTime() + difAteTerca(d.getDay()) * DAY)); };
  const [inicio, setInicioRaw] = useState<string>(() => {
    // lembra a ultima semana em que o usuario mexeu (nao volta sempre para hoje)
    if (typeof window !== "undefined") {
      const s = localStorage.getItem("sigep_cpu_ultima_semana");
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const d = parseISO(s); return toISO(new Date(d.getTime() + difAteTerca(d.getDay()) * DAY)); }
    }
    return tercaDaSemana();
  });
  const setInicio = (iso: string) => setInicioRaw(snapTerca(iso));
  useEffect(() => { try { localStorage.setItem("sigep_cpu_ultima_semana", inicio); } catch { /* ignore */ } }, [inicio]);
  const [ov, setOv] = useState<Record<string, Override>>({});
  const [brasoes, setBrasoes] = useState<Brasoes>(BRASOES_PADRAO);
  const [drag, setDrag] = useState<string | null>(null);
  const [editCpu, setEditCpu] = useState<string | null>(null);
  const [buscaCpu, setBuscaCpu] = useState("");
  const salvarTimer = useRef<any>(null);
  const brasoesTimer = useRef<any>(null);
  const cadTimer = useRef<any>(null);

  useEffect(() => {
    fetch("/api/escala-config").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.cad) setCad(d.cad); }).catch(() => {});
    fetch("/api/efetivo").then((r) => r.ok ? r.json() : null).then((d) => {
      const m: Record<string, Militar> = {}; for (const x of (d?.efetivo || [])) m[x.id] = x; setEfMap(m);
    }).catch(() => {});
    fetch("/api/escala-chefe").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setChefe({ nome: d.nome || "", funcao: d.funcao || "", assinatura: d.assinatura || "", assinarGov: d.assinarGov === true, cmtAssinatura: d.cmtAssinatura || "/brasoes/assinatura-cmt.png" }); }).catch(() => {});
    fetch("/api/cpu-permutas").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.permutas && typeof d.permutas === "object") setOv(d.permutas); }).catch(() => {});
    fetch("/api/cpu-brasoes").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.brasoes) setBrasoes((b) => ({ pmma: d.brasoes.pmma || b.pmma, ma: d.brasoes.ma || b.ma, bpm: d.brasoes.bpm || b.bpm })); }).catch(() => {});
  }, []);

  const salvarOv = (np: Record<string, Override>) => {
    if (salvarTimer.current) clearTimeout(salvarTimer.current);
    salvarTimer.current = setTimeout(() => {
      fetch("/api/cpu-permutas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permutas: np }) }).catch(() => {});
    }, 700);
  };
  const setOverride = (iso: string, patch: Override) => {
    setOv((prev) => {
      const atual = { ...(prev[iso] || {}) };
      for (const [k, v] of Object.entries(patch)) { if (v && v.trim()) (atual as any)[k] = v; else delete (atual as any)[k]; }
      const np = { ...prev };
      if (Object.keys(atual).length) np[iso] = atual; else delete np[iso];
      salvarOv(np);
      return np;
    });
  };
  const aplicar = (mapa: Record<string, Override>) => {
    setOv((prev) => {
      const np = { ...prev };
      for (const [iso, patch] of Object.entries(mapa)) {
        const atual: Override = {};
        (["nome", "fone", "permuta"] as const).forEach((k) => { const v = patch[k]; if (v && v.trim()) atual[k] = v; });
        if (Object.keys(atual).length) np[iso] = atual; else delete np[iso];
      }
      salvarOv(np);
      return np;
    });
  };

  const auto = (iso: string) => {
    if (!cad) return { nome: "", fone: "" };
    const id = rodizio(cad.cpu || [], iso, cad.afastamentos || [], cad.refCpuISO || iso);
    const m = id ? efMap[id] : null;
    return { nome: m ? nomeCpu(m) : "", fone: m ? fone(m.telefone || "") : "" };
  };
  // ID efetivo do CPU no dia: excecao da escala (cad.cpuOverrides) > rodizio.
  // "" = ninguem; "__FOLGA__" = folga. Fonte UNICA, igual escala diaria/mapa.
  const effIdCpu = (iso: string): string => {
    const v = cad?.cpuOverrides?.[iso];
    if (v !== undefined) return v;
    if (!cad) return "";
    return rodizio(cad.cpu || [], iso, cad.afastamentos || [], cad.refCpuISO || iso) || "";
  };
  const nomeDe = (iso: string) => {
    const v = cad?.cpuOverrides?.[iso];
    if (v !== undefined) return v === "" ? "" : (v.startsWith("__FOLGA") ? "Folga" : (efMap[v] ? nomeCpu(efMap[v]) : v));
    return ov[iso]?.nome ?? auto(iso).nome;
  };
  const foneDe = (iso: string) => {
    const v = cad?.cpuOverrides?.[iso];
    if (v !== undefined) {
      if (v && !v.startsWith("__FOLGA") && efMap[v]) return ov[iso]?.fone ?? fone(efMap[v].telefone || "");
      return ov[iso]?.fone ?? "";
    }
    return ov[iso]?.fone ?? auto(iso).fone;
  };
  const permDe = (iso: string) => ov[iso]?.permuta ?? "";

  // Grava a excecao do CPU no MESMO lugar da escala/mapa (cad.cpuOverrides),
  // entao reflete na escala diaria, no mapa e na impressao (fonte unica).
  const salvarCad = (nc: Cadastro) => {
    if (cadTimer.current) clearTimeout(cadTimer.current);
    cadTimer.current = setTimeout(() => {
      fetch("/api/escala-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cad: nc }) }).catch(() => {});
    }, 600);
  };
  const setCpuEscala = (iso: string, val: string | null) => setCad((c) => {
    if (!c) return c;
    const o = { ...(c.cpuOverrides || {}) };
    if (val === null) delete o[iso]; else o[iso] = val;
    const nc = { ...c, cpuOverrides: o };
    salvarCad(nc);
    return nc;
  });

  const soltar = (target: string) => {
    if (!drag || drag === target) { setDrag(null); return; }
    const a = effIdCpu(drag), b = effIdCpu(target);
    setCad((c) => {
      if (!c) return c;
      const o = { ...(c.cpuOverrides || {}) };
      o[target] = a; o[drag] = b; // troca os oficiais entre os dois dias
      const nc = { ...c, cpuOverrides: o };
      salvarCad(nc);
      return nc;
    });
    // troca tambem fone/permuta manuais (ov) entre os dias
    aplicar({ [target]: { fone: ov[drag]?.fone || "", permuta: ov[drag]?.permuta || "" }, [drag]: { fone: ov[target]?.fone || "", permuta: ov[target]?.permuta || "" } });
    setDrag(null);
  };

  const salvarBrasoes = (novo: Brasoes) => {
    setBrasoes(novo);
    if (brasoesTimer.current) clearTimeout(brasoesTimer.current);
    brasoesTimer.current = setTimeout(() => {
      fetch("/api/cpu-brasoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brasoes: novo }) }).catch(() => {});
    }, 500);
  };
  const pickBrasao = (key: keyof Brasoes) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => { const f = inp.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => salvarBrasoes({ ...brasoes, [key]: String(rd.result) }); rd.readAsDataURL(f); };
    inp.click();
  };
  const BrasaoImg = ({ k, cls }: { k: keyof Brasoes; cls: string }) => (
    <div className={"cpuw-brasao " + cls} onClick={() => pickBrasao(k)} title="Clique para trocar a logomarca">
      {brasoes[k] ? <img src={brasoes[k]} alt="" /> : <span className="cpuw-brasao-ph no-print">logo</span>}
    </div>
  );

  const semanas = useMemo(() => [0, 1, 2, 3].map((w) => Array.from({ length: 7 }, (_, i) => somaDias(inicio, w * 7 + i))), [inicio]);

  const Pagina = ({ dias, ultima }: { dias: string[]; ultima: boolean }) => (
    <div className={"cpuw-paper" + (ultima ? "" : " quebra")}>
      <div className="cpuw-hdr">
        <BrasaoImg k="pmma" cls="cpuw-hleft" />
        <div className="cpuw-center">
          <BrasaoImg k="ma" cls="cpuw-hma" />
          <div className="cpuw-org">{ORG.map((l, i) => <div key={i} className={i === 4 ? "s" : ""}>{l}</div>)}</div>
        </div>
        <BrasaoImg k="bpm" cls="cpuw-hright" />
      </div>

      <div className="cpuw-titw">
        <div className="cpuw-visto">
          <div className="cpuw-visto-t">VISTO</div>
          {chefe.cmtAssinatura ? <img src={chefe.cmtAssinatura} alt="" className="cpuw-visto-img" /> : <div className="cpuw-visto-esp" />}
          <div className="cpuw-visto-c">Cmt. do 18º BPM</div>
        </div>
        <div className="cpuw-titulo">ESCALA DE SERVIÇO SEMANAL CPU (18º BPM)</div>
      </div>

      <table className="cpuw-tab"><tbody>
        <tr>{dias.map((iso) => (
          <td key={iso} className="cpuw-hd">
            <div>{DIAS_SEMANA[parseISO(iso).getDay()]}</div>
            <div>({brData(iso)})</div>
          </td>
        ))}</tr>
        <tr>{dias.map((iso) => (
          <td key={iso} className={"cpuw-nome" + (drag ? " alvo" : "")} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(iso)}>
            <span className="cpuw-grip no-print" draggable onDragStart={() => setDrag(iso)} onDragEnd={() => setDrag(null)} title="Arraste para mover este oficial para outro dia">⠿</span>
            <span className="cpuw-nome-t cpuw-pick" onClick={() => { setBuscaCpu(""); setEditCpu(iso); }} title="Clique para escolher o oficial de dia">
              {nomeDe(iso) || <span className="cpuw-ph no-print">escolher oficial</span>}
            </span>
            {permDe(iso) && <span className="cpuw-perm only-print"> (PERMUTA- {permDe(iso)})</span>}
            <span className="cpuw-perm-edit no-print">(PERMUTA- <Editavel value={permDe(iso)} onChange={(v) => setOverride(iso, { permuta: v })} className="cpuw-perm-in" placeholder="substituto" />)</span>
          </td>
        ))}</tr>
        <tr>{dias.map((iso) => (
          <td key={iso} className="cpuw-fone"><Editavel value={foneDe(iso)} onChange={(v) => setOverride(iso, { fone: v })} placeholder="telefone" /></td>
        ))}</tr>
      </tbody></table>

      <div className="cpuw-ass">
        {chefe.assinarGov ? <div className="cpuw-ass-esp" />
          : chefe.assinatura ? <img className="cpuw-ass-img" src={chefe.assinatura} alt="" /> : <div className="cpuw-ass-esp" />}
        <div className="cpuw-ass-nome">{chefe.nome || "—"}</div>
        <div className="cpuw-ass-func">{chefe.funcao || ""}</div>
      </div>
    </div>
  );

  return (
    <div className="cpuw-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cpuw-bar no-print">
        <a className="cpuw-btn" href="/escalas/servico/cpu">← Voltar</a>
        <button className="cpuw-btn" title="Mês anterior" onClick={() => { const d = parseISO(inicio); setInicio(semanasDoMes(toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)))[0].iso); }}>◀</button>
        <span className="cpuw-mes">{MESES_PT[parseISO(inicio).getMonth()]} / {parseISO(inicio).getFullYear()}</span>
        <button className="cpuw-btn" title="Próximo mês" onClick={() => { const d = parseISO(inicio); setInicio(semanasDoMes(toISO(new Date(d.getFullYear(), d.getMonth() + 1, 1)))[0].iso); }}>▶</button>
        <span className="cpuw-semweeks">Semana:
          {semanasDoMes(inicio).map((s) => (
            <button key={s.iso} className={"cpuw-wk" + (s.iso === inicio ? " on" : "")} onClick={() => setInicio(s.iso)}>{s.rotulo}</button>
          ))}
        </span>
        <label className="cpuw-field">Início
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <span className="cpuw-spacer" />
        <span className="cpuw-hint">Arraste o ⠿ para mover o oficial entre os dias · tudo salva sozinho</span>
        <button className="cpuw-btn primary" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
      </div>

      {semanas.map((dias, wi) => <Pagina key={wi} dias={dias} ultima={wi === semanas.length - 1} />)}

      {/* Seletor do oficial de dia (autocomplete) — grava na fonte unica */}
      {editCpu && (
        <div className="no-print" onClick={() => setEditCpu(null)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, background: "#0F1B2D", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
              <b style={{ color: "#fff" }}>CPU de dia · {brData(editCpu)}</b>
              <button onClick={() => setEditCpu(null)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>Atual: <b style={{ color: "#E8EEF6" }}>{nomeDe(editCpu) || "—"}</b></div>
              <input autoFocus value={buscaCpu} onChange={(e) => setBuscaCpu(e.target.value)} placeholder="Buscar oficial..."
                style={{ width: "100%", background: "#0a1626", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", color: "#fff", outline: "none", fontSize: 13 }} />
              {buscaCpu.trim().length >= 1 && (
                <div style={{ marginTop: 6, maxHeight: 220, overflowY: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }}>
                  {Object.values(efMap).filter((m) => (nomeCpu(m) + " " + (m.nomeGuerra || "") + " " + (m.nome || "")).toLowerCase().includes(buscaCpu.trim().toLowerCase())).slice(0, 14).map((m) => (
                    <button key={m.id} onClick={() => { setCpuEscala(editCpu, m.id); setEditCpu(null); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,.05)", color: "#fff", cursor: "pointer", fontSize: 13 }}>
                      {nomeCpu(m)}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => { setCpuEscala(editCpu, "__FOLGA__"); setEditCpu(null); }}
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#241a08", border: "1px solid #6b5320", borderRadius: 8, color: "#e8c877", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Folga</button>
                <button onClick={() => { setCpuEscala(editCpu, ""); setEditCpu(null); }}
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#2a1414", border: "1px solid #7a1f1f", borderRadius: 8, color: "#ffb3b3", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Excluir</button>
                <button onClick={() => { setCpuEscala(editCpu, null); setEditCpu(null); }}
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#0b1626", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: "#cdd9ea", cursor: "pointer", fontSize: 13 }}>Automático</button>
              </div>
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>Vale para todas as telas (escala diária, mapa e impressão).</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.cpuw-wrap{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }
.cpuw-bar{ display:flex; align-items:center; flex-wrap:wrap; gap:10px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:12px 14px; margin-bottom:14px; }
.cpuw-btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; text-decoration:none; }
.cpuw-mes{ font-weight:700; color:#E8EEF6; text-transform:capitalize; min-width:120px; text-align:center; }
.cpuw-semweeks{ display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#9fb0c7; }
.cpuw-wk{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:7px; width:26px; height:26px; font-size:12px; cursor:pointer; }
.cpuw-wk.on{ background:#D4AF37; color:#1a1205; border-color:#D4AF37; font-weight:700; }
.cpuw-wk:hover:not(.on){ border-color:#D4AF37; }
.cpuw-btn:hover{ border-color:#D4AF37; }
.cpuw-btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.cpuw-field{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.cpuw-field input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:13px; }
.cpuw-spacer{ flex:1; }
.cpuw-hint{ font-size:11px; color:#8fa3bf; max-width:340px; }

.cpuw-paper{ background:#fff; color:#000; width:297mm; max-width:100%; margin:0 auto 18px; padding:8mm 12mm; box-shadow:0 10px 40px rgba(0,0,0,.5); font-family:"Times New Roman", Georgia, serif; }
.cpuw-hdr{ display:flex; gap:6px; align-items:flex-start; }
.cpuw-center{ flex:1; display:flex; flex-direction:column; align-items:center; }
.cpuw-org{ text-align:center; font-size:13px; margin-top:2px; } .cpuw-org .s{ font-weight:700; }
.cpuw-brasao{ display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; margin:0 auto; }
.cpuw-brasao img{ max-width:100%; max-height:100%; object-fit:contain; }
.cpuw-hleft{ width:110px; height:82px; }
.cpuw-hma{ width:60px; height:66px; }
.cpuw-hright{ width:84px; height:86px; }

.cpuw-titw{ position:relative; min-height:58px; margin-top:6px; }
.cpuw-visto{ position:absolute; left:0; bottom:0; width:132px; text-align:center; font-size:11px; line-height:1.15; }
.cpuw-visto-t{ font-weight:700; }
.cpuw-visto-img{ max-width:118px; max-height:44px; object-fit:contain; display:block; margin:0 auto; }
.cpuw-visto-esp{ height:44px; }
.cpuw-visto-c{ font-weight:700; border-top:1px solid #000; display:inline-block; padding-top:1px; margin-top:2px; }
.cpuw-titulo{ text-align:center; font-weight:700; font-size:19px; text-decoration:underline; padding-top:16px; }

.cpuw-tab{ width:100%; border-collapse:collapse; table-layout:fixed; margin-top:14px; }
.cpuw-tab td{ border:1px solid #000; text-align:center; padding:8px 4px; vertical-align:middle; }
.cpuw-hd{ font-weight:700; font-size:12.5px; }
.cpuw-nome{ font-style:italic; font-size:14px; padding:14px 4px !important; }
.cpuw-nome.alvo{ outline:2px dashed #3b82f6; outline-offset:-3px; }
.cpuw-nome-t{ display:block; }
.cpuw-pick{ cursor:pointer; border-radius:4px; }
.cpuw-pick:hover{ background:rgba(212,175,55,.12); box-shadow:inset 0 0 0 1px rgba(212,175,55,.5); }
.cpuw-ph{ color:#aaa; font-style:normal; }
.cpuw-grip{ cursor:grab; color:#7a8aa0; font-size:13px; margin-right:3px; user-select:none; }
.cpuw-perm{ font-style:italic; font-weight:700; }
.cpuw-perm-edit{ display:block; font-size:11px; color:#333; margin-top:4px; }
.cpuw-fone{ font-size:12.5px; }
.cpuw-edit{ outline:none; min-width:20px; display:inline-block; }
.cpuw-edit:empty:before{ content:attr(data-ph); color:#aaa; font-style:normal; }
.cpuw-ass{ text-align:center; margin-top:26px; }
.cpuw-ass-img{ max-height:52px; max-width:240px; object-fit:contain; display:block; margin:0 auto 2px; }
.cpuw-ass-esp{ height:52px; }
.cpuw-ass-nome{ font-weight:700; font-size:14px; } .cpuw-ass-func{ font-size:14px; }
.only-print{ display:none; }

@media screen{
  .cpuw-edit{ background:#fbfbe8; border:1px dashed #bbb; border-radius:3px; padding:0 3px; min-height:16px; }
  .cpuw-brasao{ border:1px dashed #b9b9b9; background:#fafafa; }
  .cpuw-brasao:hover{ border-color:#D4AF37; }
  .cpuw-brasao-ph{ font-size:9px; color:#9a9a9a; }
}
@media print{
  @page{ size:A4 landscape; margin:8mm; }
  body{ background:#fff !important; }
  body *{ visibility:hidden !important; }
  .cpuw-paper, .cpuw-paper *{ visibility:visible !important; }
  .cpuw-paper{ position:static; width:100% !important; box-shadow:none !important; padding:0 8mm !important; margin:0 !important; }
  .cpuw-paper.quebra{ break-after:page; page-break-after:always; }
  .only-print{ display:inline !important; }
  .no-print{ display:none !important; }
}
`;
