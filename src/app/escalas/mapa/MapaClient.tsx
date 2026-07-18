"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ORGANOGRAMA, acharNo, pertenceAoNo, type NoOrg } from "@/lib/organograma";

/* Lugares selecionáveis (DPM/CIA/Pelotão/seções) para o botão "mudar de
   lotação" no quadro de equipes. Achatado do organograma (sem a raiz). */
function flattenLugares(no: NoOrg, acc: { id: string; rotulo: string; cidade?: string }[]): void {
  if (no.id !== "18bpm") acc.push({ id: no.id, rotulo: no.rotulo, cidade: (no as any).cidade });
  for (const f of no.filhos ?? []) flattenLugares(f, acc);
}
const LUGARES: { id: string; rotulo: string; cidade?: string }[] = (() => {
  const a: { id: string; rotulo: string; cidade?: string }[] = [];
  flattenLugares(ORGANOGRAMA, a);
  return a;
})();

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
type EquipeRotem = { nome: string; turnos: string[]; militares: string[]; diasSemana?: number[] };
type Cadastro = {
  cpu: string[]; ftGraduado: string[]; ftMotorista: string[]; ftPatrulheiro: string[];
  rpAdjunto: string[]; rpMotorista: string[]; rpPatrulheiro: string[];
  guardaPermanente: string[]; inteligencia: string[];
  rotemEquipes: EquipeRotem[]; afastamentos: Afastamento[];
  refRodizioISO: string; refCpuISO: string; refRotemISO: string;
  // Quadro por equipe A/B/C/D: quadroEquipes[letra][funcaoKey] = ID do militar.
  quadroEquipes?: Record<string, Record<string, string>>;
  // Linhas extras por funcao no quadro (ex.: um 2o patrulheiro). linhasExtras[funcaoKey] = qtde extra.
  // As vagas extras usam chave sintetica "<funcaoKey>#2", "#3"...
  linhasExtras?: Record<string, number>;
  // Excecao do CPU por dia (editado direto na linha do mapa). cpuOverrides[iso]
  // = ID do militar ou "__FOLGA__" (folga). Ausente = automatico (rodizio).
  cpuOverrides?: Record<string, string>;
  padraoEscala?: string;   // como a escala desta unidade funciona (ex.: "3 por 6")
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
  linhasExtras: {},
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
  const comDias = equipes.filter((e) => e.diasSemana && e.diasSemana.length);
  if (comDias.length) {
    const dow = parseISO(data).getDay();
    return comDias.find((e) => e.diasSemana!.includes(dow)) || null;
  }
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
  // O quadro A/B/C/D e a FONTE: a equipe do dia (ciclo 24/72) cobre cada funcao.
  const team = EQUIPES_ABCD[(((diasEntre(r, iso) % 4) + 4) % 4)];
  const q = cad.quadroEquipes || {};
  // Coleta o titular da funcao + eventuais linhas extras (ex.: 2o patrulheiro).
  const nExtra = (fk: string) => cad.linhasExtras?.[fk] || 0;
  const dq = (fk: string) => {
    const ids: string[] = [];
    const b = q[team]?.[fk] || ""; if (b) ids.push(b);
    for (let k = 2; k <= nExtra(fk) + 1; k++) { const id = q[team]?.[`${fk}#${k}`] || ""; if (id) ids.push(id); }
    return ids;
  };
  return {
    cpu: rodizio(cad.cpu, 1, iso, a, cad.refCpuISO), // CPU nao entra no 24/72 por equipe
    ftGraduado: dq("ftGraduado"),
    ftMotorista: dq("ftMotorista"),
    ftPatrulheiro: dq("ftPatrulheiro"),
    rpAdjunto: dq("rpAdjunto"),
    rpMotorista: dq("rpMotorista"),
    rpPatrulheiro: dq("rpPatrulheiro"),
    guardaPermanente: dq("guardaPermanente"),
    inteligencia: dq("inteligencia"),
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
const TIPOS_AF: { v: TipoAfastamento; t: string }[] = [
  { v: "missao", t: "Missão" },
  { v: "rotam", t: "ROTAM" },
  { v: "ferias", t: "Férias" },
  { v: "curso", t: "Curso" },
  { v: "licenca_premio", t: "Licença Prêmio" },
  { v: "licenca_paternidade", t: "Licença Paternidade" },
  { v: "jms", t: "JMS" },
  { v: "outro", t: "Outro" },
];

/* ===== PALETA (tokens): uma cor por servico e por situacao ===== */
const COR_SERVICO: Record<string, string> = {
  cpu: "#fb923c",           // CPU de dia — laranja
  ftGraduado: "#ef4444", ftMotorista: "#ef4444", ftPatrulheiro: "#ef4444", // Forca Tatica — vermelho
  rpAdjunto: "#3b82f6", rpMotorista: "#3b82f6", rpPatrulheiro: "#3b82f6",   // Radio Patrulha — azul
  guardaPermanente: "#94a3b8", // Permanencia — cinza-azulado
  inteligencia: "#a855f7",     // Inteligencia — roxo
  rotem: "#f59e0b",            // ROTEM — ambar
};
// mesma paleta pelas siglas de funcao (visao Por militar)
const COR_ABBR: Record<string, string> = {
  CPU: "#fb923c", "FT-G": "#ef4444", "FT-M": "#ef4444", "FT-P": "#ef4444",
  "RP-A": "#3b82f6", "RP-M": "#3b82f6", "RP-P": "#3b82f6",
  GD: "#94a3b8", INT: "#a855f7", ROT: "#f59e0b",
};
const COR_AF: Record<TipoAfastamento, string> = {
  ferias: "#14b8a6", licenca_premio: "#334155", licenca_paternidade: "#334155",
  jms: "#ec4899", curso: "#6366f1", missao: "#b45309", rotam: "#b45309", outro: "#64748b",
};
// Grupos por serviço (telas dedicadas da Fase 3). funcoes = linhas do quadro A/B/C/D.
const SERVICO_GRUPOS: Record<string, {
  titulo: string; cor: string; servicos: string[]; funcoes: string[]; card: string;
}> = {
  rp:           { titulo: "Rádio Patrulha", cor: "#3b82f6", servicos: ["rpAdjunto", "rpMotorista", "rpPatrulheiro"], funcoes: ["rpAdjunto", "rpMotorista", "rpPatrulheiro"], card: "rp" },
  ft:           { titulo: "Força Tática", cor: "#ef4444", servicos: ["ftGraduado", "ftMotorista", "ftPatrulheiro"], funcoes: ["ftGraduado", "ftMotorista", "ftPatrulheiro"], card: "ft" },
  inteligencia: { titulo: "Serviço de Inteligência", cor: "#a855f7", servicos: ["inteligencia"], funcoes: ["inteligencia"], card: "inteligencia" },
  permanencia:  { titulo: "Permanência", cor: "#94a3b8", servicos: ["guardaPermanente"], funcoes: ["guardaPermanente"], card: "permanencia" },
  rotem:        { titulo: "ROTEM", cor: "#f59e0b", servicos: ["rotem"], funcoes: [], card: "rotem" },
  cpu:          { titulo: "CPU de dia", cor: "#fb923c", servicos: ["cpu"], funcoes: [], card: "cpu" },
};

// legenda de cores exibida no topo
const LEGENDA_CORES: { cor: string; nome: string }[] = [
  { cor: "#3b82f6", nome: "Rádio Patrulha" },
  { cor: "#ef4444", nome: "Força Tática" },
  { cor: "#f59e0b", nome: "ROTEM" },
  { cor: "#a855f7", nome: "Inteligência" },
  { cor: "#94a3b8", nome: "Permanência" },
  { cor: "#fb923c", nome: "CPU" },
  { cor: "#14b8a6", nome: "Férias" },
  { cor: "#6366f1", nome: "Curso" },
  { cor: "#334155", nome: "Licença" },
];
const DSEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESNOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function sobrenome(n: string): string {
  const t = n.trim().split(/\s+/);
  return t[t.length - 1] || n;
}
function fimDeSemana(iso: string) { const g = parseISO(iso).getDay(); return g === 0 || g === 6; }
function brCurto(iso: string) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
const somaDias = (iso: string, n: number) => toISO(new Date(parseISO(iso).getTime() + n * DAY));

// Funcoes do quadro por equipe (A/B/C/D). CPU fica de fora (escala diferente).
const FUNCOES_EQUIPE: { key: string; label: string }[] = [
  { key: "ftGraduado", label: "FT · Graduado" },
  { key: "ftMotorista", label: "FT · Motorista" },
  { key: "ftPatrulheiro", label: "FT · Armeiro/Patrulheiro" },
  { key: "rpAdjunto", label: "RP · Adjunto" },
  { key: "rpMotorista", label: "RP · Motorista" },
  { key: "rpPatrulheiro", label: "RP · Patrulheiro" },
  { key: "guardaPermanente", label: "Guarda · Permanente" },
  { key: "inteligencia", label: "Inteligência" },
];
const EQUIPES_ABCD = ["A", "B", "C", "D"];

/* Editor compacto de um pool no painel de equipes: lista numerada (ordem do
   rodizio) com subir/descer/remover e uma busca para adicionar. Controles
   somem na impressao. */
function PoolMini({
  ids, onChange, efetivo, nomeDe, permiteFolga,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  efetivo: Militar[];
  nomeDe: (t: string) => string;
  permiteFolga?: boolean;
}) {
  const [q, setQ] = useState("");
  const [abrir, setAbrir] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    const a = ids.slice(); [a[i], a[j]] = [a[j], a[i]]; onChange(a);
  };
  const soltar = (destino: number) => {
    if (dragIdx === null || dragIdx === destino) { setDragIdx(null); return; }
    const a = ids.slice(); const [item] = a.splice(dragIdx, 1); a.splice(destino, 0, item);
    onChange(a); setDragIdx(null);
  };
  const rm = (i: number) => onChange(ids.filter((_, j) => j !== i));
  const add = (id: string) => { if (!id || ids.includes(id)) return; onChange([...ids, id]); setQ(""); setAbrir(false); };
  const addFolga = () => onChange([...ids, `__FOLGA__${Date.now()}`]);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    const ex = new Set(ids);
    return efetivo.filter((m) => !ex.has(m.id))
      .filter((m) => (fmtMilitar(m) + " " + (m.matricula || "")).toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, efetivo, ids]);

  return (
    <div className="mp-pool">
      {ids.length === 0 && <div className="mp-eq-vazio">(vazio)</div>}
      {ids.length > 0 && (
        <ol className="mp-pool-lista">
          {ids.map((id, i) => (
            <li key={id + i}
              className={"mp-pool-li" + (dragIdx === i ? " arrastando" : "") + (id.startsWith("__FOLGA") ? " folga" : "")}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(i)}
              onDragEnd={() => setDragIdx(null)}
              title="Arraste para reordenar (a ordem = rodízio)"
            >
              <span className="mp-pool-top">
                <span className="mp-pool-grip no-print">⋮⋮</span>
                <span className="mp-pool-ord no-print">{i + 1}º</span>
                <span className="mp-pool-nome">{nomeDe(id)}</span>
              </span>
              <span className="mp-pool-btns no-print">
                <button disabled={i === 0} title="mover para a esquerda" onClick={() => move(i, -1)}>‹</button>
                <button disabled={i === ids.length - 1} title="mover para a direita" onClick={() => move(i, 1)}>›</button>
                <button className="del" title="remover" onClick={() => rm(i)}>×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="mp-pool-add no-print">
        {abrir ? (
          <div className="mp-pool-search">
            <input
              autoFocus value={q} placeholder="buscar militar..."
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setTimeout(() => setAbrir(false), 160)}
            />
            {q.trim() !== "" && (
              <div className="mp-pool-res">
                {res.length === 0
                  ? <div className="mp-pool-vazio">nenhum encontrado</div>
                  : res.map((m) => (
                      <button key={m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m.id)}>
                        {fmtMilitar(m)}
                      </button>
                    ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mp-pool-acoes">
            <button className="mp-pool-mais" onClick={() => setAbrir(true)}>+ adicionar</button>
            {permiteFolga && (
              <button className="mp-pool-mais folga" title="Insere uma folga na sequência (dia de descanso do CPU)" onClick={addFolga}>+ folga</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Registrador compacto de afastamentos (busca militar, tipo, saida/retorno).
   Escreve em cad.afastamentos — o mesmo do motor, valido em todas as telas. */
function AfastamentosMini({
  cad, setCad, efetivo, nomeDe,
}: {
  cad: Cadastro;
  setCad: (updater: (c: Cadastro) => Cadastro) => void;
  efetivo: Militar[];
  nomeDe: (t: string) => string;
}) {
  const [q, setQ] = useState("");
  const list = cad.afastamentos || [];
  const jaTem = new Set(list.map((a) => a.militar));
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    return efetivo.filter((m) => !jaTem.has(m.id))
      .filter((m) => (fmtMilitar(m) + " " + (m.matricula || "")).toLowerCase().includes(t)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, efetivo, cad.afastamentos]);
  const add = (id: string) => { setCad((c) => ({ ...c, afastamentos: [...c.afastamentos, { militar: id, tipo: "ferias", inicio: "", fim: "" }] })); setQ(""); };
  const upd = (i: number, patch: Partial<Afastamento>) => setCad((c) => ({ ...c, afastamentos: c.afastamentos.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const rm = (i: number) => setCad((c) => ({ ...c, afastamentos: c.afastamentos.filter((_, j) => j !== i) }));

  return (
    <div className="mp-afm no-print">
      <div className="mp-afm-search">
        <input value={q} placeholder="Buscar militar para registrar afastamento..." onChange={(e) => setQ(e.target.value)} />
        {q.trim() !== "" && (
          <div className="mp-afm-res">
            {res.length === 0 ? <div className="mp-afm-vazio">nenhum (ou já registrado)</div>
              : res.map((m) => <button key={m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m.id)}>{fmtMilitar(m)}</button>)}
          </div>
        )}
      </div>
      {list.length > 0 && (
        <div className="mp-afm-list">
          {list.map((a, i) => (
            <div key={i} className="mp-afm-linha">
              <span className="mp-afm-nome">{nomeDe(a.militar)}</span>
              <select value={a.tipo} onChange={(e) => upd(i, { tipo: e.target.value as TipoAfastamento })}>
                {TIPOS_AF.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
              </select>
              <input type="date" value={a.inicio} onChange={(e) => upd(i, { inicio: e.target.value })} />
              <input type="date" value={a.fim} onChange={(e) => upd(i, { fim: e.target.value })} />
              <button className="mp-afm-del" title="remover" onClick={() => rm(i)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Quadro interativo de escala por equipes A/B/C/D. Cada celula = 1 militar
   (funcao x equipe). Arrasta para mover entre celulas/colunas; adiciona por
   busca; registra afastamento (motivo + datas) que vai para cad.afastamentos
   (o mesmo do motor). Tudo salvo no servidor via cad. */
function QuadroEquipes({
  cad, setCad, efetivo, nomeDe, teamDias, funcoes = FUNCOES_EQUIPE,
}: {
  cad: Cadastro;
  setCad: (updater: (c: Cadastro) => Cadastro) => void;
  efetivo: Militar[];
  nomeDe: (t: string) => string;
  teamDias: string[];
  funcoes?: { key: string; label: string }[];
}) {
  const quadro = cad.quadroEquipes || {};
  const cell = (team: string, fk: string) => quadro[team]?.[fk] || "";

  const [drag, setDrag] = useState<{ team: string; fk: string } | null>(null);
  const [addCell, setAddCell] = useState<{ team: string; fk: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [afCell, setAfCell] = useState<{ team: string; fk: string; id: string } | null>(null);
  const [afTipo, setAfTipo] = useState<TipoAfastamento>("missao");
  const [afIni, setAfIni] = useState("");
  const [afFim, setAfFim] = useState("");
  // "mudar de quadro": mover o militar para outra função ou outra lotação
  const [movCell, setMovCell] = useState<{ team: string; fk: string; id: string } | null>(null);
  const [movBusca, setMovBusca] = useState("");
  const [movMsg, setMovMsg] = useState("");

  const slotLivre = (team: string, baseKey: string): string => {
    const n = cad.linhasExtras?.[baseKey] || 0;
    const keys = [baseKey];
    for (let k = 2; k <= n + 1; k++) keys.push(`${baseKey}#${k}`);
    for (const k of keys) if (!(quadro[team]?.[k])) return k;
    return baseKey; // todas ocupadas -> sobrescreve a base
  };
  const moverFuncao = (team: string, fromFk: string, id: string, toBase: string) => {
    const toKey = slotLivre(team, toBase);
    setCad((c) => {
      const q: Record<string, Record<string, string>> = { ...(c.quadroEquipes || {}) };
      q[team] = { ...(q[team] || {}), [toKey]: id, [fromFk]: "" };
      return { ...c, quadroEquipes: q };
    });
    setMovCell(null);
  };
  const mudarLotacao = async (team: string, fk: string, id: string, lugar: { rotulo: string }) => {
    setMovMsg("Atualizando lotação…");
    try {
      const r = await fetch(`/api/efetivo/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotacao: lugar.rotulo }),
      });
      if (!r.ok) { setMovMsg("Falha ao alterar a lotação."); return; }
      // sai do quadro da sede (agora é de outro lugar)
      setCad((c) => {
        const q: Record<string, Record<string, string>> = { ...(c.quadroEquipes || {}) };
        q[team] = { ...(q[team] || {}), [fk]: "" };
        return { ...c, quadroEquipes: q };
      });
      setMovMsg(`Lotação alterada para ${lugar.rotulo}.`);
      setTimeout(() => { setMovCell(null); setMovMsg(""); setMovBusca(""); }, 1400);
    } catch { setMovMsg("Falha ao alterar a lotação."); }
  };

  const setCell = (team: string, fk: string, id: string) =>
    setCad((c) => {
      const q: Record<string, Record<string, string>> = { ...(c.quadroEquipes || {}) };
      q[team] = { ...(q[team] || {}), [fk]: id };
      return { ...c, quadroEquipes: q };
    });

  const soltar = (team: string, fk: string) => {
    if (!drag || (drag.team === team && drag.fk === fk)) { setDrag(null); return; }
    setCad((c) => {
      const q: Record<string, Record<string, string>> = { ...(c.quadroEquipes || {}) };
      const g = (t: string, f: string) => q[t]?.[f] || "";
      const origem = g(drag.team, drag.fk);
      const destino = g(team, fk);
      q[team] = { ...(q[team] || {}), [fk]: origem };
      q[drag.team] = { ...(q[drag.team] || {}), [drag.fk]: destino };
      return { ...c, quadroEquipes: q };
    });
    setDrag(null);
  };

  // Linhas do quadro = funcoes base + linhas extras (chave sintetica "<key>#2"...).
  const rows = useMemo(() => {
    const out: { key: string; label: string; baseKey: string; extra: number }[] = [];
    for (const f of funcoes) {
      out.push({ key: f.key, label: f.label, baseKey: f.key, extra: 0 });
      const n = cad.linhasExtras?.[f.key] || 0;
      for (let k = 2; k <= n + 1; k++) out.push({ key: `${f.key}#${k}`, label: `${f.label} ${k}`, baseKey: f.key, extra: k });
    }
    return out;
  }, [funcoes, cad.linhasExtras]);

  const addLinha = (baseKey: string) =>
    setCad((c) => ({ ...c, linhasExtras: { ...(c.linhasExtras || {}), [baseKey]: (c.linhasExtras?.[baseKey] || 0) + 1 } }));
  const removeLinha = (baseKey: string) =>
    setCad((c) => {
      const n = c.linhasExtras?.[baseKey] || 0;
      if (n <= 0) return c;
      const rowKey = `${baseKey}#${n + 1}`; // remove sempre a ultima linha extra e limpa suas celulas
      const q: Record<string, Record<string, string>> = { ...(c.quadroEquipes || {}) };
      for (const t of EQUIPES_ABCD) if (q[t] && q[t][rowKey] !== undefined) { const nt = { ...q[t] }; delete nt[rowKey]; q[t] = nt; }
      return { ...c, quadroEquipes: q, linhasExtras: { ...(c.linhasExtras || {}), [baseKey]: n - 1 } };
    });

  const jaNoQuadro = useMemo(() => {
    const s = new Set<string>();
    for (const t of EQUIPES_ABCD) for (const f of rows) { const id = quadro[t]?.[f.key]; if (id) s.add(id); }
    return s;
  }, [quadro, rows]);
  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase(); if (!t) return [];
    return efetivo.filter((m) => !jaNoQuadro.has(m.id))
      .filter((m) => (fmtMilitar(m) + " " + (m.matricula || "")).toLowerCase().includes(t)).slice(0, 6);
  }, [busca, efetivo, jaNoQuadro]);

  const salvarAf = () => {
    if (!afCell || !afIni || !afFim) return;
    const alvo = afCell;
    setCad((c) => ({
      ...c,
      afastamentos: [
        ...c.afastamentos.filter((a) => !(a.militar === alvo.id && a.inicio === afIni)),
        { militar: alvo.id, tipo: afTipo, inicio: afIni, fim: afFim },
      ],
    }));
    setAfCell(null); setAfIni(""); setAfFim(""); setAfTipo("missao");
  };

  return (
    <div className="mp-quadro-scroll">
      <table className="mp-quadro-tab">
        <thead>
          <tr>
            <th className="mp-q-func">Função</th>
            {EQUIPES_ABCD.map((lt, i) => (
              <th key={lt} className="mp-q-eq">
                <div className="mp-q-dia">{brCurto(teamDias[i])} <span>{DSEM[parseISO(teamDias[i]).getDay()]}</span></div>
                <div className="mp-q-letra">{lt}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const nEx = cad.linhasExtras?.[f.baseKey] || 0;
            const isLast = f.extra === 0 ? nEx === 0 : f.extra === nEx + 1;
            const btnSt = { marginLeft: 6, border: "none", borderRadius: 6, width: 18, height: 18, lineHeight: 1, cursor: "pointer", fontSize: 13, verticalAlign: "middle" } as const;
            return (
            <tr key={f.key}>
              <td className="mp-q-func">
                {f.label}
                {isLast && (
                  <button className="no-print" title="Adicionar outra linha desta função"
                    style={{ ...btnSt, background: "#12351f", color: "#9fe6bd" }}
                    onClick={() => addLinha(f.baseKey)}>＋</button>
                )}
                {f.extra !== 0 && isLast && (
                  <button className="no-print" title="Remover esta linha"
                    style={{ ...btnSt, background: "#3a1d24", color: "#f0a0a0" }}
                    onClick={() => removeLinha(f.baseKey)}>－</button>
                )}
              </td>
              {EQUIPES_ABCD.map((lt, i) => {
                const id = cell(lt, f.key);
                const af = id ? afastado(id, teamDias[i], cad.afastamentos) : false;
                const cor = COR_SERVICO[f.baseKey];
                return (
                  <td
                    key={lt}
                    className={"mp-q-cel" + (drag ? " alvo" : "")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => soltar(lt, f.key)}
                  >
                    {id ? (
                      <div
                        className={"mp-q-chip" + (af ? " af" : "")}
                        style={af ? undefined : (cor ? { background: cor, borderColor: cor } : undefined)}
                        draggable
                        onDragStart={() => setDrag({ team: lt, fk: f.key })}
                        onDragEnd={() => setDrag(null)}
                        title={nomeDe(id) + (af ? " · afastado neste dia" : "") + " · arraste para mover"}
                      >
                        <span className="mp-q-nome" style={af ? undefined : { color: "#0a1020" }}>{sobrenome(nomeDe(id))}</span>
                        <span className="mp-q-acoes no-print">
                          <button title="Afastamento" onClick={() => { setAfCell({ team: lt, fk: f.key, id }); setBusca(""); setAddCell(null); setMovCell(null); }}>📅</button>
                          <button title="Mudar de quadro / lotação" onClick={() => { setMovCell({ team: lt, fk: f.key, id }); setMovBusca(""); setMovMsg(""); setAfCell(null); setAddCell(null); }}>⇄</button>
                          <button className="del" title="Remover" onClick={() => setCell(lt, f.key, "")}>×</button>
                        </span>
                      </div>
                    ) : addCell && addCell.team === lt && addCell.fk === f.key ? (
                      <div className="mp-q-busca no-print">
                        <input autoFocus value={busca} placeholder="buscar..." onChange={(e) => setBusca(e.target.value)} onBlur={() => setTimeout(() => setAddCell(null), 180)} />
                        {busca.trim() !== "" && (
                          <div className="mp-q-res">
                            {resultados.length === 0 ? <div className="mp-q-vazio">nenhum</div> :
                              resultados.map((m) => (
                                <button key={m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setCell(lt, f.key, m.id); setBusca(""); setAddCell(null); }}>
                                  {fmtMilitar(m)}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button className="mp-q-add no-print" onClick={() => { setAddCell({ team: lt, fk: f.key }); setBusca(""); }}>+ adicionar</button>
                    )}

                    {afCell && afCell.team === lt && afCell.fk === f.key && (
                      <div className="mp-q-afform no-print">
                        <select value={afTipo} onChange={(e) => setAfTipo(e.target.value as TipoAfastamento)}>
                          {TIPOS_AF.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                        </select>
                        <label>Saída<input type="date" value={afIni} onChange={(e) => setAfIni(e.target.value)} /></label>
                        <label>Retorno<input type="date" value={afFim} onChange={(e) => setAfFim(e.target.value)} /></label>
                        <div className="mp-q-afbtns">
                          <button className="ok" onClick={salvarAf}>Salvar</button>
                          <button onClick={() => setAfCell(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}

                    {movCell && movCell.team === lt && movCell.fk === f.key && (
                      <div className="mp-q-afform no-print" style={{ minWidth: 230 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Mudar {sobrenome(nomeDe(id))}</div>
                        <div style={{ fontSize: 11, color: "#9fb0c7", margin: "2px 0" }}>Para outra função (quadro):</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {FUNCOES_EQUIPE.filter((ff) => ff.key !== f.baseKey).map((ff) => (
                            <button key={ff.key} onClick={() => moverFuncao(lt, f.key, id, ff.key)}>{ff.label}</button>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: "#9fb0c7", margin: "6px 0 2px" }}>Ou mudar de lotação (DPM/CIA/Pel.):</div>
                        <input value={movBusca} placeholder="buscar lugar…" onChange={(e) => setMovBusca(e.target.value)} />
                        {movBusca.trim() !== "" && (
                          <div className="mp-q-res">
                            {LUGARES.filter((l) => (l.rotulo + " " + (l.cidade || "")).toLowerCase().includes(movBusca.trim().toLowerCase())).slice(0, 6).map((l) => (
                              <button key={l.id} onMouseDown={(e) => e.preventDefault()} onClick={() => mudarLotacao(lt, f.key, id, l)}>
                                {l.rotulo}{l.cidade ? ` — ${l.cidade}` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                        {movMsg && <div style={{ fontSize: 11, color: "#9fe6bd", marginTop: 4 }}>{movMsg}</div>}
                        <div className="mp-q-afbtns"><button onClick={() => { setMovCell(null); setMovMsg(""); }}>Fechar</button></div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mp-quadro-hint no-print">
        Arraste um nome para outra célula (muda de função) ou outra coluna (muda de equipe). Afastamentos aqui valem no motor e em todos os PCs.
      </div>
    </div>
  );
}

/* ===================== PAGINA ===================== */

export default function MapaClient({ servico, escopo }: { servico?: string; escopo?: string } = {}) {
  const grupo = servico ? SERVICO_GRUPOS[servico] : null;
  // Escala por lugar: sufixo de escopo nas APIs; sem escopo = sede (global).
  const qs = escopo ? `?escopo=${encodeURIComponent(escopo)}` : "";
  const noEscopo = escopo ? acharNo(escopo) : null; // unidade do organograma
  const [cad, setCad] = useState<Cadastro>(SEED_CADASTRO);
  const [escalas, setEscalas] = useState<Record<string, any>>({});
  // Abre no mes da ULTIMA data mexida na escala diaria (salva no localStorage);
  // se nao houver, usa o mes atual. Antes ficava fixo em junho/2026.
  const [mes, setMes] = useState(() => {
    if (typeof window !== "undefined") {
      const d = localStorage.getItem("sigep_escala_ultima_data");
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
    }
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [vista, setVista] = useState<"servico" | "militar">("servico");
  const [hoje, setHoje] = useState("");
  const [busca, setBusca] = useState("");
  const [soConflitos, setSoConflitos] = useState(false);
  const [selNome, setSelNome] = useState<string | null>(null);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  // Aviso pro escalante: quem da SEDE entra de ferias/LP faltando ate 5 dias.
  const [proxAusencias, setProxAusencias] = useState<{ nome: string; lotacao: string; tipo: string; inicio: string; dias: number }[]>([]);
  const [avisoDispensado, setAvisoDispensado] = useState(false);
  // Edicao do CPU direto na linha (excecao por dia).
  const [editCpu, setEditCpu] = useState<string | null>(null);
  const [buscaCpu, setBuscaCpu] = useState("");
  const setCpuOverride = (iso: string, val: string | null) => setCad((c) => {
    const o = { ...(c.cpuOverrides || {}) };
    if (val === null) delete o[iso]; else o[iso] = val;
    return { ...c, cpuOverrides: o };
  });
  useEffect(() => {
    fetch("/api/escala/proximas-ausencias?dias=5")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.ausencias)) setProxAusencias(d.ausencias); })
      .catch(() => {});
    // "nao lembrar ate a proxima equipe": dispensa vale so para o dia de hoje
    // (amanha e outra equipe no ciclo 24/72, entao o aviso volta).
    try {
      const hojeISO = toISO(new Date());
      if (localStorage.getItem("sigep_aviso_ausencias") === hojeISO) setAvisoDispensado(true);
    } catch {}
  }, []);
  const dispensarAviso = () => {
    try { localStorage.setItem("sigep_aviso_ausencias", toISO(new Date())); } catch {}
    setAvisoDispensado(true);
  };

  const cadSaveTimer = useRef<any>(null);
  const ultimoCadSalvo = useRef<string>(JSON.stringify(SEED_CADASTRO));
  const cadRef = useRef(cad); cadRef.current = cad;

  // Atualizacao ao vivo: puxa do servidor a cada 15s e ao focar a aba, pra que
  // mudancas de outro PC aparecam sem F5. Nao sobrescreve edicao local pendente:
  // so aplica o cad do servidor quando o local ja esta salvo (limpo).
  useEffect(() => {
    const puxar = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/escala-dias${qs}`);
        if (r.ok) { const d = await r.json(); if (d && d.escalas && Object.keys(d.escalas).length > 0) setEscalas(d.escalas); }
      } catch {}
      try {
        const r = await fetch(`/api/escala-config${qs}`);
        if (r.ok) {
          const d = await r.json();
          if (d && d.cad) {
            const s = JSON.stringify(d.cad);
            if (JSON.stringify(cadRef.current) === ultimoCadSalvo.current && s !== ultimoCadSalvo.current) {
              ultimoCadSalvo.current = s; setCad(d.cad);
            }
          }
        }
      } catch {}
    };
    const iv = setInterval(puxar, 15000);
    const onFocus = () => puxar();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    // cache local só vale para a SEDE (escopo vazio) — evita misturar unidades.
    if (!escopo) { try { const e = localStorage.getItem("sigep_escalas"); if (e) setEscalas(JSON.parse(e)); } catch {} }
    setHoje(toISO(new Date()));
    fetch("/api/efetivo")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        let lista = (d.efetivo || d || []) as Militar[];
        if (noEscopo) lista = lista.filter((m) => pertenceAoNo((m as any).lotacao ?? null, noEscopo)); // só a unidade
        setEfetivo(lista);
      })
      .catch(() => {});
    // Dias salvos vem do servidor (localStorage acima e so fallback instantaneo).
    fetch(`/api/escala-dias${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.escalas && Object.keys(d.escalas).length > 0) setEscalas(d.escalas); })
      .catch(() => {});
    // Equipes/afastamentos do servidor (migra o localStorage antigo se preciso).
    (async () => {
      try {
        const r = await fetch(`/api/escala-config${qs}`);
        const d = r.ok ? await r.json() : null;
        if (d && d.cad) { setCad(d.cad); ultimoCadSalvo.current = JSON.stringify(d.cad); return; }
      } catch {}
      if (escopo) return; // sem cadastro salvo ainda para a unidade -> começa do zero
      try {
        const cLS = localStorage.getItem("sigep_cadastro");
        if (cLS) {
          const parsed = JSON.parse(cLS);
          setCad(parsed);
          ultimoCadSalvo.current = JSON.stringify(parsed);
          fetch("/api/escala-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cad: parsed }) }).catch(() => {});
        }
      } catch {}
    })();
  }, []);

  // Salva as equipes no servidor ao editar no mapa (debounce) + backup local.
  useEffect(() => {
    const s = JSON.stringify(cad);
    if (s === ultimoCadSalvo.current) return;
    if (cadSaveTimer.current) clearTimeout(cadSaveTimer.current);
    cadSaveTimer.current = setTimeout(() => {
      ultimoCadSalvo.current = s;
      fetch(`/api/escala-config${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cad }) }).catch(() => {});
      if (!escopo) { try { localStorage.setItem("sigep_cadastro", s); } catch {} } // cache só da sede
    }, 800);
  }, [cad]);

  const efMap = useMemo(() => {
    const mm: Record<string, Militar> = {};
    for (const x of efetivo) mm[x.id] = x;
    return mm;
  }, [efetivo]);
  const nomeDe = useMemo(() => (token: string) => {
    if (!token) return "";
    if (token.startsWith("__FOLGA")) return "Folga"; // marcador de folga do rodizio
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
    for (const iso of dias) {
      out[iso] = assignDia(iso, cad, escalas, idDe);
      // Excecao do CPU editada direto na linha tem prioridade sobre o rodizio.
      const ovr = cad.cpuOverrides?.[iso];
      if (ovr !== undefined) out[iso] = { ...out[iso], cpu: ovr ? [ovr] : [] };
    }
    return out;
  }, [dias, cad, escalas, idDe]);

  // Quando numa tela por serviço, o "Por militar" mostra só a força daquela tela.
  const chavesGrupo = grupo ? grupo.servicos : ["cpu", "ftGraduado", "ftMotorista", "ftPatrulheiro", "rpAdjunto", "rpMotorista", "rpPatrulheiro", "guardaPermanente", "inteligencia", "rotem"];
  const militares = useMemo(() => {
    const ordem: string[] = chavesGrupo.flatMap((k) =>
      k === "rotem" ? cad.rotemEquipes.flatMap((e) => e.militares) : ((cad as any)[k] || [])
    );
    const set = new Set(ordem);
    for (const iso of dias) for (const k of Object.keys(assign[iso])) {
      if (!chavesGrupo.includes(k)) continue;
      for (const n of assign[iso][k]) if (!set.has(n)) { set.add(n); ordem.push(n); }
    }
    return Array.from(new Set(ordem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cad, dias, assign, grupo]);

  const porMilitar = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    const total: Record<string, number> = {};
    for (const nome of militares) { map[nome] = {}; total[nome] = 0; }
    for (const iso of dias) {
      for (const key of Object.keys(assign[iso])) {
        if (!chavesGrupo.includes(key)) continue;
        for (const n of assign[iso][key]) {
          if (!map[n]) { map[n] = {}; total[n] = 0; }
          if (!map[n][iso]) map[n][iso] = [];
          map[n][iso].push(ABBR_FUNC[key] || key);
          total[n]++;
        }
      }
    }
    return { map, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [militares, dias, assign, grupo]);

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

  const setPool = (patch: Partial<Cadastro>) => setCad((c) => ({ ...c, ...patch }));
  const setRotemMil = (i: number, ids: string[]) =>
    setCad((c) => ({ ...c, rotemEquipes: c.rotemEquipes.map((eq, j) => (j === i ? { ...eq, militares: ids } : eq)) }));

  // Dia de servico de cada equipe A/B/C/D (24/72 com 4 equipes, a partir de hoje).
  const teamDias = useMemo(() => {
    const ref = cad.refRodizioISO || `${mes}-01`;
    const base = hoje || `${mes}-01`;
    const off = (((diasEntre(ref, base) % 4) + 4) % 4);
    return EQUIPES_ABCD.map((_, i) => somaDias(base, (i - off + 4) % 4));
  }, [cad.refRodizioISO, hoje, mes]);

  // Filtros da tela por serviço (Fase 3). Sem grupo = mapa mensal completo.
  const servicosView = grupo ? SERVICOS.filter((s) => grupo.servicos.includes(s.key)) : SERVICOS;
  const funcoesView = grupo ? FUNCOES_EQUIPE.filter((f) => grupo.funcoes.includes(f.key)) : FUNCOES_EQUIPE;
  // FT/RP/Inteligencia/Permanencia agora sao editados pelo QUADRO (a fonte);
  // seus cartoes de fila somem. CPU (sequencia) e ROTEM (equipes) continuam.
  const CARDS_QUADRO = new Set(["ft", "rp", "inteligencia", "permanencia"]);
  const mostraCard = (key: string) => !CARDS_QUADRO.has(key) && (!grupo || grupo.card === key);
  const mostraComposicao = !grupo || grupo.card === "cpu" || grupo.card === "rotem";

  // Saidas previstas: afastamentos que COMECAM no mes exibido — aviso pro escalante.
  const saidasPrevistas = useMemo(() => {
    const ini = `${mes}-01`;
    const fim = `${mes}-${String(nDias).padStart(2, "0")}`;
    return cad.afastamentos
      .filter((a) => a.inicio && a.inicio >= ini && a.inicio <= fim)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [cad.afastamentos, mes, nDias]);

  return (
    <div className="mapa-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---- Cabecalho ---- */}
      <div className="mp-top no-print">
        <div className="mp-top-l">
          <button className="mp-btn back" onClick={voltar}>← Voltar</button>
          <div>
            <div className="mp-title">
              {grupo ? grupo.titulo : "Mapa de Escala"}{" "}
              {grupo
                ? <span className="mp-tag" style={{ background: grupo.cor + "22", color: grupo.cor, borderColor: grupo.cor }}>serviço</span>
                : <span className="mp-tag">Guardião</span>}
            </div>
            <div className="mp-sub">{grupo ? "Tela do serviço · mapa colorido + equipes editáveis" : "Visão do mês inteiro, gerada automaticamente. Atualiza sozinho — não precisa salvar."}</div>
            {escopo && (
              <div className="no-print" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "#9fb0c7" }}>Como funciona a escala desta unidade:</span>
                <input
                  value={cad.padraoEscala ?? "3 por 6"}
                  onChange={(e) => setCad((c) => ({ ...c, padraoEscala: e.target.value }))}
                  placeholder="ex.: 3 por 6"
                  style={{ background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 8, padding: "6px 10px", fontSize: 13, minWidth: 140 }}
                />
                <span style={{ fontSize: 11, color: "#6f82a0" }}>(cada unidade define o seu padrão)</span>
              </div>
            )}
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
            ★ Destacando: {sobrenome(nomeDe(selNome))} ({porMilitar.total[selNome] || 0} servicos) \u00b7 limpar ×
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

      <div className="mp-legenda cores no-print">
        <b className="mp-leg-tit">Cores:</b>
        {LEGENDA_CORES.map((c) => (
          <span key={c.nome}><i className="lg" style={{ background: c.cor }} /> {c.nome}</span>
        ))}
      </div>

      {saidasPrevistas.length > 0 && (
        <div className="mp-saidas no-print">
          <b>📌 Saídas previstas em {MESNOME[m - 1]}:</b>{" "}
          {saidasPrevistas.map((a, i) => (
            <span key={i}>
              {sobrenome(nomeDe(a.militar))} <span className="mp-saida-tag">{ABBR_AF[a.tipo]}</span> a partir de {brCurto(a.inicio)}
              {i < saidasPrevistas.length - 1 ? "  ·  " : ""}
            </span>
          ))}
        </div>
      )}

      {!grupo && !avisoDispensado && proxAusencias.length > 0 && (
        <div className="mp-proxaus no-print">
          <div className="mp-proxaus-cab">
            <b>⚠️ Atenção, escalante — saídas da SEDE (faltando 5 dias):</b>
            <button className="mp-proxaus-x" onClick={dispensarAviso} title="Não lembrar até a próxima equipe (volta amanhã)">Não lembrar ✕</button>
          </div>
          <ul>
            {proxAusencias.map((a, i) => (
              <li key={i}>
                <b>{a.nome}</b> <span className="mp-proxaus-lot">({a.lotacao})</span> entra de <b>{a.tipo}</b>{" "}
                {a.dias <= 0 ? "hoje" : a.dias === 1 ? "amanhã" : `em ${a.dias} dias`} — {brCurto(a.inicio)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mp-print-titulo">
        Mapa de Escala — {MESNOME[m - 1]} / {ano} — {vista === "servico" ? "Por serviço" : "Por militar"} — 18º BPM
      </div>

      {/* ---- Tabela ---- */}
      <div className={"mp-scroll" + (grupo ? " grande" : "")}>
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
              {servicosView.map((srv) => (
                <tr key={srv.key}>
                  <td className="mp-rot">{srv.label}</td>
                  {dias.map((iso) => {
                    const nomes = assign[iso][srv.key] || [];
                    const ehCpu = srv.key === "cpu";
                    const temOvr = ehCpu && cad.cpuOverrides?.[iso] !== undefined;
                    return (
                      <td
                        key={iso}
                        className={`mp-cel${fimDeSemana(iso) ? " fds" : ""}${iso === hoje ? " hoje" : ""}${ehCpu ? " editavel" : ""}${temOvr ? " ovr" : ""}`}
                        onClick={ehCpu ? () => { setBuscaCpu(""); setEditCpu(iso); } : undefined}
                        title={ehCpu ? "Clique para editar o CPU deste dia" : undefined}
                      >
                        {nomes.length === 0 && ehCpu && <div className="mp-cel-vazio no-print">+</div>}
                        {nomes.map((n, i) => {
                          const conf = afastado(n, iso, cad.afastamentos);
                          let cls = "mp-nome";
                          if (conf) cls += " conf";
                          if (selNome === n) cls += " sel";
                          const cor = COR_SERVICO[srv.key];
                          return (
                            <div
                              key={i}
                              className={cls}
                              style={conf ? undefined : (cor ? { background: cor, color: "#0a1020" } : undefined)}
                              title={ehCpu ? "Clique para editar o CPU deste dia" : (nomeDe(n) + (selNome === n ? "" : " \u00b7 clique para destacar no mes"))}
                              onClick={ehCpu ? undefined : (ev) => { ev.stopPropagation(); clickNome(n); }}
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
                    {nomesComConflito.has(nome) && <span className="mp-mil-alerta" title="Tem conflito neste mes">⚠ </span>}
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
                    let corCel = "";
                    if (af && escalado) corCel = "";                       // conflito: mantem vermelho
                    else if (af) corCel = COR_AF[af];                      // afastado: cor da situacao
                    else if (funcs.length === 1) corCel = COR_ABBR[funcs[0]] || ""; // servico
                    const stCel = corCel ? { background: corCel, color: "#0a1020" } : undefined;
                    return <td key={iso} className={cls} style={stCel} title={af ? `${ABBR_AF[af]}${escalado ? " + escalado!" : ""}` : funcs.join(" / ")}>{txt}</td>;
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

      {/* ---- Quadro de escala por equipes A/B/C/D ---- */}
      {funcoesView.length > 0 && (
        <div className="mp-quadro no-print">
          <div className="mp-quadro-tit">{grupo ? `${grupo.titulo} · por equipes` : "Escala por equipes"}</div>
          <div className="mp-quadro-sub">
            <b style={{ color: "#9fe6bd" }}>Este quadro é a fonte da escala</b> — mexeu aqui, muda o mapa e a diária. Equipe A/B/C/D no ciclo 24/72; em cima de cada letra, o dia de serviço.{!grupo && " O CPU não entra aqui."}
          </div>
          <QuadroEquipes cad={cad} setCad={setCad} efetivo={efetivo} nomeDe={nomeDe} teamDias={teamDias} funcoes={funcoesView} />
        </div>
      )}

      {/* ---- Composicao (só CPU/ROTEM; FT/RP/Intel/Perm são editados pelo quadro) ---- */}
      {mostraComposicao && (
      <div className="mp-equipes">
        <div className="mp-equipes-tit">{grupo ? `${grupo.titulo} · sequência do rodízio` : "Filas: CPU e ROTEM"}</div>
        <div className="mp-equipes-sub no-print">
          {grupo ? "Ordem da fila (mover ↑ ↓), adicionar e remover — salva no servidor." : "Quem entra no rodízio de cada serviço (na ordem da fila) e as equipes da ROTEM."}
        </div>
        <div className="mp-eq-grid">
          {mostraCard("cpu") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">CPU de dia (oficiais)</div>
            <PoolMini ids={cad.cpu} onChange={(v) => setPool({ cpu: v })} efetivo={efetivo} nomeDe={nomeDe} permiteFolga />
          </div>
          )}

          {mostraCard("ft") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Força Tática</div>
            <div className="mp-eq-sub">Graduado</div><PoolMini ids={cad.ftGraduado} onChange={(v) => setPool({ ftGraduado: v })} efetivo={efetivo} nomeDe={nomeDe} />
            <div className="mp-eq-sub">Motorista</div><PoolMini ids={cad.ftMotorista} onChange={(v) => setPool({ ftMotorista: v })} efetivo={efetivo} nomeDe={nomeDe} />
            <div className="mp-eq-sub">Armeiro / Patrulheiro</div><PoolMini ids={cad.ftPatrulheiro} onChange={(v) => setPool({ ftPatrulheiro: v })} efetivo={efetivo} nomeDe={nomeDe} />
          </div>
          )}

          {mostraCard("rp") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Rádio Patrulha</div>
            <div className="mp-eq-sub">Adjunto de dia</div><PoolMini ids={cad.rpAdjunto} onChange={(v) => setPool({ rpAdjunto: v })} efetivo={efetivo} nomeDe={nomeDe} />
            <div className="mp-eq-sub">Motorista</div><PoolMini ids={cad.rpMotorista} onChange={(v) => setPool({ rpMotorista: v })} efetivo={efetivo} nomeDe={nomeDe} />
            <div className="mp-eq-sub">Patrulheiro</div><PoolMini ids={cad.rpPatrulheiro} onChange={(v) => setPool({ rpPatrulheiro: v })} efetivo={efetivo} nomeDe={nomeDe} />
          </div>
          )}

          {mostraCard("inteligencia") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Serviço de Inteligência</div>
            <PoolMini ids={cad.inteligencia} onChange={(v) => setPool({ inteligencia: v })} efetivo={efetivo} nomeDe={nomeDe} />
          </div>
          )}

          {mostraCard("permanencia") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">Guarda do Quartel</div>
            <PoolMini ids={cad.guardaPermanente} onChange={(v) => setPool({ guardaPermanente: v })} efetivo={efetivo} nomeDe={nomeDe} />
          </div>
          )}

          {mostraCard("rotem") && (
          <div className="mp-eq-grupo">
            <div className="mp-eq-h">ROTEM · equipes</div>
            {cad.rotemEquipes.length === 0 ? (
              <div className="mp-eq-vazio">(sem equipes)</div>
            ) : (
              cad.rotemEquipes.map((eq, i) => (
                <div key={i} className="mp-eq-rotem">
                  <div className="mp-eq-sub">{eq.nome} · {eq.turnos.join(" / ")}</div>
                  <PoolMini ids={eq.militares} onChange={(v) => setRotemMil(i, v)} efetivo={efetivo} nomeDe={nomeDe} />
                </div>
              ))
            )}
          </div>
          )}
        </div>
      </div>
      )}

      <div className="mp-equipes no-print" style={{ marginTop: 14 }}>
        <div className="mp-equipes-tit">Afastamentos</div>
        <div className="mp-equipes-sub">
          Registre férias, missão, ROTAM, curso... O motor pula o militar em <b>todas as forças</b>, avisa nas “saídas previstas” e marca conflitos. Vale em todos os PCs.
        </div>
        <AfastamentosMini cad={cad} setCad={setCad} efetivo={efetivo} nomeDe={nomeDe} />
      </div>

      <div className="mp-rodape no-print">
        Gerado pelo motor (24/72 + ROTEM por equipes). Dias já salvos na escala diária aparecem como estão; os demais vêm do rodízio automático.
      </div>

      {/* Editor do CPU do dia (excecao na linha) */}
      {editCpu && (
        <div className="no-print" onClick={() => setEditCpu(null)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, background: "#0F1B2D", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
              <b style={{ color: "#fff" }}>CPU de dia · {brCurto(editCpu)}</b>
              <button onClick={() => setEditCpu(null)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>
                Atual: <b style={{ color: "#E8EEF6" }}>{(() => { const c = assign[editCpu]?.cpu?.[0]; return c ? nomeDe(c) : "—"; })()}</b>
                {cad.cpuOverrides?.[editCpu] !== undefined && <span style={{ color: "#e8c877" }}> · (editado manualmente)</span>}
              </div>
              <input autoFocus value={buscaCpu} onChange={(e) => setBuscaCpu(e.target.value)} placeholder="Buscar militar para colocar como CPU..."
                style={{ width: "100%", background: "#0b1626", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", color: "#fff", outline: "none", fontSize: 13 }} />
              {buscaCpu.trim().length >= 1 && (
                <div style={{ marginTop: 6, maxHeight: 220, overflowY: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }}>
                  {efetivo.filter((m) => (fmtMilitar(m) + " " + (m.matricula || "")).toLowerCase().includes(buscaCpu.trim().toLowerCase())).slice(0, 12).map((m) => (
                    <button key={m.id} onClick={() => { setCpuOverride(editCpu, m.id); setEditCpu(null); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,.05)", color: "#fff", cursor: "pointer", fontSize: 13 }}>
                      {fmtMilitar(m)}{m.matricula ? <span style={{ color: "#94A3B8", fontSize: 11 }}> · {m.matricula}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => { setCpuOverride(editCpu, "__FOLGA__"); setEditCpu(null); }}
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#241a08", border: "1px solid #6b5320", borderRadius: 8, color: "#e8c877", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Folga</button>
                <button onClick={() => { setCpuOverride(editCpu, ""); setEditCpu(null); }}
                  title="Deixa o dia sem CPU (célula em branco)"
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#2a1414", border: "1px solid #7a1f1f", borderRadius: 8, color: "#ffb3b3", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Excluir</button>
                <button onClick={() => { setCpuOverride(editCpu, null); setEditCpu(null); }}
                  style={{ flex: 1, minWidth: 92, padding: "8px 10px", background: "#0b1626", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: "#cdd9ea", cursor: "pointer", fontSize: 13 }}>Automático (rodízio)</button>
              </div>
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
                Vale só para <b>{brCurto(editCpu)}</b> e reflete na escala do dia.
                <b> Folga</b> escreve &ldquo;Folga&rdquo;; <b>Excluir</b> deixa em branco; <b>Automático</b> volta ao rodízio.
              </p>
            </div>
          </div>
        </div>
      )}
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
.mp-rot{ position:sticky; left:0; z-index:2; background:#0F1B2D; text-align:left; padding:5px 9px; min-width:236px; max-width:236px; font-weight:600; }
.mp-mil{ font-weight:400; color:#cdd9ea; white-space:normal; line-height:1.25; cursor:pointer; }
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
.mp-cel.editavel{ cursor:pointer; }
.mp-cel.editavel:hover{ box-shadow:inset 0 0 0 1px #D4AF37; }
.mp-cel.ovr{ box-shadow:inset 0 0 0 1px #6b5320; }
.mp-cel-vazio{ color:#4a5a72; font-weight:700; }
.mp-nome{ white-space:nowrap; cursor:pointer; border-radius:4px; padding:1px 5px; font-weight:600; }
.mp-nome:hover{ background:#1a2a45; }
.mp-leg-tit{ color:#D4AF37; }
/* Telas por servico: tudo maior/espacado para o escalante */
.mp-scroll.grande .mp-tab{ font-size:13px; }
.mp-scroll.grande .mp-cel{ padding:5px 5px; }
.mp-scroll.grande .mp-nome{ font-size:14px; padding:4px 9px; }
.mp-scroll.grande .mp-dia{ padding:5px; } .mp-scroll.grande .mp-dnum{ font-size:14px; }
.mp-scroll.grande .mp-rot{ font-size:13px; padding:8px 10px; }
.mp-scroll.grande .mp-cel.mil{ font-size:13.5px; }
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
.mp-pool{ margin-bottom:2px; }
/* rodizio em lista HORIZONTAL (fica melhor para mudar a ordem) */
.mp-pool-lista{ list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
.mp-pool-lista .mp-pool-li{ flex-direction:column; align-items:stretch; gap:3px; background:#0e1a2b; border:1px solid #28395a; border-radius:8px; padding:5px 7px; min-width:104px; }
.mp-pool-top{ display:flex; align-items:center; gap:5px; }
.mp-pool-ord{ color:#D4AF37; font-size:10px; font-weight:700; }
.mp-pool-li{ display:flex; align-items:center; gap:6px; cursor:grab; border-radius:6px; padding:1px 2px; }
.mp-pool-li:hover{ background:#0e1a2b; }
.mp-pool-li.arrastando{ opacity:.45; }
.mp-pool-lista .mp-pool-btns{ justify-content:center; }
.mp-pool-grip{ color:#6b7f9c; cursor:grab; font-size:11px; user-select:none; letter-spacing:-2px; }
.mp-pool-nome{ flex:1; }
.mp-pool-btns{ display:inline-flex; gap:2px; }
.mp-pool-btns button{ background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:5px; width:20px; height:20px; font-size:11px; line-height:1; cursor:pointer; padding:0; }
.mp-pool-btns button:hover:not(:disabled){ border-color:#D4AF37; color:#E8EEF6; }
.mp-pool-btns button:disabled{ opacity:.3; cursor:default; }
.mp-pool-btns button.del:hover{ border-color:#e06464; color:#ffb3b3; }
.mp-pool-add{ margin-top:4px; }
.mp-pool-acoes{ display:flex; gap:6px; flex-wrap:wrap; }
.mp-pool-lista .mp-pool-li.folga{ background:#241a08; border-color:#6b5320; }
.mp-pool-lista .mp-pool-li.folga .mp-pool-nome{ color:#e8c877; font-style:italic; }
.mp-pool-mais.folga{ border-color:#6b5320; color:#e8c877; }
.mp-pool-mais.folga:hover{ border-color:#D4AF37; color:#ffe6a3; }
.mp-pool-mais{ background:none; border:1px dashed #2b3f63; color:#9fb0c7; border-radius:6px; padding:3px 8px; font-size:11px; cursor:pointer; }
.mp-pool-mais:hover{ border-color:#D4AF37; color:#E8EEF6; }
.mp-pool-search{ position:relative; }
.mp-pool-search input{ width:100%; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:6px; padding:5px 8px; font-size:11.5px; }
.mp-pool-search input:focus{ outline:none; border-color:#D4AF37; }
.mp-pool-res{ position:absolute; z-index:20; left:0; right:0; top:calc(100% + 3px); background:#0d1830; border:1px solid #2b3f63; border-radius:6px; max-height:180px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.5); }
.mp-pool-res button{ display:block; width:100%; text-align:left; background:none; border:0; border-bottom:1px solid #18263d; color:#E8EEF6; padding:6px 9px; font-size:11.5px; cursor:pointer; }
.mp-pool-res button:hover{ background:#16243a; }
.mp-pool-vazio{ padding:6px 9px; font-size:11px; color:#6f82a0; }

/* Registrador de afastamento no mapa */
.mp-afm{ display:flex; flex-direction:column; gap:8px; }
.mp-afm-search{ position:relative; max-width:520px; }
.mp-afm-search input{ width:100%; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.mp-afm-search input:focus{ outline:none; border-color:#D4AF37; }
.mp-afm-res{ position:absolute; z-index:25; left:0; right:0; top:calc(100% + 3px); background:#0d1830; border:1px solid #2b3f63; border-radius:8px; max-height:200px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.5); }
.mp-afm-res button{ display:block; width:100%; text-align:left; background:none; border:0; border-bottom:1px solid #18263d; color:#E8EEF6; padding:8px 11px; font-size:13px; cursor:pointer; }
.mp-afm-res button:hover{ background:#16243a; }
.mp-afm-vazio{ padding:8px 11px; font-size:12px; color:#6f82a0; }
.mp-afm-list{ display:flex; flex-direction:column; gap:6px; }
.mp-afm-linha{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.mp-afm-nome{ flex:1; min-width:200px; font-size:13px; color:#E8EEF6; }
.mp-afm-linha select, .mp-afm-linha input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:6px 9px; font-size:12.5px; }
.mp-afm-del{ background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:6px; width:28px; height:30px; cursor:pointer; }
.mp-afm-del:hover{ border-color:#e06464; color:#ffb3b3; }

/* Aviso de saidas previstas (ferias etc.) */
.mp-saidas{ margin:10px 2px; font-size:12.5px; color:#f3df9d; background:#2a2410; border:1px solid #6b5320; border-radius:8px; padding:9px 12px; line-height:1.7; }
.mp-saidas b{ color:#ffe9a8; }
/* Aviso de saidas da SEDE (ferias/LP) para o escalante */
.mp-proxaus{ margin:10px 2px; font-size:12.5px; color:#ffd9b0; background:#3a2410; border:1px solid #8a5a1f; border-radius:8px; padding:10px 12px; }
.mp-proxaus-cab{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:5px; }
.mp-proxaus-cab b{ color:#ffe1b0; }
.mp-proxaus-x{ background:#5a3a15; color:#ffd9b0; border:1px solid #8a5a1f; border-radius:7px; padding:3px 10px; font-size:11.5px; cursor:pointer; white-space:nowrap; }
.mp-proxaus-x:hover{ background:#6b4519; }
.mp-proxaus ul{ margin:0; padding-left:18px; line-height:1.7; }
.mp-proxaus b{ color:#fff2df; }
.mp-proxaus-lot{ color:#c9a37a; font-size:11px; }
.mp-saida-tag{ font-size:10px; background:#6b5320; color:#ffe9a8; border-radius:999px; padding:1px 7px; }

/* Quadro de escala por equipes A/B/C/D (visual) */
.mp-quadro{ margin-top:14px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.mp-quadro-tit{ color:#D4AF37; font-weight:700; font-size:15px; }
.mp-quadro-sub{ font-size:12px; color:#9fb0c7; margin:3px 0 12px; }
.mp-quadro-scroll{ overflow:auto; }
.mp-quadro-tab{ border-collapse:collapse; width:100%; }
.mp-quadro-tab th, .mp-quadro-tab td{ border:1px solid #1d2c44; padding:8px 10px; text-align:center; }
.mp-q-func{ text-align:left !important; background:#13223a; color:#E8EEF6; font-weight:600; font-size:12.5px; min-width:180px; position:sticky; left:0; z-index:1; }
.mp-q-eq{ background:#0d1830; min-width:120px; }
.mp-q-dia{ font-size:11px; color:#9fd9ff; }
.mp-q-dia span{ color:#6f82a0; }
.mp-q-letra{ font-size:22px; font-weight:800; color:#D4AF37; margin-top:2px; }
.mp-q-cel{ background:#0a1424; color:#cdd9ea; font-size:13px; padding:5px 6px !important; vertical-align:middle; position:relative; }
.mp-q-cel.alvo{ outline:1px dashed #3d5580; outline-offset:-3px; }
.mp-q-chip{ display:flex; align-items:center; justify-content:space-between; gap:6px; background:#13223a; border:1px solid #28395a; border-radius:7px; padding:5px 7px; cursor:grab; }
.mp-q-chip:active{ cursor:grabbing; }
.mp-q-chip.af{ background:#3a1414; border-color:#7a1f1f; }
.mp-q-nome{ font-size:12.5px; color:#E8EEF6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mp-q-chip.af .mp-q-nome{ color:#ffd9d9; }
.mp-q-acoes{ display:inline-flex; gap:2px; }
.mp-q-acoes button{ background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:5px; width:22px; height:22px; font-size:11px; cursor:pointer; padding:0; line-height:1; }
.mp-q-acoes button:hover{ border-color:#D4AF37; }
.mp-q-acoes button.del:hover{ border-color:#e06464; color:#ffb3b3; }
.mp-q-add{ background:none; border:1px dashed #2b3f63; color:#6f82a0; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; width:100%; }
.mp-q-add:hover{ border-color:#D4AF37; color:#cdd9ea; }
.mp-q-busca{ position:relative; }
.mp-q-busca input{ width:100%; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:6px; padding:5px 7px; font-size:11.5px; }
.mp-q-busca input:focus{ outline:none; border-color:#D4AF37; }
.mp-q-res{ position:absolute; z-index:25; left:0; right:0; top:calc(100% + 3px); background:#0d1830; border:1px solid #2b3f63; border-radius:6px; max-height:170px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.5); }
.mp-q-res button{ display:block; width:100%; text-align:left; background:none; border:0; border-bottom:1px solid #18263d; color:#E8EEF6; padding:6px 8px; font-size:11.5px; cursor:pointer; }
.mp-q-res button:hover{ background:#16243a; }
.mp-q-vazio{ padding:6px 8px; font-size:11px; color:#6f82a0; }
.mp-q-afform{ margin-top:6px; background:#0d1830; border:1px solid #2b3f63; border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px; text-align:left; }
.mp-q-afform select, .mp-q-afform input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:6px; padding:5px 7px; font-size:11.5px; width:100%; }
.mp-q-afform label{ display:flex; flex-direction:column; gap:3px; font-size:10px; color:#9fb0c7; }
.mp-q-afbtns{ display:flex; gap:6px; }
.mp-q-afbtns button{ flex:1; background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:6px; padding:5px; font-size:11.5px; cursor:pointer; }
.mp-q-afbtns button.ok{ background:#1b3a2a; border-color:#2e6b48; color:#bff0d0; font-weight:600; }
.mp-quadro-hint{ font-size:11.5px; color:#6f82a0; margin-top:8px; line-height:1.5; }

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
  .mp-nome{ background:transparent !important; color:#000 !important; }
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
