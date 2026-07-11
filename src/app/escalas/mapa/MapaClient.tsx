"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================================================================
   SIGEP-18BPM · MAPA DE ESCALA (GUARDIAO) — semi-automatico  ·  v2 UX
   Visao do mes inteiro, gerada pelo MESMO motor da Escala de Servico,
   lendo os mesmos pools/afastamentos (sigep_cadastro) e os dias ja
   salvos/editados (sigep_escalas). Nao tem "salvar": e automatico.
   Duas visoes: Por servico (funcao x dia) e Por militar (militar x dia).
   NOVO NESTA VERSAO:
   - Contador de conflitos do mes no topo (clique = filtra so conflitos)
   - Busca por militar (visao Por militar)
   - Clique em um nome (visao Por servico) destaca todos os dias dele
   - Coluna de hoje com destaque mais forte
   Colocar em: src/app/escalas/mapa/MapaClient.tsx
   ========================================================================= */

/* ===================== MOTOR (espelho do modulo de escalas) ===================== */

type Slot = { titular: string; permuta: string | null; status?: any };
type TipoAfastamento =
  | "ferias" | "missao" | "curso" | "licenca_premio"
  | "licenca_paternidade" | "jms" | "rotam" | "outro";
type Afastamento = { militar: string; tipo: TipoAfastamento; inicio: string; fim: string };
type EquipeRotem = { nome: string; turnos: string[]; militares: string[] };
type Cadastro = {
  cpu: string[]; ftGraduado: string[]; ftMotorista: string[]; ftPatrulheiro: string[];
  rpAdjunto: string[]; rpMotorista: string[]; rpPatrulheiro: string[];
  guardaPermanente: string[]; inteligencia: string[];
  rotemEquipes: EquipeRotem[]; afastamentos: Afastamento[];
  refRodizioISO: string; refCpuISO: string; refRotemISO: string;
};

type Militar = {
  id: string; postoGrad: string; numeroBarra: string; nome: string;
  nomeGuerra: string; matricula: string; situacao: string; status: string;
};
const ABREV_POSTO: { re: RegExp; abbr: string }[] = [
  { re: /tenente[-\s]?coronel/i, abbr: "TC PM" },
  { re: /coronel/i, abbr: "Cel PM" },
  { re: /major/i, abbr: "Maj PM" },
  { re: /capit[a\u00e3]o/i, abbr: "Cap PM" },
  { re: /1.?\s*tenente|primeiro\s+tenente/i, abbr: "1\u00ba Ten PM" },
  { re: /2.?\s*tenente|segundo\s+tenente/i, abbr: "2\u00ba Ten PM" },
  { re: /aspirante/i, abbr: "Asp Of PM" },
  { re: /subtenente|sub\s*tenente/i, abbr: "Sub Ten PM" },
  { re: /1.?\s*sargento|primeiro\s+sargento/i, abbr: "1\u00ba Sgt PM" },
  { re: /2.?\s*sargento|segundo\s+sargento/i, abbr: "2\u00ba Sgt PM" },
  { re: /3.?\s*sargento|terceiro\s+sargento/i, abbr: "3\u00ba Sgt PM" },
  { re: /cabo/i, abbr: "Cb PM" },
  { re: /soldado/i, abbr: "Sd PM" },
];

function abreviaPosto(posto: string): string {
  const p = (posto || "").trim();
  if (!p) return "";
  for (const a of ABREV_POSTO) if (a.re.test(p)) return a.abbr;
  return p;
}

function barraValida(b: string): boolean {
  return /\d/.test((b || "").trim());
}

function capitalizaNome(s: string): string {
  const t = (s || "").trim().toLowerCase();
  if (!t) return "";
  // Mantem ligacoes em minusculo (da, de, do, dos, e). Primeira palavra sempre capitaliza.
  const liga = new Set(["da", "de", "do", "das", "dos", "e"]);
  return t.split(/\s+/).map((p, i) => {
    if (i > 0 && liga.has(p)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
}

function fmtMilitar(m: Militar): string {
  const posto = abreviaPosto(m.postoGrad || "");
  const barra = (m.numeroBarra || "").trim();
  const guerra = capitalizaNome(m.nomeGuerra || m.nome || "");
  if (barraValida(barra)) return [posto, "n\u00ba", barra, guerra].filter(Boolean).join(" ").trim();
  return [posto, guerra].filter(Boolean).join(" ").trim();
}

function semTags(html: string): string {
  if (!html) return "";
  if (html.indexOf("<") === -1) return html.trim();
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "").trim();
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").trim();
}

const SEED_CADASTRO: Cadastro = {
  cpu: [], ftGraduado: [], ftMotorista: [], ftPatrulheiro: [],
  rpAdjunto: [], rpMotorista: [], rpPatrulheiro: [],
  guardaPermanente: [], inteligencia: [],
  rotemEquipes: [],
  afastamentos: [],
  refRodizioISO: "2026-06-01", refCpuISO: "2026-06-01", refRotemISO: "2026-06-01",
};

const DAY = 86400000;
const parseISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const toISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const diasEntre = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
const proxDia = (iso: string) => toISO(new Date(parseISO(iso).getTime() + DAY));

function afastado(nome: string, data: string, lista: Afastamento[]) {
  return lista.some((a) => a.militar === nome && data >= a.inicio && data <= a.fim);
}
function afastamentoDe(nome: string, data: string, lista: Afastamento[]): TipoAfastamento | null {
  const a = lista.find((x) => x.militar === nome && data >= x.inicio && data <= x.fim);
  return a ? a.tipo : null;
}
function rodizio(pool: string[], qtd: number, dataAlvo: string, afast: Afastamento[], ref: string): string[] {
  if (pool.length === 0 || dataAlvo < ref) return [];
  const ultimo: Record<string, string> = {};
  let alvo: string[] = [];
  const ordena = (arr: string[]) => arr.slice().sort((x, y) => {
    const lx = ultimo[x] ? parseISO(ultimo[x]).getTime() : 0, ly = ultimo[y] ? parseISO(ultimo[y]).getTime() : 0;
    if (lx !== ly) return lx - ly; return pool.indexOf(x) - pool.indexOf(y);
  });
  for (let d = ref; d <= dataAlvo; d = proxDia(d)) {
    const restOK = (m: string) => !ultimo[m] || diasEntre(ultimo[m], d) >= 3;
    let esc = ordena(pool.filter((m) => !afastado(m, d, afast) && restOK(m))).slice(0, qtd);
    if (esc.length < qtd) {
      const resto = pool.filter((m) => !afastado(m, d, afast) && !esc.includes(m));
      esc = esc.concat(ordena(resto).slice(0, qtd - esc.length));
    }
    esc.forEach((m) => (ultimo[m] = d));
    if (d === dataAlvo) alvo = esc;
  }
  return alvo;
}
function equipeRotem(data: string, equipes: EquipeRotem[], ref: string): EquipeRotem | null {
  if (equipes.length === 0) return null;
  const bloco = Math.floor(diasEntre(ref, data) / 3);
  return equipes[(((bloco % equipes.length) + equipes.length) % equipes.length)];
}

type Assign = Record<string, string[]>;
function assignDia(iso: string, cad: Cadastro, escalas: Record<string, any>, idDe: (nome: string) => string): Assign {
  const e = escalas[iso];
  if (e) {
    // Dias salvos guardam NOMES na folha; normalizamos para ID quando possivel
    // para casar com pools/afastamentos (que sao IDs).
    const t = (s: any) => (s && s.titular ? idDe(semTags(String(s.titular))) : "");
    const lst = (arr: any[]) => (arr || []).map(t).filter(Boolean);
    return {
      cpu: [t(e.cpuDeDia)].filter(Boolean),
      ftGraduado: [t(e.ftGraduado)].filter(Boolean),
      ftMotorista: [t(e.ftMotorista)].filter(Boolean),
      ftPatrulheiro: [t(e.ftPatrulheiro)].filter(Boolean),
      rpAdjunto: [t(e.rpAdjunto)].filter(Boolean),
      rpMotorista: [t(e.rpMotorista)].filter(Boolean),
      rpPatrulheiro: lst(e.rpPatrulheiro),
      guardaPermanente: lst(e.guardaPermanente),
      inteligencia: lst(e.inteligencia),
      rotem: lst(e.rotemMilitares),
    };
  }
  const a = cad.afastamentos, r = cad.refRodizioISO;
  const eq = equipeRotem(iso, cad.rotemEquipes, cad.refRotemISO);
  return {
    cpu: rodizio(cad.cpu, 1, iso, a, cad.refCpuISO),
    ftGraduado: rodizio(cad.ftGraduado, 1, iso, a, r),
    ftMotorista: rodizio(cad.ftMotorista, 1, iso, a, r),
    ftPatrulheiro: rodizio(cad.ftPatrulheiro, 1, iso, a, r),
    rpAdjunto: rodizio(cad.rpAdjunto, 1, iso, a, r),
    rpMotorista: rodizio(cad.rpMotorista, 1, iso, a, r),
    rpPatrulheiro: rodizio(cad.rpPatrulheiro, 1, iso, a, r),
    guardaPermanente: rodizio(cad.guardaPermanente, 1, iso, a, r),
    inteligencia: rodizio(cad.inteligencia, 1, iso, a, r),
    rotem: eq ? eq.militares.slice() : [],
  };
}

/* ===================== util ===================== */

const SERVICOS: { key: string; label: string }[] = [
  { key: "cpu", label: "CPU de dia" },
  { key: "ftGraduado", label: "FT · Graduado" },
  { key: "ftMotorista", label: "FT · Motorista" },
  { key: "ftPatrulheiro", label: "FT · Armeiro/Patr." },
  { key: "rpAdjunto", label: "RP · Adjunto" },
  { key: "rpMotorista", label: "RP · Motorista" },
  { key: "rpPatrulheiro", label: "RP · Patrulheiro" },
  { key: "guardaPermanente", label: "Guarda · Perm." },
  { key: "inteligencia", label: "Inteligência" },
  { key: "rotem", label: "ROTEM" },
];
const ABBR_FUNC: Record<string, string> = {
  cpu: "CPU", ftGraduado: "FT-G", ftMotorista: "FT-M", ftPatrulheiro: "FT-P",
  rpAdjunto: "RP-A", rpMotorista: "RP-M", rpPatrulheiro: "RP-P",
  guardaPermanente: "GD", inteligencia: "INT", rotem: "ROT",
};
const ABBR_AF: Record<TipoAfastamento, string> = {
  ferias: "FÉR", missao: "MIS", curso: "CUR", licenca_premio: "LP",
  licenca_paternidade: "LPT", jms: "JMS", rotam: "RTM", outro: "AF",
};
const DSEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESNOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function sobrenome(n: string): string {
  const t = n.trim().split(/\s+/);
  return t[t.length - 1] || n;
}
function fimDeSemana(iso: string) { const g = parseISO(iso).getDay(); return g === 0 || g === 6; }
function brCurto(iso: string) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }

/* ===================== PAGINA ===================== */

export default function MapaClient() {
  const [cad, setCad] = useState<Cadastro>(SEED_CADASTRO);
  const [escalas, setEscalas] = useState<Record<string, any>>({});
  const [mes, setMes] = useState("2026-06");
  const [vista, setVista] = useState<"servico" | "militar">("servico");
  const [hoje, setHoje] = useState("");
  const [busca, setBusca] = useState("");
  const [soConflitos, setSoConflitos] = useState(false);
  const [selNome, setSelNome] = useState<string | null>(null);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);

  useEffect(() => {
    try {
      const c = localStorage.getItem("sigep_cadastro"); if (c) setCad(JSON.parse(c));
      const e = localStorage.getItem("sigep_escalas"); if (e) setEscalas(JSON.parse(e));
    } catch {}
    setHoje(toISO(new Date()));
    fetch("/api/efetivo")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setEfetivo((d.efetivo || d || []) as Militar[]))
      .catch(() => {});
  }, []);

  const efMap = useMemo(() => {
    const mm: Record<string, Militar> = {};
    for (const x of efetivo) mm[x.id] = x;
    return mm;
  }, [efetivo]);
  const nomeDe = useMemo(() => (token: string) => {
    if (!token) return "";
    const mm = efMap[token];
    return mm ? fmtMilitar(mm) : token;
  }, [efMap]);
  const idDe = useMemo(() => {
    const idx: Record<string, string> = {};
    for (const x of efetivo) idx[fmtMilitar(x)] = x.id;
    return (nome: string) => idx[nome] || nome;
  }, [efetivo]);

  const [ano, m] = mes.split("-").map(Number);
  const nDias = new Date(ano, m, 0).getDate();
  const dias = useMemo(
    () => Array.from({ length: nDias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
    [mes, nDias]
  );

  const assign = useMemo(() => {
    const out: Record<string, Assign> = {};
    for (const iso of dias) out[iso] = assignDia(iso, cad, escalas, idDe);
    return out;
  }, [dias, cad, escalas, idDe]);

  const militares = useMemo(() => {
    const ordem: string[] = [
      ...cad.cpu, ...cad.ftGraduado, ...cad.ftMotorista, ...cad.ftPatrulheiro,
      ...cad.rpAdjunto, ...cad.rpMotorista, ...cad.rpPatrulheiro,
      ...cad.guardaPermanente, ...cad.inteligencia,
      ...cad.rotemEquipes.flatMap((e) => e.militares),
    ];
    const set = new Set(ordem);
    for (const iso of dias) for (const k of Object.keys(assign[iso])) for (const n of assign[iso][k]) if (!set.has(n)) { set.add(n); ordem.push(n); }
    return Array.from(new Set(ordem));
  }, [cad, dias, assign]);

  const porMilitar = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    const total: Record<string, number> = {};
    for (const nome of militares) { map[nome] = {}; total[nome] = 0; }
    for (const iso of dias) {
      for (const key of Object.keys(assign[iso])) {
        for (const n of assign[iso][key]) {
          if (!map[n]) { map[n] = {}; total[n] = 0; }
          if (!map[n][iso]) map[n][iso] = [];
          map[n][iso].push(ABBR_FUNC[key] || key);
          total[n]++;
        }
      }
    }
    return { map, total };
  }, [militares, dias, assign]);

  // Conflitos do mes: escalado em dia de afastamento.
  const conflitos = useMemo(() => {
    const lista: { nome: string; iso: string }[] = [];
    for (const iso of dias)
      for (const k of Object.keys(assign[iso]))
        for (const n of assign[iso][k])
          if (afastado(n, iso, cad.afastamentos)) lista.push({ nome: n, iso });
    return lista;
  }, [dias, assign, cad.afastamentos]);
  const nomesComConflito = useMemo(() => new Set(conflitos.map((c) => c.nome)), [conflitos]);

  // Lista exibida na visao Por militar (busca + filtro de conflitos).
  const militaresVisiveis = useMemo(() => {
    let lista = militares;
    if (soConflitos) lista = lista.filter((n) => nomesComConflito.has(n));
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((n) => nomeDe(n).toLowerCase().includes(q));
    return lista;
  }, [militares, soConflitos, nomesComConflito, busca, nomeDe]);

  const irParaDia = (iso: string) => { window.location.href = `/escalas?data=${iso}`; };
  const voltar = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/dashboard";
  };
  const mudaMes = (delta: number) => { const d = parseISO(`${mes}-01`); d.setMonth(d.getMonth() + delta); setMes(toISO(d).slice(0, 7)); };

  const clickConflitos = () => {
    if (conflitos.length === 0) return;
    setVista("militar");
    setSoConflitos((v) => !v);
  };
  const clickNome = (n: string) => setSelNome((s) => (s === n ? null : n));

  // Lista numerada dos militares de um pool (na ordem do rodizio).
  const listaPool = (ids: string[]) =>
    ids.length ? (
      <ol className="mp-eq-lista">{ids.map((id, i) => <li key={id + i}>{nomeDe(id)}</li>)}</ol>
    ) : (
      <div className="mp-eq-vazio">(vazio)</div>
    );

  return (
    <div className="mapa-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---- Cabecalho ---- */}
      <div className="mp-top no-print">
        <div className="mp-top-l">
          <button className="mp-btn back" onClick={voltar}>← Voltar</button>
          <div>
            <div className="mp-title">Mapa de Escala <span className="mp-tag">Guardião</span></div>
            <div className="mp-sub">Visão do mês inteiro, gerada automaticamente. Atualiza sozinho — não precisa salvar.</div>
          </div>
        </div>
        <div className="mp-controls">
          <div className="mp-nav">
            <button className="mp-btn" onClick={() => mudaMes(-1)} title="Mês anterior">‹</button>
            <span className="mp-mes">{MESNOME[m - 1]} / {ano}</span>
            <button className="mp-btn" onClick={() => mudaMes(1)} title="Próximo mês">›</button>
            <input className="mp-mesin" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div className="mp-toggle">
            <button className={vista === "servico" ? "on" : ""} onClick={() => setVista("servico")}>Por serviço</button>
            <button className={vista === "militar" ? "on" : ""} onClick={() => setVista("militar")}>Por militar</button>
          </div>
          <button className="mp-btn print" onClick={() => window.print()}>🖨 Imprimir</button>
          <a className="mp-btn" href="/escalas">Escala diária →</a>
        </div>
      </div>

      {/* ---- Painel de status: conflitos + busca + destaque ---- */}
      <div className="mp-status no-print">
        <button
          className={"mp-conf-chip" + (conflitos.length > 0 ? " tem" : " zero") + (soConflitos ? " on" : "")}
          onClick={clickConflitos}
          title={conflitos.length > 0
            ? "Clique para " + (soConflitos ? "mostrar todos" : "filtrar so quem tem conflito") + ". Conflitos: " + conflitos.map((c) => `${sobrenome(nomeDe(c.nome))} (${brCurto(c.iso)})`).join(", ")
            : "Nenhum militar escalado durante afastamento neste mês"}
        >
          {conflitos.length > 0
            ? `⚠ ${conflitos.length} conflito${conflitos.length > 1 ? "s" : ""} no mês${soConflitos ? " · filtrando" : " · clique para filtrar"}`
            : "✓ Sem conflitos no mês"}
        </button>

        {vista === "militar" && (
          <input
            className="mp-busca"
            value={busca}
            placeholder="Buscar militar..."
            onChange={(e) => setBusca(e.target.value)}
          />
        )}

        {selNome && (
          <button className="mp-sel-chip" onClick={() => setSelNome(null)} title="Clique para limpar o destaque">
            \u2605 Destacando: {sobrenome(nomeDe(selNome))} ({porMilitar.total[selNome] || 0} servicos) \u00b7 limpar \u00d7
          </button>
        )}
      </div>

      {/* ---- Ajuda / como ler ---- */}
      <div className="mp-ajuda no-print">
        <b>Como ler:</b> cada coluna é um dia do mês. Em <b>Por serviço</b> você vê quem cobre cada função
        (clique em um nome para destacar todos os dias dele); em <b>Por militar</b>, a carga de cada policial
        (coluna <b>Tot.</b>) e os conflitos.{" "}
        <b>Clique no número do dia</b> para abrir e editar a escala daquele dia — o que você salvar lá aparece aqui na hora.
      </div>

      <div className="mp-legenda no-print">
        <span><i className="lg af" /> afastado (FÉR/MIS/LP/JMS...)</span>
        <span><i className="lg conf" /> escalado durante afastamento (corrigir)</span>
        <span><i className="lg dobra" /> dois serviços no mesmo dia</span>
        <span><i className="lg hoje" /> hoje</span>
        <span><i className="lg fds" /> fim de semana</span>
        <span><i className="lg sel" /> militar destacado</span>
      </div>

      <div className="mp-print-titulo">
        Mapa de Escala — {MESNOME[m - 1]} / {ano} — {vista === "servico" ? "Por serviço" : "Por militar"} — 18º BPM
      </div>

      {/* ---- Tabela ---- */}
      <div className="mp-scroll">
        {vista === "servico" ? (
          <table className="mp-tab">
            <thead>
              <tr>
                <th className="mp-rot">Serviço</th>
                {dias.map((iso) => (
                  <th key={iso} className={`mp-dia${fimDeSemana(iso) ? " fds" : ""}${iso === hoje ? " hoje" : ""}`} onClick={() => irParaDia(iso)} title={`Abrir escala de ${iso}`}>
                    <div className="mp-dnum">{parseISO(iso).getDate()}</div>
                    <div className="mp-dsem">{DSEM[parseISO(iso).getDay()]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICOS.map((srv) => (
                <tr key={srv.key}>
                  <td className="mp-rot">{srv.label}</td>
                  {dias.map((iso) => {
                    const nomes = assign[iso][srv.key] || [];
                    return (
                      <td key={iso} className={`mp-cel${fimDeSemana(iso) ? " fds" : ""}${iso === hoje ? " hoje" : ""}`}>
                        {nomes.map((n, i) => {
                          const conf = afastado(n, iso, cad.afastamentos);
                          let cls = "mp-nome";
                          if (conf) cls += " conf";
                          if (selNome === n) cls += " sel";
                          return (
                            <div
                              key={i}
                              className={cls}
                              title={nomeDe(n) + (selNome === n ? "" : " \u00b7 clique para destacar no mes")}
                              onClick={(ev) => { ev.stopPropagation(); clickNome(n); }}
                            >
                              {sobrenome(nomeDe(n))}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="mp-tab">
            <thead>
              <tr>
                <th className="mp-rot">Militar</th>
                {dias.map((iso) => (
                  <th key={iso} className={`mp-dia${fimDeSemana(iso) ? " fds" : ""}${iso === hoje ? " hoje" : ""}`} onClick={() => irParaDia(iso)} title={`Abrir escala de ${iso}`}>
                    <div className="mp-dnum">{parseISO(iso).getDate()}</div>
                    <div className="mp-dsem">{DSEM[parseISO(iso).getDay()]}</div>
                  </th>
                ))}
                <th className="mp-tot">Tot.</th>
              </tr>
            </thead>
            <tbody>
              {militaresVisiveis.map((nome) => (
                <tr key={nome} className={selNome === nome ? "sel-row" : ""}>
                  <td
                    className={"mp-rot mp-mil" + (nomesComConflito.has(nome) ? " tem-conf" : "")}
                    title={nomeDe(nome) + " \u00b7 clique para destacar"}
                    onClick={() => clickNome(nome)}
                  >
                    {nomesComConflito.has(nome) && <span className="mp-mil-alerta" title="Tem conflito neste mes">\u26a0 </span>}
                    {nomeDe(nome)}
                  </td>
                  {dias.map((iso) => {
                    const funcs = porMilitar.map[nome]?.[iso] || [];
                    const af = afastamentoDe(nome, iso, cad.afastamentos);
                    const escalado = funcs.length > 0;
                    let cls = "mp-cel mil";
                    if (fimDeSemana(iso)) cls += " fds";
                    if (iso === hoje) cls += " hoje";
                    if (af && escalado) cls += " conf";
                    else if (af) cls += " afast";
                    else if (funcs.length > 1) cls += " dobra";
                    if (selNome === nome && escalado) cls += " sel";
                    const txt = af && !escalado ? ABBR_AF[af] : funcs.join("/");
                    return <td key={iso} className={cls} title={af ? `${ABBR_AF[af]}${escalado ? " + escalado!" : ""}` : funcs.join(" / ")}>{txt}</td>;
                  })}
                  <td className="mp-tot">{porMilitar.total[nome] || 0}</td>
                </tr>
              ))}
              {militaresVisiveis.length === 0 && (
                <tr>
                  <td className="mp-rot">-</td>
                  <td className="mp-cel" colSpan={dias.length + 1} style={{ textAlign: "left", padding: "8px 10px" }}>
                    Nenhum militar encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Composicao das equipes (tela + impressao) ---- */}
      <div className="mp-equipes">
        <div className="mp-equipes-tit">Composição das equipes</div>
        <div className="mp-equipes-sub no-print">
          Quem entra no rodízio de cada serviço (na ordem da fila) e as equipes da ROTEM.
        </div>
        <div className="mp-eq-grid">
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">CPU de dia (oficiais)</div>
            {listaPool(cad.cpu)}
          </div>

          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Força Tática</div>
            <div className="mp-eq-sub">Graduado</div>{listaPool(cad.ftGraduado)}
            <div className="mp-eq-sub">Motorista</div>{listaPool(cad.ftMotorista)}
            <div className="mp-eq-sub">Armeiro / Patrulheiro</div>{listaPool(cad.ftPatrulheiro)}
          </div>

          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Rádio Patrulha</div>
            <div className="mp-eq-sub">Adjunto de dia</div>{listaPool(cad.rpAdjunto)}
            <div className="mp-eq-sub">Motorista</div>{listaPool(cad.rpMotorista)}
            <div className="mp-eq-sub">Patrulheiro</div>{listaPool(cad.rpPatrulheiro)}
          </div>

          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Serviço de Inteligência</div>
            {listaPool(cad.inteligencia)}
          </div>

          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Guarda do Quartel</div>
            {listaPool(cad.guardaPermanente)}
          </div>

          <div className="mp-eq-grupo">
            <div className="mp-eq-h">ROTEM · equipes</div>
            {cad.rotemEquipes.length === 0 ? (
              <div className="mp-eq-vazio">(sem equipes)</div>
            ) : (
              cad.rotemEquipes.map((eq, i) => (
                <div key={i} className="mp-eq-rotem">
                  <div className="mp-eq-sub">{eq.nome} · {eq.turnos.join(" / ")}</div>
                  {listaPool(eq.militares)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mp-rodape no-print">
        Gerado pelo motor (24/72 + ROTEM por equipes). Dias já salvos na escala diária aparecem como estão; os demais vêm do rodízio automático.
      </div>
    </div>
  );
}

/* ===================== CSS ===================== */

const CSS = `
.mapa-shell{ color:#E8EEF6;
  font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }

.mp-top{ display:flex; flex-wrap:wrap; gap:14px; justify-content:space-between; align-items:center;
  background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:12px 14px; }
.mp-top-l{ display:flex; gap:12px; align-items:center; }
.mp-title{ font-weight:700; color:#D4AF37; font-size:17px; }
.mp-tag{ font-size:11px; background:#1b3a2a; color:#bff0d0; border:1px solid #2e6b48; border-radius:999px; padding:2px 8px; margin-left:6px; }
.mp-sub{ font-size:12px; color:#9fb0c7; margin-top:2px; }
.mp-controls{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.mp-nav{ display:flex; gap:6px; align-items:center; }
.mp-btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 12px; font-size:13px; cursor:pointer; text-decoration:none; display:inline-block; }
.mp-btn:hover{ border-color:#D4AF37; }
.mp-btn.back{ background:#22324f; font-weight:600; }
.mp-btn.print{ background:#1b3a2a; border-color:#2e6b48; color:#bff0d0; }
.mp-mes{ min-width:120px; text-align:center; font-weight:600; text-transform:capitalize; }
.mp-mesin{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:6px 8px; font-size:13px; }
.mp-toggle{ display:flex; border:1px solid #2b3f63; border-radius:8px; overflow:hidden; }
.mp-toggle button{ background:#0a1626; color:#9fb0c7; border:0; padding:8px 13px; font-size:13px; cursor:pointer; }
.mp-toggle button.on{ background:#D4AF37; color:#0a1020; font-weight:700; }

.mp-status{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 2px 0; }
.mp-conf-chip{ font-size:12.5px; border-radius:999px; padding:6px 14px; cursor:pointer; border:1px solid transparent; }
.mp-conf-chip.tem{ background:#3a1414; color:#ffb3b3; border-color:#7a1f1f; font-weight:700; }
.mp-conf-chip.tem:hover{ border-color:#e06464; }
.mp-conf-chip.tem.on{ background:#7a1f1f; color:#ffe1e1; }
.mp-conf-chip.zero{ background:#10301f; color:#9fe6bd; border-color:#235b3c; cursor:default; }
.mp-busca{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 11px; font-size:13px; min-width:220px; }
.mp-busca:focus{ outline:none; border-color:#D4AF37; }
.mp-sel-chip{ font-size:12.5px; background:#2a2410; color:#f3df9d; border:1px solid #D4AF37; border-radius:999px; padding:6px 14px; cursor:pointer; font-weight:600; }
.mp-sel-chip:hover{ background:#3a3215; }

.mp-ajuda{ margin:10px 2px 6px; font-size:12.5px; color:#cdd9ea; background:#0d1830; border:1px solid #1d2c44; border-left:3px solid #D4AF37; border-radius:8px; padding:9px 12px; line-height:1.5; }
.mp-ajuda b{ color:#E8EEF6; }
.mp-legenda{ display:flex; flex-wrap:wrap; gap:14px; align-items:center; font-size:12px; color:#9fb0c7; margin:8px 2px 10px; }
.mp-legenda i.lg{ display:inline-block; width:14px; height:14px; border-radius:3px; vertical-align:-2px; margin-right:5px; }
.lg.af{ background:#2a3550; } .lg.conf{ background:#7a1f1f; } .lg.dobra{ background:#7a5a17; }
.lg.hoje{ background:transparent; border:2px solid #D4AF37; } .lg.fds{ background:#13203a; border:1px solid #24365c; }
.lg.sel{ background:transparent; border:2px solid #f3df9d; }

.mp-scroll{ overflow:auto; border:1px solid #1d2c44; border-radius:10px; max-height:72vh; }
.mp-tab{ border-collapse:collapse; font-size:11px; }
.mp-tab th, .mp-tab td{ border:1px solid #18263d; }
.mp-rot{ position:sticky; left:0; z-index:2; background:#0F1B2D; text-align:left; padding:4px 8px; min-width:152px; max-width:152px; font-weight:600; }
.mp-mil{ font-weight:400; color:#cdd9ea; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.mp-mil:hover{ color:#D4AF37; }
.mp-mil.tem-conf{ color:#ffb3b3; }
.mp-mil-alerta{ font-size:10px; }
.mp-dia{ background:#0F1B2D; position:sticky; top:0; z-index:1; cursor:pointer; width:30px; min-width:30px; padding:2px; text-align:center; }
.mp-dia:hover .mp-dnum{ color:#D4AF37; }
.mp-dia.fds{ background:#13203a; }
.mp-dia.hoje{ background:#3a3215; box-shadow:inset 0 -2px 0 #D4AF37; }
.mp-dia.hoje .mp-dnum{ color:#D4AF37; }
.mp-dnum{ font-weight:700; } .mp-dsem{ font-size:9px; color:#6f82a0; }
.mp-tot{ position:sticky; right:0; background:#0F1B2D; font-weight:700; text-align:center; width:36px; z-index:1; }

.mp-cel{ background:#0a1424; vertical-align:top; padding:2px 3px; text-align:center; min-width:30px; }
.mp-cel.fds{ background:#0d1830; }
.mp-cel.hoje{ background:#1d1a0a; }
.mp-nome{ white-space:nowrap; cursor:pointer; border-radius:3px; padding:0 2px; }
.mp-nome:hover{ background:#1a2a45; }
.mp-nome.conf{ background:#7a1f1f; color:#ffd9d9; }
.mp-nome.sel{ background:#3a3215; color:#f3df9d; box-shadow:0 0 0 1px #D4AF37; font-weight:700; }
.mp-cel.mil{ font-weight:700; color:#9fd9ff; }
.mp-cel.mil.afast{ background:#2a3550; color:#9fb0c7; font-weight:400; }
.mp-cel.mil.conf{ background:#7a1f1f; color:#ffd9d9; }
.mp-cel.mil.dobra{ background:#7a5a17; color:#ffeaa8; }
.mp-cel.mil.sel{ box-shadow:inset 0 0 0 1px #D4AF37; background:#3a3215; color:#f3df9d; }
.sel-row .mp-rot{ color:#f3df9d; box-shadow:inset 3px 0 0 #D4AF37; }

.mp-rodape{ margin-top:10px; font-size:12px; color:#6f82a0; }

/* Composicao das equipes */
.mp-equipes{ margin-top:14px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.mp-equipes-tit{ color:#D4AF37; font-weight:700; font-size:15px; }
.mp-equipes-sub{ font-size:12px; color:#9fb0c7; margin:3px 0 12px; }
.mp-eq-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; }
.mp-eq-grupo{ background:#0d1830; border:1px solid #1d2c44; border-radius:10px; padding:10px 12px; }
.mp-eq-h{ font-size:12.5px; font-weight:700; color:#D4AF37; margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid #1d2c44; }
.mp-eq-sub{ font-size:10.5px; font-weight:700; color:#9fd9ff; margin:7px 0 2px; text-transform:uppercase; letter-spacing:.3px; }
.mp-eq-lista{ margin:0; padding-left:20px; font-size:12px; color:#cdd9ea; }
.mp-eq-lista li{ margin:1px 0; }
.mp-eq-vazio{ font-size:11.5px; color:#6f82a0; font-style:italic; padding:1px 0; }
.mp-eq-rotem{ margin-bottom:4px; }

.mp-print-titulo{ display:none; }

@media print{
  @page{ size:A4 landscape; margin:6mm; }
  body{ background:#fff !important; }
  body *{ visibility:hidden !important; }
  .mapa-shell, .mapa-shell *{ visibility:visible !important; }
  .no-print{ display:none !important; }
  .mp-print-titulo{ display:block !important; text-align:center; font-weight:700; font-size:12px; color:#000 !important; margin-bottom:6px; }
  .mp-scroll{ overflow:visible !important; max-height:none !important; border:none !important; }
  .mp-tab{ font-size:8px; }
  .mp-tab th, .mp-tab td{ border:1px solid #999 !important; }
  .mp-rot, .mp-dia, .mp-tot{ position:static !important; background:#eee !important; color:#000 !important; }
  .mp-dia.hoje{ background:#fff2c2 !important; box-shadow:none !important; }
  .mp-dnum, .mp-dia.hoje .mp-dnum{ color:#000 !important; }
  .mp-cel, .mp-cel.mil{ background:#fff !important; color:#000 !important; box-shadow:none !important; }
  .mp-cel.fds, .mp-dia.fds{ background:#f2f2f2 !important; }
  .mp-cel.mil.afast{ background:#ececec !important; color:#000 !important; }
  .mp-cel.mil.conf, .mp-nome.conf{ background:#f4c6c6 !important; color:#000 !important; }
  .mp-cel.mil.dobra{ background:#f3e3a6 !important; color:#000 !important; }
  .mp-nome.sel{ background:#fff !important; color:#000 !important; box-shadow:none !important; font-weight:400 !important; }
  .sel-row .mp-rot{ box-shadow:none !important; }
  /* Composicao das equipes na impressao */
  .mp-equipes{ background:#fff !important; border:none !important; margin-top:12px; padding:0 !important; break-before:page; }
  .mp-equipes *{ color:#000 !important; }
  .mp-equipes-tit{ font-size:12px; margin-bottom:6px; }
  .mp-eq-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
  .mp-eq-grupo{ background:#fff !important; border:1px solid #999 !important; break-inside:avoid; }
  .mp-eq-h{ color:#000 !important; border-bottom:1px solid #999 !important; }
  .mp-eq-lista{ font-size:9px; }
}
`;
