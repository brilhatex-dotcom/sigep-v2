/* =========================================================================
   Motor da escala (versão pura, sem React) — espelho do que roda no
   MapaClient/EscalaClient. Serve para calcular a previsão INDIVIDUAL do
   policial (quais serviços ele cobre em cada dia) na aba "Meu Mapa de Escala".
   Não altera nada; só lê o cadastro (cad) e os dias já salvos (escalas).
   ========================================================================= */

export type Slot = { titular: string; permuta: string | null; status?: any };
export type TipoAfastamento =
  | "ferias" | "missao" | "curso" | "licenca_premio"
  | "licenca_paternidade" | "jms" | "rotam" | "outro";
export type Afastamento = { militar: string; tipo: TipoAfastamento; inicio: string; fim: string };
export type EquipeRotem = { nome: string; turnos: string[]; militares: string[]; diasSemana?: number[] };
export type Cadastro = {
  cpu: string[]; ftGraduado: string[]; ftMotorista: string[]; ftPatrulheiro: string[];
  rpAdjunto: string[]; rpMotorista: string[]; rpPatrulheiro: string[];
  guardaPermanente: string[]; inteligencia: string[];
  rotemEquipes: EquipeRotem[]; afastamentos: Afastamento[];
  refRodizioISO: string; refCpuISO: string; refRotemISO: string;
  quadroEquipes?: Record<string, Record<string, string>>;
  linhasExtras?: Record<string, number>;
  cpuOverrides?: Record<string, string>;
};

const DAY = 86400000;
const EQUIPES_ABCD = ["A", "B", "C", "D"];

export const parseISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const toISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const diasEntre = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
const proxDia = (iso: string) => toISO(new Date(parseISO(iso).getTime() + DAY));

export function semTags(html: string): string {
  if (!html) return "";
  if (html.indexOf("<") === -1) return html.trim();
  return html.replace(/<[^>]*>/g, "").trim();
}

export function afastado(nome: string, data: string, lista: Afastamento[]): boolean {
  return (lista || []).some((a) => a.militar === nome && data >= a.inicio && data <= a.fim);
}

function rodizio(pool: string[], qtd: number, dataAlvo: string, afast: Afastamento[], ref: string): string[] {
  if (!pool || pool.length === 0 || dataAlvo < ref) return [];
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
  if (!equipes || equipes.length === 0) return null;
  const comDias = equipes.filter((e) => e.diasSemana && e.diasSemana.length);
  if (comDias.length) {
    const dow = parseISO(data).getDay();
    return comDias.find((e) => e.diasSemana!.includes(dow)) || null;
  }
  const bloco = Math.floor(diasEntre(ref, data) / 3);
  return equipes[(((bloco % equipes.length) + equipes.length) % equipes.length)];
}

export type Assign = Record<string, string[]>;

export function assignDia(iso: string, cad: Cadastro, escalas: Record<string, any>, idDe: (nome: string) => string): Assign {
  const e = escalas ? escalas[iso] : null;
  if (e) {
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
  const team = EQUIPES_ABCD[(((diasEntre(r, iso) % 4) + 4) % 4)];
  const q = cad.quadroEquipes || {};
  const nExtra = (fk: string) => cad.linhasExtras?.[fk] || 0;
  const dq = (fk: string) => {
    const ids: string[] = [];
    const b = q[team]?.[fk] || ""; if (b) ids.push(b);
    for (let k = 2; k <= nExtra(fk) + 1; k++) { const id = q[team]?.[`${fk}#${k}`] || ""; if (id) ids.push(id); }
    return ids;
  };
  const ovrCpu = cad.cpuOverrides?.[iso];
  const cpuId = ovrCpu !== undefined ? (ovrCpu && !ovrCpu.startsWith("__FOLGA") ? ovrCpu : "") : (rodizio(cad.cpu, 1, iso, a, cad.refCpuISO)[0] || "");
  return {
    cpu: cpuId ? [cpuId] : [],
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

// rótulos amigáveis de cada serviço
export const LABEL_SERVICO: Record<string, string> = {
  cpu: "CPU de dia",
  ftGraduado: "Força Tática · Graduado",
  ftMotorista: "Força Tática · Motorista",
  ftPatrulheiro: "Força Tática · Patrulheiro",
  rpAdjunto: "Rádio Patrulha · Adjunto",
  rpMotorista: "Rádio Patrulha · Motorista",
  rpPatrulheiro: "Rádio Patrulha · Patrulheiro",
  guardaPermanente: "Permanência",
  inteligencia: "Inteligência",
  rotem: "ROTEM",
};

/* Resolve o nome escrito na folha (dias já salvos) de volta para o ID, sem
   depender do formato exato: casa pelo nº/barra (ex.: "338/22") e, na falta,
   pelo nome de guerra. Para dias não salvos o motor já trabalha com IDs. */
export function construirIdDe(efetivo: { id: string; numeroBarra?: string | null; nome?: string | null; nomeGuerra?: string | null }[]) {
  return (nome: string): string => {
    const n = (nome || "").toLowerCase();
    if (!n) return nome;
    for (const m of efetivo) { const b = (m.numeroBarra || "").trim().toLowerCase(); if (b && b.length >= 3 && n.includes(b)) return m.id; }
    for (const m of efetivo) { const g = (m.nomeGuerra || "").trim().toLowerCase(); if (g && g.length >= 3 && n.includes(g)) return m.id; }
    return nome;
  };
}

/* O militar tem PREVISÃO na sede? (está em algum pool do rodízio, no quadro
   A/B/C/D ou em alguma equipe ROTEM). É a regra de acesso da aba. */
export function temPrevisaoNaSede(cad: Cadastro | null, id: string): boolean {
  if (!cad || !id) return false;
  const pools = [cad.cpu, cad.ftGraduado, cad.ftMotorista, cad.ftPatrulheiro, cad.rpAdjunto, cad.rpMotorista, cad.rpPatrulheiro, cad.guardaPermanente, cad.inteligencia];
  if (pools.some((p) => (p || []).includes(id))) return true;
  if ((cad.rotemEquipes || []).some((e) => (e.militares || []).includes(id))) return true;
  const q = cad.quadroEquipes || {};
  for (const time of Object.values(q)) for (const v of Object.values(time || {})) if (v === id) return true;
  return false;
}

/* Lista os dias (a partir de hoje) em que o militar cobre algum serviço. */
export function previsaoDoMilitar(cad: Cadastro, escalas: Record<string, any>, id: string, idDe: (nome: string) => string, dias: number): { iso: string; servicos: string[] }[] {
  const hoje = toISO(new Date());
  const out: { iso: string; servicos: string[] }[] = [];
  let iso = hoje;
  for (let i = 0; i < dias; i++) {
    const a = assignDia(iso, cad, escalas, idDe);
    const servicos: string[] = [];
    for (const [k, ids] of Object.entries(a)) if ((ids || []).includes(id)) servicos.push(LABEL_SERVICO[k] || k);
    if (servicos.length) out.push({ iso, servicos });
    iso = proxDia(iso);
  }
  return out;
}
