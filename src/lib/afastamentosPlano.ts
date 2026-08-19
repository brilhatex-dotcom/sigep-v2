/* =========================================================================
   Montagem dos AFASTAMENTOS que o motor da escala (mapa mensal, diária e
   todas as abas) usa para tirar da escala quem está ausente.

   Está aqui, separado da rota, por um motivo prático: é a regra que decide
   se um militar aparece ou não no mapa, e regra dessas precisa poder ser
   testada sem banco.

   Fontes:
     1. plano de FÉRIAS (equipes + membros, dois períodos por equipe)
     2. plano de LICENÇA-PRÊMIO (equipes + membros, um período)
     3. FÉRIAS AVULSAS (datas soltas, Config "ferias_avulsas")
     4. JMS com data (JMS_DataInicio / JMS_DataRetorno na ficha)
     5. SITUAÇÃO da ficha que conta como afastamento (Agregação, LTIP,
        Licença, Reserva...) — sem data, vale de hoje em diante
   ========================================================================= */

export type TipoAfastamento =
  | "ferias" | "missao" | "curso" | "licenca_premio"
  | "licenca_paternidade" | "jms" | "rotam" | "outro";

export type Afastamento = {
  militar: string;
  tipo: TipoAfastamento;
  inicio: string; // ISO aaaa-mm-dd
  fim: string;    // ISO aaaa-mm-dd
  /* Nome e sigla vindos da situação da ficha, quando ela não cabe num dos
     tipos fixos (Agregação, LTIP, Reserva...). Sem isto tudo virava um
     genérico "AF / Afastado" e o escalante não sabia o motivo. */
  rotulo?: string;
  sigla?: string;
};

export function toISO(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  // ISO (aceita mês/dia com 1 ou 2 dígitos: 2026-7-25 ou 2026-07-25)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // BR dd/mm/aaaa (1 ou 2 dígitos)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // BR com traço dd-mm-aaaa
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Plano B: deixa o JS interpretar (mesma robustez do aviso de saídas).
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

export function addDiasISO(iso: string, n: number): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/* Deriva o FIM do período: usa o fim explícito; senão a apresentação menos 1
   dia (o militar volta na apresentação); senão assume 30 dias a partir do
   início. Assim, uma equipe com só a data de saída ainda remove o militar. */
export function fimPeriodo(inicio: string, fim: string, apres: string): string {
  if (fim) return fim;
  if (apres) return addDiasISO(apres, -1);
  if (inicio) return addDiasISO(inicio, 29);
  return "";
}

// a chave que amarra membro e equipe: as duas coisas, sempre
const chave = (numeroEquipe: unknown, anoGozo: unknown) =>
  `${String(numeroEquipe ?? "").trim()}|${String(anoGozo ?? "").trim()}`;

export type EquipeFeriasLite = {
  numeroEquipe: string; anoGozo: string;
  periodo1Inicio: string | null; periodo1Fim: string | null; periodo1Apres: string | null;
  periodo2Inicio: string | null; periodo2Fim: string | null; periodo2Apres: string | null;
};
export type EquipeLicencaLite = {
  numeroEquipe: string; anoGozo: string;
  periodoInicio: string | null; periodoFim: string | null;
};
export type MembroLite = { idPmma: string; numeroEquipe: string; anoGozo: string };
export type AvulsaLite = { idPmma?: string; inicio?: string; fim?: string };
export type FichaLite = {
  id: string;
  situacao?: string | null;
  jmsDataInicio?: string | null;
  jmsDataRetorno?: string | null;
};

export type Fontes = {
  equipesFerias: EquipeFeriasLite[];
  membrosFerias: MembroLite[];
  equipesLicenca: EquipeLicencaLite[];
  membrosLicenca: MembroLite[];
  avulsas: AvulsaLite[];
  adiados: Set<string>;
  fichas?: FichaLite[];
  /* diz se uma situação da ficha conta como afastamento (a lista é
     configurável pelo admin, por isso vem de fora) */
  situacaoAfasta?: (situacao: string | null | undefined) => boolean;
  /* hoje em ISO — as situações da ficha não têm data de início, então valem
     de hoje em diante (marcar para trás reescreveria escala já publicada) */
  hoje?: string;
};

// Situação da ficha -> tipo de afastamento do mapa (para a cor/sigla certa).
function tipoDaSituacao(situacao: string): TipoAfastamento {
  const v = situacao.toLowerCase();
  if (v.includes("jms")) return "jms";
  if (v.includes("prêmio") || v.includes("premio")) return "licenca_premio";
  if (v.includes("paternidade")) return "licenca_paternidade";
  if (v.includes("férias") || v.includes("ferias")) return "ferias";
  if (v.includes("curso")) return "curso";
  return "outro";
}

/* Sigla curta para a célula do mapa (o espaço é de 3 letras). Tira acento,
   corta em 3 — "Agregação" vira AGR, "Reserva" vira RES. */
function siglaDaSituacao(situacao: string): string {
  const limpo = situacao.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  return (limpo.slice(0, 3) || "AF").toUpperCase();
}

// horizonte para afastamento sem data de fim (situação da ficha): longe o
// bastante para cobrir qualquer mapa que se abra, e some assim que o P/1
// devolver a situação para "Pronto".
const SEM_FIM = "2099-12-31";

export function montarAfastamentos(f: Fontes): Afastamento[] {
  const out: Afastamento[] = [];

  /* ---- 1) FÉRIAS do plano -------------------------------------------
     A chave é numeroEquipe + anoGozo, SEM atalho por número solto.

     Já houve um atalho aqui (guardava também só pelo número da equipe, como
     rede de segurança) e ele fazia estrago assim que passou a existir mais de
     um ano de plano: a equipe 4 de 2027, aberta com as datas ainda em branco,
     não gravava chave nenhuma, e o membro dela caía no atalho e herdava as
     datas da equipe 4 de OUTRO ano. Resultado: militar que voltou das férias
     em agosto continuava aparecendo de férias em setembro, com a data de uma
     equipe que não era a dele. Ano sem datas preenchidas significa ninguém
     afastado — e é exatamente isso que acontece agora. */
  const perFerias = new Map<string, { inicio: string; fim: string }[]>();
  for (const e of f.equipesFerias) {
    const periodos: { inicio: string; fim: string }[] = [];
    const p1 = toISO(e.periodo1Inicio);
    if (p1) periodos.push({ inicio: p1, fim: fimPeriodo(p1, toISO(e.periodo1Fim), toISO(e.periodo1Apres)) });
    const p2 = toISO(e.periodo2Inicio);
    if (p2) periodos.push({ inicio: p2, fim: fimPeriodo(p2, toISO(e.periodo2Fim), toISO(e.periodo2Apres)) });
    if (periodos.length) perFerias.set(chave(e.numeroEquipe, e.anoGozo), periodos);
  }
  for (const m of f.membrosFerias) {
    // Quem ADIOU as férias do plano NÃO é afastado: segue no serviço normal.
    if (f.adiados.has(m.idPmma)) continue;
    for (const p of perFerias.get(chave(m.numeroEquipe, m.anoGozo)) || []) {
      if (p.inicio && p.fim) out.push({ militar: m.idPmma, tipo: "ferias", inicio: p.inicio, fim: p.fim });
    }
  }

  // ---- 2) LICENÇA-PRÊMIO do plano (um período por equipe) ----
  const perLicenca = new Map<string, { inicio: string; fim: string }>();
  for (const e of f.equipesLicenca) {
    const i = toISO(e.periodoInicio);
    if (i) perLicenca.set(chave(e.numeroEquipe, e.anoGozo), { inicio: i, fim: fimPeriodo(i, toISO(e.periodoFim), "") });
  }
  for (const m of f.membrosLicenca) {
    const p = perLicenca.get(chave(m.numeroEquipe, m.anoGozo));
    if (p?.inicio && p.fim) out.push({ militar: m.idPmma, tipo: "licenca_premio", inicio: p.inicio, fim: p.fim });
  }

  // ---- 3) FÉRIAS AVULSAS (datas soltas) ----
  for (const a of f.avulsas || []) {
    const i = toISO(a?.inicio), fi = toISO(a?.fim);
    if (a?.idPmma && i && fi) out.push({ militar: String(a.idPmma), tipo: "ferias", inicio: i, fim: fi });
  }

  const fichas = f.fichas || [];

  /* ---- 4) JMS com data ----------------------------------------------
     A ficha já guarda JMS_DataInicio e JMS_DataRetorno, e ninguém estava
     lendo: o militar em JMS continuava entrando na escala. O militar volta
     NA data de retorno, então o afastamento vai até o dia anterior. */
  for (const m of fichas) {
    const i = toISO(m.jmsDataInicio);
    if (!i) continue;
    const ret = toISO(m.jmsDataRetorno);
    const fim = ret ? addDiasISO(ret, -1) : SEM_FIM;
    if (fim >= i) out.push({ militar: m.id, tipo: "jms", inicio: i, fim });
  }

  /* ---- 5) SITUAÇÃO da ficha que conta como afastamento ---------------
     Agregação, LTIP, Licença, Reserva, atestado longo... A situação não
     guarda data nenhuma — é um estado de agora. Por isso vale de HOJE em
     diante: marcar para trás reescreveria escala já publicada. Some sozinho
     quando o P/1 devolve a situação para "Pronto". */
  const afasta = f.situacaoAfasta;
  const hoje = f.hoje;
  if (afasta && hoje) {
    // quem já tem período datado cobrindo hoje não precisa da marca aberta
    const jaCobertoHoje = new Set(
      out.filter((a) => hoje >= a.inicio && hoje <= a.fim).map((a) => a.militar)
    );
    for (const m of fichas) {
      const s = (m.situacao || "").trim();
      if (!s || !afasta(s)) continue;
      if (jaCobertoHoje.has(m.id)) continue;
      out.push({
        militar: m.id, tipo: tipoDaSituacao(s), inicio: hoje, fim: SEM_FIM,
        rotulo: s, sigla: siglaDaSituacao(s),
      });
    }
  }

  return out;
}
