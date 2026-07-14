"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   Escala de Serviço SEMANAL do CPU (paisagem) — modelo do print oficial.
   7 dias a partir da data escolhida; para cada dia o oficial do rodizio de
   CPU (mesmo motor) + telefone. Assinatura = chefe atual (config), sem o
   nome antigo. Puxa do servidor (escala-config / efetivo / escala-chefe).
   ========================================================================= */

type Afastamento = { militar: string; tipo: string; inicio: string; fim: string };
type Cadastro = { cpu: string[]; afastamentos: Afastamento[]; refCpuISO: string };
type Militar = { id: string; postoGrad: string; numeroBarra: string; nome: string; nomeGuerra: string; telefone?: string; quadro?: string };
type Chefe = { nome: string; funcao: string; assinatura?: string; assinarGov?: boolean; cmtAssinatura?: string };

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

function segundaDaSemana(): string {
  const h = new Date();
  const g = h.getDay(); // 0 dom..6 sab
  const diff = g === 0 ? -6 : 1 - g; // volta pra segunda
  return toISO(new Date(h.getTime() + diff * DAY));
}

export default function CpuSemanalClient() {
  const [cad, setCad] = useState<Cadastro | null>(null);
  const [efMap, setEfMap] = useState<Record<string, Militar>>({});
  const [chefe, setChefe] = useState<Chefe>({ nome: "", funcao: "", assinatura: "", assinarGov: false, cmtAssinatura: "/brasoes/assinatura-cmt.png" });
  const [inicio, setInicio] = useState<string>(segundaDaSemana());
  const [permutas, setPermutas] = useState<Record<string, string>>({});
  const salvarTimer = useRef<any>(null);

  useEffect(() => {
    fetch("/api/escala-config").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.cad) setCad(d.cad); }).catch(() => {});
    fetch("/api/efetivo").then((r) => r.ok ? r.json() : null).then((d) => {
      const m: Record<string, Militar> = {}; for (const x of (d?.efetivo || [])) m[x.id] = x; setEfMap(m);
    }).catch(() => {});
    fetch("/api/escala-chefe").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setChefe({ nome: d.nome || "", funcao: d.funcao || "", assinatura: d.assinatura || "", assinarGov: d.assinarGov === true, cmtAssinatura: d.cmtAssinatura || "/brasoes/assinatura-cmt.png" }); }).catch(() => {});
    fetch("/api/cpu-permutas").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.permutas && typeof d.permutas === "object") setPermutas(d.permutas); }).catch(() => {});
  }, []);

  const setPermuta = (iso: string, nome: string) => {
    setPermutas((p) => {
      const np = { ...p }; const v = nome.trim();
      if (v) np[iso] = v; else delete np[iso];
      if (salvarTimer.current) clearTimeout(salvarTimer.current);
      salvarTimer.current = setTimeout(() => {
        fetch("/api/cpu-permutas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permutas: np }) }).catch(() => {});
      }, 700);
      return np;
    });
  };

  const linhaDe = (iso: string) => {
    if (!cad) return { iso, nome: "—", fone: "" };
    const id = rodizio(cad.cpu || [], iso, cad.afastamentos || [], cad.refCpuISO || iso);
    const m = id ? efMap[id] : null;
    return { iso, nome: m ? nomeCpu(m) : "—", fone: m ? fone(m.telefone || "") : "" };
  };
  // O mes recortado em 4 semanas (4 blocos de 7 dias a partir do inicio).
  const semanas = useMemo(() => [0, 1, 2, 3].map((w) => Array.from({ length: 7 }, (_, i) => somaDias(inicio, w * 7 + i))), [inicio]);

  return (
    <div className="cpuw-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cpuw-bar no-print">
        <a className="cpuw-btn" href="/escalas/servico/cpu">← Voltar</a>
        <label className="cpuw-field">Início (1ª semana)
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <span className="cpuw-spacer" />
        <button className="cpuw-btn primary" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
      </div>

      <div className="cpuw-paper">
        <div className="cpuw-hdr">
          <div className="cpuw-visto">
            <div className="cpuw-visto-t">VISTO</div>
            {chefe.cmtAssinatura && <img src={chefe.cmtAssinatura} alt="" className="cpuw-visto-img" />}
            <div className="cpuw-visto-c">Cmt. do 18º BPM</div>
          </div>
          <img src="/brasoes/pmma-190.jpg" alt="" className="cpuw-b190" />
          <div className="cpuw-center">
            <img src="/brasoes/armas-ma.png" alt="" className="cpuw-ma" />
            <div className="cpuw-org">{ORG.map((l, i) => <div key={i} className={i === 4 ? "s" : ""}>{l}</div>)}</div>
          </div>
          <img src="/brasoes/brasao-18bpm.png" alt="" className="cpuw-bpm" />
        </div>

        <div className="cpuw-titulo">ESCALA DE SERVIÇO SEMANAL CPU (18º BPM)</div>

        {semanas.map((dias, wi) => (
          <div key={wi} className="cpuw-semana">
            <div className="cpuw-semana-t">Semana {wi + 1} · {brData(dias[0])} a {brData(dias[6])}</div>
            <table className="cpuw-tab"><tbody>
              <tr>{dias.map((iso) => (
                <td key={iso} className="cpuw-hd">
                  <div>{DIAS_SEMANA[parseISO(iso).getDay()]}</div>
                  <div>({brData(iso)})</div>
                </td>
              ))}</tr>
              <tr>{dias.map((iso) => {
                const l = linhaDe(iso); const pm = permutas[iso];
                return <td key={iso} className="cpuw-nome">{l.nome}{pm ? <span className="cpuw-perm"> (PERMUTA- {pm})</span> : ""}</td>;
              })}</tr>
              <tr>{dias.map((iso) => <td key={iso} className="cpuw-fone">{linhaDe(iso).fone || "—"}</td>)}</tr>
              <tr className="no-print">{dias.map((iso) => (
                <td key={iso} className="cpuw-permedit">
                  <input value={permutas[iso] || ""} placeholder="+ permuta (substituto)" onChange={(e) => setPermuta(iso, e.target.value)} />
                </td>
              ))}</tr>
            </tbody></table>
          </div>
        ))}

        <div className="cpuw-ass">
          {chefe.assinarGov ? <div className="cpuw-ass-esp" />
            : chefe.assinatura ? <img className="cpuw-ass-img" src={chefe.assinatura} alt="" /> : <div className="cpuw-ass-esp" />}
          <div className="cpuw-ass-nome">{chefe.nome || "—"}</div>
          <div className="cpuw-ass-func">{chefe.funcao || ""}</div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cpuw-wrap{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }
.cpuw-bar{ display:flex; align-items:flex-end; gap:12px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:12px 14px; margin-bottom:14px; }
.cpuw-btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; text-decoration:none; }
.cpuw-btn:hover{ border-color:#D4AF37; }
.cpuw-btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.cpuw-field{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.cpuw-field input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:13px; }
.cpuw-spacer{ flex:1; }

.cpuw-paper{ background:#fff; color:#000; width:297mm; max-width:100%; margin:0 auto; padding:8mm 12mm; box-shadow:0 10px 40px rgba(0,0,0,.5); font-family:"Times New Roman", Georgia, serif; }
.cpuw-hdr{ display:flex; align-items:flex-start; gap:8px; position:relative; }
.cpuw-visto{ position:absolute; left:0; top:6px; width:120px; text-align:center; font-size:11px; }
.cpuw-visto-t{ font-weight:700; } .cpuw-visto-img{ max-width:96px; max-height:40px; object-fit:contain; } .cpuw-visto-c{ font-weight:700; }
.cpuw-b190{ width:110px; height:78px; object-fit:contain; margin-left:120px; }
.cpuw-center{ flex:1; display:flex; flex-direction:column; align-items:center; }
.cpuw-ma{ width:60px; height:66px; object-fit:contain; }
.cpuw-org{ text-align:center; font-size:13px; margin-top:2px; } .cpuw-org .s{ font-weight:700; }
.cpuw-bpm{ width:80px; height:84px; object-fit:contain; }
.cpuw-titulo{ text-align:center; font-weight:700; font-size:19px; text-decoration:underline; margin:12px 0 16px; }
.cpuw-tab{ width:100%; border-collapse:collapse; table-layout:fixed; }
.cpuw-tab td{ border:1px solid #000; text-align:center; padding:8px 4px; }
.cpuw-hd{ font-weight:700; font-size:12.5px; }
.cpuw-nome{ font-style:italic; font-size:14px; padding:16px 4px !important; }
.cpuw-perm{ font-style:italic; font-weight:700; }
.cpuw-fone{ font-size:12.5px; }
.cpuw-semana{ margin-bottom:14px; }
.cpuw-semana-t{ font-weight:700; font-size:12.5px; margin:10px 0 3px; }
.cpuw-permedit{ padding:3px !important; }
.cpuw-permedit input{ width:100%; box-sizing:border-box; border:1px dashed #9aa; border-radius:4px; padding:3px 4px; font-size:10.5px; font-family:inherit; }
.cpuw-ass{ text-align:center; margin-top:26px; }
.cpuw-ass-img{ max-height:52px; max-width:240px; object-fit:contain; display:block; margin:0 auto 2px; }
.cpuw-ass-esp{ height:52px; }
.cpuw-ass-nome{ font-weight:700; font-size:14px; } .cpuw-ass-func{ font-size:14px; }

@media print{
  @page{ size:A4 landscape; margin:8mm; }
  body{ background:#fff !important; }
  body *{ visibility:hidden !important; }
  .cpuw-paper, .cpuw-paper *{ visibility:visible !important; }
  .cpuw-paper{ position:absolute; left:0; top:0; width:100% !important; box-shadow:none !important; padding:0 !important; }
  .no-print{ display:none !important; }
}
`;
