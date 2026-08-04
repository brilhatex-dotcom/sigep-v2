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
  padraoEscala?: string;   // ex.: "3 por 6" (3 trab / 6 folga). Vazio = 24/72 (sede).
  // Reducao judicial: idPmma -> percentual MAXIMO de servicos no mes (ex.: 50).
  reducaoJudicial?: Record<string, number>;
  // Dias da semana em que o militar PODE ser escalado (0=domingo ... 6=sabado).
  // Ausente ou lista vazia = todos os dias. Ex.: [0,6] = so fim de semana, para
  // quem estuda durante a semana ou tem determinacao nesse sentido.
  diasPermitidos?: Record<string, number[]>;
  // ROTEM: horario padrao por dia da semana (0=domingo ... 6=sabado). E so o
  // ponto de partida — na folha do dia o horario continua editavel.
  rotemHorariosPadrao?: string[][];
};

/* Horario padrao da ROTEM, por dia da semana (0=domingo ... 6=sabado):
   segunda a quinta em dois turnos, sexta e sabado a noite, domingo a tarde. */
export const ROTEM_HORARIOS_PADRAO: string[][] = [
  ["16h às 00h"],                     // domingo
  ["07h às 12h", "18h às 23h"],       // segunda
  ["07h às 12h", "18h às 23h"],       // terça
  ["07h às 12h", "18h às 23h"],       // quarta
  ["07h às 12h", "18h às 23h"],       // quinta
  ["19h30min às 02h"],                // sexta
  ["19h30min às 02h"],                // sábado
];

/** Horario da ROTEM para a data, respeitando o padrao configurado. */
export function horariosRotemDoDia(iso: string, cad?: Pick<Cadastro, "rotemHorariosPadrao">): string[] {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dow = m ? new Date(+m[1], +m[2] - 1, +m[3]).getDay() : 1;
  const tabela = cad?.rotemHorariosPadrao;
  const doDia = Array.isArray(tabela?.[dow]) ? tabela![dow] : ROTEM_HORARIOS_PADRAO[dow];
  const limpos = doDia.filter((h) => String(h || "").trim());
  return limpos.length ? limpos.slice() : ROTEM_HORARIOS_PADRAO[dow].slice();
}

const inicioMesISO = (iso: string) => `${iso.slice(0, 7)}-01`;
// Deve o militar entrar neste "slot de dia" da sua equipe, respeitando o teto
// mensal da reducao judicial? Distribui o percentual de forma uniforme pelos
// dias da equipe no mes (nunca ultrapassa o teto). Sem reducao valida => true.
export function incluiComReducao(pct: number | undefined, ordNoMes: number): boolean {
  if (!pct || pct <= 0 || pct >= 100) return true;
  const f = pct / 100;
  return Math.floor((ordNoMes + 1) * f) > Math.floor(ordNoMes * f);
}

/* O militar pode entrar de serviço NESTE dia da semana? Lista ausente ou
   vazia = pode em qualquer dia (o caso da imensa maioria). Serve para quem só
   é escalado no fim de semana — militar que estuda durante a semana, ou com
   determinação nesse sentido. */
export function podeNoDia(dias: number[] | undefined, iso: string): boolean {
  if (!dias || dias.length === 0) return true;
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return true;
  return dias.includes(new Date(+m[1], +m[2] - 1, +m[3]).getDay());
}

/** Rótulo curto dos dias permitidos, para a tela e os avisos. */
export function rotuloDias(dias?: number[]): string {
  if (!dias || dias.length === 0 || dias.length === 7) return "todos os dias";
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const ord = [...dias].sort((a, b) => a - b);
  if (ord.length === 2 && ord[0] === 0 && ord[1] === 6) return "só fim de semana";
  if (ord.length === 5 && ord.join() === "1,2,3,4,5") return "só dias úteis";
  return "só " + ord.map((d) => nomes[d]).join(", ");
}

/* Interpreta o padrão digitado ("3 por 6", "3x6", "1/3"...) em dias de trabalho
   e de folga, e quantas equipes cobrem o ciclo. Sem padrão = 24/72 (sede):
   1 dia de serviço, 3 de folga, 4 equipes (A/B/C/D). */
export function parsePadrao(s: string | undefined | null): { trabalho: number; folga: number; equipes: number } {
  const m = (s || "").match(/(\d+)\s*(?:por|x|\/|-|\s)\s*(\d+)/i);
  if (m) {
    const t = Math.max(1, parseInt(m[1], 10));
    const f = Math.max(0, parseInt(m[2], 10));
    const equipes = Math.max(1, Math.round((t + f) / t));
    return { trabalho: t, folga: f, equipes };
  }
  return { trabalho: 1, folga: 3, equipes: 4 };
}
// Índice da equipe (0..equipes-1) para um dia, conforme o padrão.
export function timeDoDia(diasDesdeRef: number, p: { trabalho: number; equipes: number }): number {
  const ciclo = p.trabalho * p.equipes;
  const d = ((diasDesdeRef % ciclo) + ciclo) % ciclo;
  return Math.floor(d / p.trabalho);
}

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
    const arr1 = (v: any) => (Array.isArray(v) ? v : v ? [v] : []); // Slot antigo -> lista
    const lst = (arr: any[]) => arr1(arr).map(t).filter(Boolean);
    return {
      cpu: [t(e.cpuDeDia)].filter(Boolean),
      ftGraduado: [t(e.ftGraduado)].filter(Boolean),
      ftMotorista: [t(e.ftMotorista)].filter(Boolean),
      ftPatrulheiro: lst(e.ftPatrulheiro),
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
  // equipe do dia conforme o padrão da unidade (ex.: "3 por 6" = 3 equipes);
  // sem padrão = 24/72 (4 equipes A/B/C/D), como a sede.
  const padrao = parsePadrao(cad.padraoEscala);
  const team = EQUIPES_ABCD[timeDoDia(diasEntre(r, iso), padrao) % EQUIPES_ABCD.length];
  const q = cad.quadroEquipes || {};
  const nExtra = (fk: string) => cad.linhasExtras?.[fk] || 0;
  // Reducao judicial: quantos dias da equipe deste dia ja passaram no mes (para
  // distribuir o teto). Depois pula o militar capado nos dias fora da cota.
  const rj = cad.reducaoJudicial || {};
  const dp = cad.diasPermitidos || {};
  const teamDoDia = (d: string) => EQUIPES_ABCD[timeDoDia(diasEntre(r, d), padrao) % EQUIPES_ABCD.length];
  // Conta só os dias da equipe em que o militar PODE entrar: assim o teto
  // percentual incide sobre os dias que sobram, e não sobre o mês inteiro.
  const ordEquipeMes = (d: string, tm: string, dias?: number[]) => {
    let n = -1;
    for (let x = inicioMesISO(d); x <= d; x = proxDia(x)) if (teamDoDia(x) === tm && podeNoDia(dias, x)) n++;
    return n;
  };
  const dq = (fk: string) => {
    const ids: string[] = [];
    const push1 = (id: string) => {
      if (!id) return;
      const dias = dp[id];
      if (!podeNoDia(dias, iso)) return;                                  // dia da semana não permitido
      const pct = rj[id];
      if (pct && !incluiComReducao(pct, ordEquipeMes(iso, team, dias))) return; // teto judicial do mes
      ids.push(id);
    };
    push1(q[team]?.[fk] || "");
    for (let k = 2; k <= nExtra(fk) + 1; k++) push1(q[team]?.[`${fk}#${k}`] || "");
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
// siglas curtas (para as células do calendário)
export const ABBR_SERVICO: Record<string, string> = {
  cpu: "CPU", ftGraduado: "FT-G", ftMotorista: "FT-M", ftPatrulheiro: "FT-P",
  rpAdjunto: "RP-A", rpMotorista: "RP-M", rpPatrulheiro: "RP-P",
  guardaPermanente: "PERM", inteligencia: "INT", rotem: "ROTEM",
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
    for (const [k, ids] of Object.entries(a)) if ((ids || []).includes(id)) servicos.push(k); // devolve a CHAVE do serviço
    if (servicos.length) out.push({ iso, servicos });
    iso = proxDia(iso);
  }
  return out;
}
