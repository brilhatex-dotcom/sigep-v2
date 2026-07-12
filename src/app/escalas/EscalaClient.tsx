"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/* =========================================================================
   SIGEP-18BPM  ·  MODULO DE ESCALAS  (Escala de Servico diaria)  ·  v2 UX
   - MOTOR automatico: 24/72 (round-robin por pool, folga >=72h, pula afastados)
   - ROTEM: equipes fixas em blocos de 3 dias
   - NOVA UX:
     * Duas abas: "Escala do dia" (previa do rodizio + folha) e
       "Configuracao do motor" (cartoes-resumo por pool + editor focado)
     * Pools editados por CHIPS ordenaveis (setas + arrastar), com busca e
       sugestoes - fim dos textareas "um por linha"
     * Afastados aparecem riscados DENTRO do pool, com badge do tipo
     * Previa do rodizio: quem cobre cada funcao hoje / +1 / +2
     * Alerta de conflito do dia (escalado durante afastamento)
     * Datas de referencia escondidas em "Configuracao avancada"
   - Mesmas chaves de localStorage (sigep_cadastro / sigep_escalas):
     o Mapa de Escala continua lendo tudo sem mudanca.
   Tema app: SIGEP escuro. Folha impressa: branca, serifada, layout oficial.
   ========================================================================= */

/* ============================== TIPOS ============================== */

type PermutaStatus = null | "pendente" | "aprovada" | "negada";
type Slot = { titular: string; permuta: string | null; status?: PermutaStatus };
type Tipo = "normal" | "feriado" | "facultativo" | "extraordinaria" | "joe";

// Linha da tabela REFORÇO SEDE da escala extraordinaria (print 3).
type ReforcoLinha = { postoGrad: string; nome: string };

// Linha da escala da JOE/RENE (print 4, paisagem).
type JoeEscalaLinha = {
  nome: string; id: string; cpf: string;
  local: string; horario: string; funcao: string;
};

type Expediente = {
  horario: string;
  cmt: string;
  subcmt: string;
  cmtFt: string;
  p4: Slot[];
  p1: Slot[];
  rondaEscolar: Slot[];
  p3: Slot[];
  patrulha: Slot[];
};

type Escala = {
  data: string;
  tipo: Tipo;
  feriadoLabel: string;
  apresentacao: string;
  servicoHoras: string;
  dataConfeccao: string;
  expediente: Expediente;
  cpuDeDia: Slot;
  guardaPermanente: Slot[];
  rpAdjunto: Slot;
  rpMotorista: Slot;
  rpPatrulheiro: Slot[];
  inteligencia: Slot[];
  ftGraduado: Slot;
  ftMotorista: Slot;
  ftPatrulheiro: Slot;
  rotemHorarios: string[];
  rotemMilitares: Slot[];
  // ---- Escala Extraordinaria (tipo "extraordinaria", print 3) ----
  extraOperacao?: string;
  extraLocal?: string;
  extraHorario?: string;
  extraUniforme?: string;
  extraReforco?: ReforcoLinha[];
  // ---- Escala da JOE/RENE (tipo "joe", print 4, paisagem) ----
  joeId?: string;
  joeRows?: JoeEscalaLinha[];
};

type TipoAfastamento =
  | "ferias" | "missao" | "curso" | "licenca_premio"
  | "licenca_paternidade" | "jms" | "rotam" | "outro";

type Afastamento = {
  militar: string;
  tipo: TipoAfastamento;
  inicio: string;
  fim: string;
};

type EquipeRotem = { nome: string; turnos: string[]; militares: string[] };

type PoolKey =
  | "cpu" | "ftGraduado" | "ftMotorista" | "ftPatrulheiro"
  | "rpAdjunto" | "rpMotorista" | "rpPatrulheiro"
  | "guardaPermanente" | "inteligencia";

type Cadastro = {
  cpu: string[];
  ftGraduado: string[];
  ftMotorista: string[];
  ftPatrulheiro: string[];
  rpAdjunto: string[];
  rpMotorista: string[];
  rpPatrulheiro: string[];
  guardaPermanente: string[];
  inteligencia: string[];
  rotemEquipes: EquipeRotem[];
  afastamentos: Afastamento[];
  refRodizioISO: string;
  refCpuISO: string;
  refRotemISO: string;
  // Quadro por equipe A/B/C/D (editado no Mapa): quadroEquipes[letra][funcao] = ID.
  quadroEquipes?: Record<string, Record<string, string>>;
  // Linhas extras por funcao no quadro (ex.: 2o patrulheiro); vagas usam chave "<funcao>#2"...
  linhasExtras?: Record<string, number>;
};

type Brasoes = {
  pmma: string; ma: string; bpm: string; vistoCmt: string; assinaturaChefe: string;
};
type Chefe = { nome: string; funcao: string; assinatura?: string; assinarGov?: boolean; cmtAssinatura?: string };

/* Efetivo (Cadastro de Efetivo via Prisma). Os POOLS guardam o ID PMMA;
   o nome exibido/impresso e montado a partir da ficha em fmtMilitar(). */
type Militar = {
  id: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
  situacao: string;
  status: string;
  funcao?: string;
  lotacao?: string;
  quadro?: string;
  cpf?: string;
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

// Oficiais usam o QUADRO (QOEM/QOE/...) no lugar de "PM"; subtenente e praca nao.
function ehOficialAbbr(posto: string): boolean {
  if (/sub\s*ten/i.test(posto)) return false; // subtenente e praca
  return /\bTC\b|\bCel\b|\bMaj\b|\bCap\b|\bAsp\b|\d\S*\s*Ten/i.test(posto);
}

function fmtMilitar(m: Militar): string {
  let posto = abreviaPosto(m.postoGrad || "");
  const quadro = (m.quadro || "").trim().toUpperCase();
  if (quadro && ehOficialAbbr(posto)) posto = posto.replace(/\bPM\b/, quadro);
  const barra = (m.numeroBarra || "").trim();
  const guerra = capitalizaNome(m.nomeGuerra || m.nome || "");
  if (barraValida(barra)) return [posto, "n\u00ba", barra, guerra].filter(Boolean).join(" ").trim();
  return [posto, guerra].filter(Boolean).join(" ").trim();
}

// Divide o militar em (POST/GRAD, NOME) para a tabela REFOR\u00c7O SEDE (extraordinaria).
function fmtMilitarPartes(m: Militar): ReforcoLinha {
  let posto = abreviaPosto(m.postoGrad || "");
  const quadro = (m.quadro || "").trim().toUpperCase();
  if (quadro && ehOficialAbbr(posto)) posto = posto.replace(/\bPM\b/, quadro);
  const barra = (m.numeroBarra || "").trim();
  const postoGrad = barraValida(barra) ? [posto, "n\u00ba", barra].filter(Boolean).join(" ").trim() : posto;
  return { postoGrad, nome: capitalizaNome(m.nomeGuerra || m.nome || "") };
}

// CPF 00000000000 -> 000.000.000-00 (se nao tiver 11 digitos, devolve limpo).
function formatCpf(cpf: string): string {
  const so = (cpf || "").replace(/\D/g, "");
  if (so.length === 11) return `${so.slice(0, 3)}.${so.slice(3, 6)}.${so.slice(6, 9)}-${so.slice(9)}`;
  return (cpf || "").trim();
}

// JOE puxado da /api/joe (para a escala da JOE/RENE).
type JoeLite = {
  id: string;
  evento: string;
  local: string | null;
  data: string;
  horario?: string | null;
  candidatos?: {
    efetivoId: string | null;
    status: string;
    ficha: { nome?: string | null } | null;
    extNome?: string | null;
    extMatricula?: string | null;
  }[];
};

/* ============================== CONSTANTES ============================== */

const MESES_ACENTO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = [
  "DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA",
  "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO",
];
const DSEM_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const TIPOS_AFASTAMENTO: { v: TipoAfastamento; t: string; abbr: string }[] = [
  { v: "ferias", t: "Férias", abbr: "FÉR" },
  { v: "missao", t: "Missão", abbr: "MIS" },
  { v: "curso", t: "Curso", abbr: "CUR" },
  { v: "licenca_premio", t: "Licença Prêmio", abbr: "LP" },
  { v: "licenca_paternidade", t: "Licença Paternidade", abbr: "LPT" },
  { v: "jms", t: "JMS", abbr: "JMS" },
  { v: "rotam", t: "ROTAM", abbr: "RTM" },
  { v: "outro", t: "Outro", abbr: "AF" },
];
const LABEL_AF: Record<TipoAfastamento, string> = TIPOS_AFASTAMENTO.reduce(
  (acc, t) => ({ ...acc, [t.v]: t.abbr }),
  {} as Record<TipoAfastamento, string>
);

const POOLS_META: { key: PoolKey; label: string; cardLabel: string; grupo: string }[] = [
  { key: "cpu", label: "CPU de dia", cardLabel: "Oficial de dia", grupo: "CPU de dia (oficiais)" },
  { key: "guardaPermanente", label: "Guarda · Permanente", cardLabel: "Permanente", grupo: "Guarda do Quartel" },
  { key: "rpAdjunto", label: "RP · Adjunto de dia", cardLabel: "Adjunto de dia", grupo: "Rádio Patrulha" },
  { key: "rpMotorista", label: "RP · Motorista", cardLabel: "Motorista", grupo: "Rádio Patrulha" },
  { key: "rpPatrulheiro", label: "RP · Patrulheiro", cardLabel: "Patrulheiro", grupo: "Rádio Patrulha" },
  { key: "inteligencia", label: "Inteligência", cardLabel: "Inteligência 24h", grupo: "Inteligência" },
  { key: "ftGraduado", label: "FT · Graduado", cardLabel: "Graduado", grupo: "Força Tática" },
  { key: "ftMotorista", label: "FT · Motorista", cardLabel: "Motorista", grupo: "Força Tática" },
  { key: "ftPatrulheiro", label: "FT · Armeiro/Patrulheiro", cardLabel: "Armeiro/Patrulheiro", grupo: "Força Tática" },
];
const GRUPOS_ORDEM = Array.from(new Set(POOLS_META.map((p) => p.grupo)));

const ORG_TEXTO = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];

/* Cadastro semente: pools VAZIOS. O efetivo real vem de /api/efetivo e os
   militares sao selecionados pelo nome. Equipes ROTEM ja vem com turnos
   padrao para o usuario so encaixar os militares. */
const SEED_CADASTRO: Cadastro = {
  cpu: [],
  ftGraduado: [],
  ftMotorista: [],
  ftPatrulheiro: [],
  rpAdjunto: [],
  rpMotorista: [],
  rpPatrulheiro: [],
  guardaPermanente: [],
  inteligencia: [],
  rotemEquipes: [
    { nome: "Equipe A", turnos: ["07h \u00e0s 12h", "18h \u00e0s 23h"], militares: [] },
    { nome: "Equipe B", turnos: ["19h30min \u00e0s 02h"], militares: [] },
    { nome: "Equipe C", turnos: ["07h \u00e0s 12h", "18h \u00e0s 23h"], militares: [] },
  ],
  afastamentos: [],
  refRodizioISO: "2026-06-01",
  refCpuISO: "2026-06-01",
  refRotemISO: "2026-06-01",
};

/* ============================== MOTOR ============================== */

const DAY = 86400000;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function toISO(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}
function diasEntre(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
}
function proxDia(iso: string): string {
  return toISO(new Date(parseISO(iso).getTime() + DAY));
}
function diaAnteriorISO(iso: string): string {
  return toISO(new Date(parseISO(iso).getTime() - DAY));
}
function somaDias(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY));
}
function diaSemana(iso: string): string {
  return DIAS_SEMANA[parseISO(iso).getDay()];
}
function ehFimDeSemana(iso: string): boolean {
  const g = parseISO(iso).getDay();
  return g === 0 || g === 6;
}
function extensoUpper(iso: string): string {
  const dt = parseISO(iso);
  return `${String(dt.getDate()).padStart(2, "0")} DE ${MESES_ACENTO[
    dt.getMonth()
  ].toUpperCase()} DE ${dt.getFullYear()}`;
}
function extensoLow(iso: string): string {
  const dt = parseISO(iso);
  return `${String(dt.getDate()).padStart(2, "0")} de ${
    MESES_ACENTO[dt.getMonth()]
  } de ${dt.getFullYear()}`;
}
function brCurto(iso: string): string {
  if (!iso || iso.length < 10) return iso || "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function sobrenome(n: string): string {
  const t = n.trim().split(/\s+/);
  return t[t.length - 1] || n;
}

function afastado(nome: string, data: string, lista: Afastamento[]): boolean {
  return lista.some((a) => a.militar === nome && data >= a.inicio && data <= a.fim);
}
function afastamentoDe(nome: string, data: string, lista: Afastamento[]): Afastamento | null {
  return lista.find((a) => a.militar === nome && data >= a.inicio && data <= a.fim) || null;
}

// Rodizio 24/72: 1 dia de servico, folga >=72h. Round-robin justo, pula afastados.
function rodizio(
  pool: string[],
  qtd: number,
  dataAlvo: string,
  afast: Afastamento[],
  ref: string
): string[] {
  if (pool.length === 0 || dataAlvo < ref) return [];
  const ultimo: Record<string, string> = {};
  let alvo: string[] = [];
  const ordena = (arr: string[]) =>
    arr.slice().sort((x, y) => {
      const lx = ultimo[x] ? parseISO(ultimo[x]).getTime() : 0;
      const ly = ultimo[y] ? parseISO(ultimo[y]).getTime() : 0;
      if (lx !== ly) return lx - ly;
      return pool.indexOf(x) - pool.indexOf(y);
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

// ROTEM: equipes fixas em blocos de 3 dias.
function equipeRotem(data: string, equipes: EquipeRotem[], ref: string): EquipeRotem | null {
  if (equipes.length === 0) return null;
  const bloco = Math.floor(diasEntre(ref, data) / 3);
  const i = ((bloco % equipes.length) + equipes.length) % equipes.length;
  return equipes[i];
}

function s(titular = ""): Slot {
  return { titular, permuta: null, status: null };
}
function sList(nomes: string[]): Slot[] {
  return nomes.length ? nomes.map((n) => s(n)) : [s()];
}

function expedientePadrao(): Expediente {
  return {
    horario: "07h30 às 13h30min",
    cmt: "TC QOEM Flávio",
    subcmt: "Major QOEM Frans",
    cmtFt: "Major QOEM Paulo Roberto",
    p4: [
      s("Major QOE Herbert"),
      s("2º Sgt. PM nº 122/07- Júlio"),
      s("Cb PM n° 755/17 Josué"),
    ],
    p1: [s("3º Sgt PM nº 837/14 Moraes"), s("Cb PM nº 017/17 Elyanna")],
    rondaEscolar: [s("Cb. PM n° 126/15 F Santo"), s("Sd. PM nº 068/18 Edson")],
    p3: [
      s("1º Ten QOEM Joelson"),
      s("2º Sgt. PM nº 296/07- Saniety"),
      s("Cb. PM n° 748/14 Magalhães"),
    ],
    patrulha: [s("Cb PM nº 252/17- Francilea"), s("Sd PM nº 1089/18 Filho")],
  };
}

// Gera a escala do dia ja preenchida pelo motor (tudo continua editavel depois).
type NomeDe = (token: string) => string;

function novaEscala(iso: string, cad: Cadastro, nomeDe: NomeDe): Escala {
  // O motor trabalha com IDs; aqui convertemos para o nome formatado, pois
  // a folha e texto livre (editavel/imprimivel). nm() resolve ID -> nome.
  const nm = (id: string) => (id ? nomeDe(id) : "");
  const nmList = (ids: string[]) => (ids.length ? ids.map(nm) : []);

  const cpuId = rodizio(cad.cpu, 1, iso, cad.afastamentos, cad.refCpuISO)[0] || "";
  const cpuNome = nm(cpuId);
  const exp = expedientePadrao();
  // O oficial de CPU folga o expediente.
  exp.p1 = exp.p1.filter((x) => x.titular.trim() !== cpuNome.trim());
  exp.p3 = exp.p3.filter((x) => x.titular.trim() !== cpuNome.trim());

  const eq = equipeRotem(iso, cad.rotemEquipes, cad.refRotemISO);
  const r = cad.refRodizioISO;
  // O quadro A/B/C/D e a FONTE: a equipe do dia (ciclo 24/72) cobre cada funcao.
  const team = ["A", "B", "C", "D"][(((diasEntre(r, iso) % 4) + 4) % 4)];
  const q = cad.quadroEquipes || {};
  const dqNome = (fk: string) => { const id = q[team]?.[fk] || ""; return id ? nm(id) : ""; };
  // Titular + linhas extras (ex.: 2o patrulheiro) definidas no Mapa.
  const dqNomes = (fk: string) => {
    const out: string[] = [];
    const b = dqNome(fk); if (b) out.push(b);
    const n = cad.linhasExtras?.[fk] || 0;
    for (let k = 2; k <= n + 1; k++) { const id = q[team]?.[`${fk}#${k}`] || ""; if (id) out.push(nm(id)); }
    return out;
  };

  return {
    data: iso,
    tipo: "normal",
    feriadoLabel: "FERIADO",
    apresentacao: "08H",
    servicoHoras: "24 HORAS",
    dataConfeccao: diaAnteriorISO(iso),
    expediente: exp,
    cpuDeDia: s(cpuNome),
    guardaPermanente: sList(dqNomes("guardaPermanente")),
    rpAdjunto: s(dqNome("rpAdjunto")),
    rpMotorista: s(dqNome("rpMotorista")),
    rpPatrulheiro: sList(dqNomes("rpPatrulheiro")),
    inteligencia: sList(dqNomes("inteligencia")),
    ftGraduado: s(dqNome("ftGraduado")),
    ftMotorista: s(dqNome("ftMotorista")),
    ftPatrulheiro: s(dqNome("ftPatrulheiro")),
    rotemHorarios: eq ? eq.turnos.slice() : ["07h \u00e0s 12h", "18h \u00e0s 23h"],
    rotemMilitares: eq ? sList(nmList(eq.militares)) : [s(), s(), s()],
    extraOperacao: "",
    extraLocal: "",
    extraHorario: "",
    extraUniforme: "4\u00aaA (ARMADO E EQUIPADO)",
    extraReforco: [{ postoGrad: "", nome: "" }],
    joeId: "",
    joeRows: [],
  };
}

function s2(v: string): Slot {
  return { titular: v, permuta: null, status: null };
}

function refDoPool(key: PoolKey, cad: Cadastro): string {
  return key === "cpu" ? cad.refCpuISO : cad.refRodizioISO;
}
function proximoDoPool(key: PoolKey, dataISO: string, cad: Cadastro): string {
  return rodizio(cad[key], 1, dataISO, cad.afastamentos, refDoPool(key, cad))[0] || "";
}

/* ============================== EDICAO EM LINHA (folha) ============================== */

// Remove tags HTML, devolvendo so o texto (para comparacoes e para o Mapa).
function semTags(html: string): string {
  if (!html) return "";
  if (html.indexOf("<") === -1) return html.trim();
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "").trim();
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").trim();
}

// Campo editavel rico: guarda innerHTML (negrito/italico/cor sobrevivem e
// imprimem). A barra flutuante (BarraFormatacao) age sobre a selecao.
function Editable({
  value, onChange, placeholder, className,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = (el: HTMLSpanElement | null) => {
    if (el && el.innerHTML !== (value || "")) el.innerHTML = value || "";
  };
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder || ""}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      className={"editavel " + (className || "")}
    />
  );
}

function SlotInline({ slot, onChange, semPermuta }: { slot: Slot; onChange: (s: Slot) => void; semPermuta?: boolean }) {
  const ativo = slot.permuta !== null;
  return (
    <span className="slot">
      <Editable value={slot.titular} placeholder="..." onChange={(v) => onChange({ ...slot, titular: v })} />
      {!semPermuta && (ativo ? (
        <span className="perm">
          {" "}(PERMUTA-{" "}
          <Editable value={slot.permuta ?? ""} placeholder="substituto" onChange={(v) => onChange({ ...slot, permuta: v })} />
          )
          <button className="no-print mini" title="remover permuta" onClick={() => onChange({ ...slot, permuta: null, status: null })}>×</button>
        </span>
      ) : (
        <button className="no-print mini add" title="adicionar permuta" onClick={() => onChange({ ...slot, permuta: "" })}>+ permuta</button>
      ))}
    </span>
  );
}

function SlotList({
  slots, onChange, center, centro, semPermuta,
}: { slots: Slot[]; onChange: (s: Slot[]) => void; center?: boolean; centro?: boolean; semPermuta?: boolean }) {
  const upd = (i: number, ns: Slot) => { const a = slots.slice(); a[i] = ns; onChange(a); };
  const rm = (i: number) => onChange(slots.filter((_, j) => j !== i));
  const add = () => onChange([...slots, s()]);
  return (
    <div className={centro ? "lista centro" : center ? "lista center" : "lista"}>
      {slots.map((sl, i) => (
        <div key={i} className="linha">
          <SlotInline slot={sl} onChange={(ns) => upd(i, ns)} semPermuta={semPermuta} />
          {slots.length > 1 && <button className="no-print mini" title="remover" onClick={() => rm(i)}>×</button>}
        </div>
      ))}
      <button className="no-print mini add" onClick={add}>+ adicionar</button>
    </div>
  );
}

function HorarioList({ horarios, onChange }: { horarios: string[]; onChange: (h: string[]) => void }) {
  const upd = (i: number, v: string) => { const a = horarios.slice(); a[i] = v; onChange(a); };
  const rm = (i: number) => onChange(horarios.filter((_, j) => j !== i));
  const add = () => onChange([...horarios, ""]);
  return (
    <div className="lista centro bold-italic">
      {horarios.map((h, i) => (
        <div key={i} className="linha">
          <Editable value={h} placeholder="00h às 00h" onChange={(v) => upd(i, v)} />
          {horarios.length > 1 && <button className="no-print mini" onClick={() => rm(i)}>×</button>}
        </div>
      ))}
      <button className="no-print mini add" onClick={add}>+ horário</button>
    </div>
  );
}

function BrasaoSlot({
  src, alt, onPick, w, h,
}: { src: string; alt: string; onPick: () => void; w: number; h: number }) {
  return (
    <div className="brasao" style={{ width: w, height: h }} onClick={onPick} title="Clique para enviar imagem">
      {src ? <img src={src} alt={alt} /> : <span className="brasao-ph no-print">{alt}</span>}
    </div>
  );
}

/* Tabela REFORÇO SEDE da escala extraordinaria (print 3): ORD | POST/GRAD | NOME.
   Celulas editaveis; busca no efetivo preenche uma linha automaticamente. */
function ReforcoTabela({
  linhas, onChange, efetivo,
}: {
  linhas: ReforcoLinha[];
  onChange: (l: ReforcoLinha[]) => void;
  efetivo: Militar[];
}) {
  const upd = (i: number, patch: Partial<ReforcoLinha>) =>
    onChange(linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const rm = (i: number) => onChange(linhas.filter((_, j) => j !== i));
  const add = () => onChange([...linhas, { postoGrad: "", nome: "" }]);
  const addMilitar = (id: string) => {
    const m = efetivo.find((x) => x.id === id);
    if (!m) return;
    const p = fmtMilitarPartes(m);
    const iVazia = linhas.findIndex((l) => !l.postoGrad.trim() && !l.nome.trim());
    if (iVazia >= 0) upd(iVazia, p);
    else onChange([...linhas, p]);
  };

  return (
    <div className="reforco">
      <div className="reforco-add no-print">
        <SeletorMilitar efetivo={efetivo} exclude={[]} onPick={addMilitar} placeholder="Buscar militar para adicionar ao reforço..." />
      </div>
      <table className="tbl reforco-tbl"><tbody>
        <tr><td className="hd" colSpan={3}>REFORÇO SEDE</td></tr>
        <tr>
          <td className="lbl reforco-ord">ORD</td>
          <td className="lbl">POST/GRAD</td>
          <td className="lbl">NOME</td>
        </tr>
        {linhas.map((l, i) => (
          <tr key={i}>
            <td className="reforco-ord">{String(i + 1).padStart(2, "0")}</td>
            <td className="val-c"><Editable value={l.postoGrad} placeholder="posto/grad" onChange={(v) => upd(i, { postoGrad: v })} /></td>
            <td className="val-c reforco-nome-cell">
              <Editable value={l.nome} placeholder="nome" onChange={(v) => upd(i, { nome: v })} />
              {linhas.length > 1 && <button className="no-print mini" title="remover" onClick={() => rm(i)}>×</button>}
            </td>
          </tr>
        ))}
      </tbody></table>
      <button className="no-print mini add" onClick={add}>+ adicionar linha</button>
    </div>
  );
}

/* Tabela paisagem da escala da JOE/RENE (print 4):
   Nº | NOME COMPLETO | ID | CPF | LOCAL DE EMPREGO | HORÁRIO DA JORNADA | FUNÇÃO. */
function JoeEscalaTabela({ rows, onChange }: { rows: JoeEscalaLinha[]; onChange: (r: JoeEscalaLinha[]) => void }) {
  const upd = (i: number, patch: Partial<JoeEscalaLinha>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const rm = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { nome: "", id: "", cpf: "", local: "", horario: "", funcao: "" }]);
  return (
    <div className="joe-esc">
      <table className="tbl joe-esc-tbl"><tbody>
        <tr>
          <td className="lbl joe-c-ord">Nº</td>
          <td className="lbl">NOME COMPLETO</td>
          <td className="lbl joe-c-id">ID</td>
          <td className="lbl joe-c-cpf">CPF</td>
          <td className="lbl">LOCAL DE EMPREGO</td>
          <td className="lbl">HORÁRIO DA JORNADA</td>
          <td className="lbl">FUNÇÃO DESEMPENHADA</td>
        </tr>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="joe-c-ord">{String(i + 1).padStart(2, "0")}</td>
            <td className="val-c"><Editable value={r.nome} placeholder="nome completo" onChange={(v) => upd(i, { nome: v })} /></td>
            <td className="val-c"><Editable value={r.id} placeholder="ID" onChange={(v) => upd(i, { id: v })} /></td>
            <td className="val-c"><Editable value={r.cpf} placeholder="CPF" onChange={(v) => upd(i, { cpf: v })} /></td>
            <td className="val-c"><Editable value={r.local} placeholder="local" onChange={(v) => upd(i, { local: v })} /></td>
            <td className="val-c"><Editable value={r.horario} placeholder="horário" onChange={(v) => upd(i, { horario: v })} /></td>
            <td className="val-c joe-func-cell">
              <Editable value={r.funcao} placeholder="função" onChange={(v) => upd(i, { funcao: v })} />
              {rows.length > 0 && <button className="no-print mini" title="remover" onClick={() => rm(i)}>×</button>}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={7} className="joe-esc-vazio">Selecione uma JOE acima para montar a escala.</td></tr>
        )}
      </tbody></table>
      <button className="no-print mini add" onClick={add}>+ adicionar linha</button>
    </div>
  );
}

/* ============================== CONFIGURACAO (nova UX) ============================== */

function BadgeAfast({ a }: { a: Afastamento }) {
  return (
    <span className="chip-af" title={`${LABEL_AF[a.tipo]} de ${brCurto(a.inicio)} a ${brCurto(a.fim)}`}>
      {LABEL_AF[a.tipo]} até {brCurto(a.fim)}
    </span>
  );
}

/* Busca no efetivo real (Prisma) e devolve o ID PMMA escolhido.
   E o que substitui a digitacao: o usuario so seleciona. */
function SeletorMilitar({
  efetivo, exclude, onPick, placeholder,
}: {
  efetivo: Militar[];
  exclude: string[];
  onPick: (id: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const ex = new Set(exclude);
    return efetivo
      .filter((m) => !ex.has(m.id))
      .filter((m) => (fmtMilitar(m) + " " + (m.matricula || "")).toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, efetivo, exclude]);

  const escolher = (id: string) => { onPick(id); setQ(""); setAberto(false); };

  return (
    <div className="sel-mil">
      <input
        value={q}
        placeholder={placeholder || "Buscar militar por nome ou matricula..."}
        onChange={(e) => { setQ(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && resultados[0]) { e.preventDefault(); escolher(resultados[0].id); } }}
      />
      {aberto && q.trim() !== "" && (
        <div className="sel-mil-list">
          {resultados.length === 0 && <div className="sel-mil-vazio">Nenhum militar encontrado.</div>}
          {resultados.map((m) => (
            <button key={m.id} className="sel-mil-item" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(m.id)}>
              <span className="sel-mil-nome">{fmtMilitar(m)}</span>
              {m.matricula && <span className="sel-mil-mat">mat {m.matricula}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Lista de chips ordenaveis: a ordem visual = ordem do rodizio.
   Reordena com setas ou arrastando. Afastados aparecem riscados. */
function PoolChips({
  valor, onChange, afastamentos, dataRef, efetivo, nomeDe, efMap,
}: {
  valor: string[];
  onChange: (v: string[]) => void;
  afastamentos: Afastamento[];
  dataRef: string;
  efetivo: Militar[];
  nomeDe: NomeDe;
  efMap: Record<string, Militar>;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= valor.length) return;
    const a = valor.slice();
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  const rm = (i: number) => onChange(valor.filter((_, j) => j !== i));
  const add = (id: string) => {
    if (!id || valor.includes(id)) return;
    onChange([...valor, id]);
  };
  const onDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); return; }
    const a = valor.slice();
    const [mv] = a.splice(dragIdx, 1);
    a.splice(i, 0, mv);
    onChange(a);
    setDragIdx(null);
  };

  return (
    <div className="chips-wrap">
      <div className="chips-add">
        <SeletorMilitar efetivo={efetivo} exclude={valor} onPick={add} />
      </div>

      <div className="chips">
        {valor.map((id, i) => {
          const af = afastamentoDe(id, dataRef, afastamentos);
          const fora = !efMap[id]; // token antigo que nao casou com o efetivo
          return (
            <div
              key={id + i}
              className={"chip" + (af ? " off" : "") + (dragIdx === i ? " dragging" : "")}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              onDragEnd={() => setDragIdx(null)}
              title="Arraste para reordenar (ordem = rodizio)"
            >
              <span className="chip-grip">⋮⋮</span>
              <span className="chip-num">{i + 1}</span>
              <span className={"chip-nome" + (af ? " riscado" : "")}>{nomeDe(id)}</span>
              {af && <BadgeAfast a={af} />}
              {fora && <span className="chip-fora" title="Nome antigo que nao bate com o Cadastro de Efetivo. Remova e selecione o militar pela busca.">fora do efetivo</span>}
              <span className="chip-btns">
                <button title="subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button title="descer" disabled={i === valor.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="del" title="remover" onClick={() => rm(i)}>×</button>
              </span>
            </div>
          );
        })}
        {valor.length === 0 && <div className="chips-vazio">Vazio. Busque um militar acima para adicionar.</div>}
      </div>

      <div className="chips-hint">
        A posição do cartão define a ordem do rodízio 24/72. Afastados ficam riscados e são pulados automaticamente pelo motor.
      </div>
    </div>
  );
}

function PoolCard({
  titulo, total, nAfast, proximo, ativo, onClick,
}: {
  titulo: string;
  total: number;
  nAfast: number;
  proximo: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button className={"pcard" + (ativo ? " on" : "")} onClick={onClick}>
      <div className="pcard-top">
        <span className="pcard-titulo">{titulo}</span>
        <span className={"pcard-badge" + (nAfast > 0 ? " warn" : "")}>
          {total}{nAfast > 0 ? ` · ${nAfast} afast.` : ""}
        </span>
      </div>
      <div className="pcard-prox">
        Próximo: <b>{proximo ? sobrenome(proximo) : "-"}</b>
      </div>
      <div className="pcard-edit">{ativo ? "▲ fechar edição" : "✎ editar ordem"}</div>
    </button>
  );
}

function EquipeRotemCard({
  eq, ativaHoje, onChange, onRemove, efetivo, nomeDe, efMap, afastamentos, dataRef,
}: {
  eq: EquipeRotem;
  ativaHoje: boolean;
  onChange: (patch: Partial<EquipeRotem>) => void;
  onRemove: () => void;
  efetivo: Militar[];
  nomeDe: NomeDe;
  efMap: Record<string, Militar>;
  afastamentos: Afastamento[];
  dataRef: string;
}) {
  const updTurno = (i: number, v: string) => {
    const a = eq.turnos.slice(); a[i] = v; onChange({ turnos: a });
  };
  const rmTurno = (i: number) => onChange({ turnos: eq.turnos.filter((_, j) => j !== i) });
  const addTurno = () => onChange({ turnos: [...eq.turnos, "07h às 12h"] });

  return (
    <div className={"eq-card" + (ativaHoje ? " hoje" : "")}>
      <div className="eq-top">
        <input className="eq-nome" value={eq.nome} placeholder="Nome da equipe" onChange={(e) => onChange({ nome: e.target.value })} />
        {ativaHoje && <span className="eq-tag">de serviço na data</span>}
        <button className="btn danger" onClick={onRemove}>remover</button>
      </div>
      <div className="eq-body">
        <div className="eq-col">
          <label>Turnos</label>
          {eq.turnos.map((t, i) => (
            <div key={i} className="eq-turno">
              <input value={t} placeholder="00h às 00h" onChange={(e) => updTurno(i, e.target.value)} />
              {eq.turnos.length > 1 && <button className="btn danger" onClick={() => rmTurno(i)}>×</button>}
            </div>
          ))}
          <button className="btn" onClick={addTurno}>+ turno</button>
        </div>
        <div className="eq-col grow">
          <label>Militares da equipe</label>
          <PoolChips
            valor={eq.militares}
            onChange={(v) => onChange({ militares: v })}
            afastamentos={afastamentos}
            dataRef={dataRef}
            efetivo={efetivo}
            nomeDe={nomeDe}
            efMap={efMap}
          />
        </div>
      </div>
    </div>
  );
}

function AfastamentosEditor({
  afastamentos, onChange, efetivo, nomeDe, efMap,
}: {
  afastamentos: Afastamento[];
  onChange: (a: Afastamento[]) => void;
  efetivo: Militar[];
  nomeDe: NomeDe;
  efMap: Record<string, Militar>;
}) {
  const setAf = (i: number, patch: Partial<Afastamento>) =>
    onChange(afastamentos.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const rmAf = (i: number) => onChange(afastamentos.filter((_, j) => j !== i));
  const addAf = (id: string) => {
    if (!id || afastamentos.some((a) => a.militar === id)) return;
    onChange([...afastamentos, { militar: id, tipo: "ferias", inicio: "", fim: "" }]);
  };

  return (
    <div className="af-wrap">
      <div className="af-add">
        <SeletorMilitar
          efetivo={efetivo}
          exclude={afastamentos.map((a) => a.militar)}
          onPick={addAf}
          placeholder="Buscar militar para registrar afastamento..."
        />
      </div>
      {afastamentos.length > 0 && (
        <div className="af-head">
          <span className="af-c1">Militar</span>
          <span className="af-c2">Tipo</span>
          <span className="af-c3">Inicio</span>
          <span className="af-c3">Fim</span>
          <span className="af-c4" />
        </div>
      )}
      {afastamentos.map((a, i) => {
        const fora = a.militar.trim() !== "" && !efMap[a.militar];
        return (
          <div key={i} className="af-linha">
            <span className="af-c1 af-nome">
              <span className={fora ? "alerta-txt" : ""}>{nomeDe(a.militar)}</span>
              {fora && <span className="af-alerta" title="Nao bate com o Cadastro de Efetivo. Remova e selecione de novo pela busca.">⚠</span>}
            </span>
            <span className="af-c2">
              <select value={a.tipo} onChange={(e) => setAf(i, { tipo: e.target.value as TipoAfastamento })}>
                {TIPOS_AFASTAMENTO.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
              </select>
            </span>
            <span className="af-c3"><input type="date" value={a.inicio} onChange={(e) => setAf(i, { inicio: e.target.value })} /></span>
            <span className="af-c3"><input type="date" value={a.fim} onChange={(e) => setAf(i, { fim: e.target.value })} /></span>
            <span className="af-c4"><button className="btn danger" onClick={() => rmAf(i)}>×</button></span>
          </div>
        );
      })}
      {afastamentos.length === 0 && <div className="chips-vazio">Nenhum afastamento. Busque um militar acima para registrar.</div>}
      <div className="chips-hint">
        Quem esta afastado e pulado pelo motor em todas as funcoes e aparece riscado dentro dos pools.
      </div>
    </div>
  );
}

function ConfigMotor({
  cad, setCad, data, efetivo, nomeDe, efMap, efErro,
}: {
  cad: Cadastro;
  setCad: (c: Cadastro) => void;
  data: string;
  efetivo: Militar[];
  nomeDe: NomeDe;
  efMap: Record<string, Militar>;
  efErro: string | null;
}) {
  const [poolAberto, setPoolAberto] = useState<PoolKey | null>(null);
  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const up = (patch: Partial<Cadastro>) => setCad({ ...cad, ...patch });

  const eqHoje = equipeRotem(data, cad.rotemEquipes, cad.refRotemISO);

  const setEquipe = (i: number, patch: Partial<EquipeRotem>) =>
    up({ rotemEquipes: cad.rotemEquipes.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const addEquipe = () =>
    up({ rotemEquipes: [...cad.rotemEquipes, { nome: "Nova equipe", turnos: ["07h às 12h"], militares: [] }] });
  const rmEquipe = (i: number) => up({ rotemEquipes: cad.rotemEquipes.filter((_, j) => j !== i) });

  const metaAberta = POOLS_META.find((p) => p.key === poolAberto) || null;

  return (
    <div className="cfg no-print">
      {efErro && (
        <div className="ef-banner erro">
          Nao consegui ler o Cadastro de Efetivo (/api/efetivo): {efErro}. Verifique a rota e os imports de prisma/auth.
        </div>
      )}
      {!efErro && efetivo.length === 0 && (
        <div className="ef-banner info">Carregando efetivo do Cadastro...</div>
      )}
      {!efErro && efetivo.length > 0 && (
        <div className="ef-banner ok">
          {efetivo.length} militares carregados do Cadastro de Efetivo. Busque pelo nome ou matricula \u2014 nao precisa digitar.
        </div>
      )}
      {/* ---- Pools por bloco de servico (igual a folha) ---- */}
      <div className="cfg-sec">
        <div className="cfg-sec-titulo">Quem entra no rodízio</div>
        <div className="cfg-sec-sub">
          Organizado igual à folha da escala. Cada cartão mostra o tamanho da lista, quantos estão afastados na data e quem é o próximo da vez. Clique para abrir e reordenar.
        </div>
        {GRUPOS_ORDEM.map((g) => {
          const metas = POOLS_META.filter((p) => p.grupo === g);
          const editorAqui = !!poolAberto && !!metaAberta && metaAberta.grupo === g;
          return (
            <div key={g} className="grupo-srv">
              <div className="grupo-srv-titulo">{g}</div>
              <div className="pcards">
                {metas.map((meta) => {
                  const pool = cad[meta.key];
                  const nAfast = pool.filter((n) => afastado(n, data, cad.afastamentos)).length;
                  return (
                    <PoolCard
                      key={meta.key}
                      titulo={meta.cardLabel}
                      total={pool.length}
                      nAfast={nAfast}
                      proximo={nomeDe(proximoDoPool(meta.key, data, cad))}
                      ativo={poolAberto === meta.key}
                      onClick={() => setPoolAberto(poolAberto === meta.key ? null : meta.key)}
                    />
                  );
                })}
              </div>
              {editorAqui && metaAberta && (
                <div className="pool-editor">
                  <div className="pool-editor-top">
                    <span className="pool-editor-titulo">✎ {metaAberta.label}</span>
                    <button className="btn" onClick={() => setPoolAberto(null)}>Fechar</button>
                  </div>
                  <PoolChips
                    valor={cad[poolAberto as PoolKey]}
                    onChange={(v) => up({ [poolAberto as PoolKey]: v } as Partial<Cadastro>)}
                    afastamentos={cad.afastamentos}
                    dataRef={data}
                    efetivo={efetivo}
                    nomeDe={nomeDe}
                    efMap={efMap}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- ROTEM ---- */}
      <div className="cfg-sec">
        <div className="cfg-sec-titulo">ROTEM · equipes fixas</div>
        <div className="cfg-sec-sub">
          As equipes giram em blocos de 3 dias, na ordem dos cartões abaixo. A equipe destacada é a que cobre a data selecionada.
        </div>
        {cad.rotemEquipes.map((eq, i) => (
          <EquipeRotemCard
            key={i}
            eq={eq}
            ativaHoje={!!eqHoje && eqHoje.nome === eq.nome}
            onChange={(patch) => setEquipe(i, patch)}
            onRemove={() => rmEquipe(i)}
            efetivo={efetivo}
            nomeDe={nomeDe}
            efMap={efMap}
            afastamentos={cad.afastamentos}
            dataRef={data}
          />
        ))}
        <button className="btn" onClick={addEquipe}>+ adicionar equipe</button>
      </div>

      {/* ---- Afastamentos ---- */}
      <div className="cfg-sec">
        <div className="cfg-sec-titulo">Afastamentos ({cad.afastamentos.length})</div>
        <div className="cfg-sec-sub">Quem é pulado pelo motor no período informado.</div>
        <AfastamentosEditor
          afastamentos={cad.afastamentos}
          onChange={(a) => up({ afastamentos: a })}
          efetivo={efetivo}
          nomeDe={nomeDe}
          efMap={efMap}
        />
      </div>

      {/* ---- Avancado ---- */}
      <div className="cfg-sec">
        <button className="cfg-avancado-toggle" onClick={() => setAvancadoAberto((v) => !v)}>
          {avancadoAberto ? "▾" : "▸"} Configuração avançada · datas de referência
        </button>
        {avancadoAberto && (
          <div className="cfg-avancado">
            <div className="cfg-aviso">
              ⚠ Alterar estas datas reinicia a contagem do rodízio a partir do novo dia.
              Só mexa aqui se souber exatamente o que está fazendo.
            </div>
            <div className="cfg-refs">
              <label>Início rodízio 24/72
                <input type="date" value={cad.refRodizioISO} onChange={(e) => up({ refRodizioISO: e.target.value })} />
              </label>
              <label>Início rodízio CPU
                <input type="date" value={cad.refCpuISO} onChange={(e) => up({ refCpuISO: e.target.value })} />
              </label>
              <label>Início equipes ROTEM
                <input type="date" value={cad.refRotemISO} onChange={(e) => up({ refRotemISO: e.target.value })} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== PREVIA DO RODIZIO ============================== */

function PreviaRodizio({ cad, data, nomeDe }: { cad: Cadastro; data: string; nomeDe: NomeDe }) {
  const [aberta, setAberta] = useState(true);
  const dias = [data, somaDias(data, 1), somaDias(data, 2)];

  return (
    <div className="previa no-print">
      <button className="previa-toggle" onClick={() => setAberta((v) => !v)}>
        {aberta ? "▾" : "▸"} Prévia do rodízio · quem cobre cada função nos próximos 3 dias
      </button>
      {aberta && (
        <div className="previa-scroll">
          <table className="previa-tab">
            <thead>
              <tr>
                <th className="pv-srv">Serviço</th>
                {dias.map((iso, i) => (
                  <th key={iso} className={i === 0 ? "pv-hoje" : ""}>
                    {brCurto(iso)} <span className="pv-dsem">{DSEM_CURTO[parseISO(iso).getDay()]}</span>
                    {i === 0 && <span className="pv-tag">selecionado</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POOLS_META.map((meta) => (
                <tr key={meta.key}>
                  <td className="pv-srv">{meta.label}</td>
                  {dias.map((iso, i) => {
                    const nome = nomeDe(proximoDoPool(meta.key, iso, cad));
                    return (
                      <td key={iso} className={i === 0 ? "pv-hoje" : ""} title={nome}>
                        {nome ? sobrenome(nome) : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="pv-srv">ROTEM (equipe)</td>
                {dias.map((iso, i) => {
                  const eq = equipeRotem(iso, cad.rotemEquipes, cad.refRotemISO);
                  return (
                    <td key={iso} className={i === 0 ? "pv-hoje" : ""} title={eq ? eq.militares.map(nomeDe).join(", ") : ""}>
                      {eq ? eq.nome : "-"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================== PAGINA ============================== */

/* ===== Barra flutuante de formatacao (aparece ao selecionar texto na folha) =====
   Usa a formatacao nativa do navegador (execCommand). O que aparece e o que
   imprime. Negrito/italico/sublinhado/tamanho/cor ficam salvos no innerHTML
   da slot; o alinhamento e aplicado na celula (efeito imediato, para o PDF). */

const CORES_TEXTO = ["#000000", "#b3261e", "#1d6f3a", "#1456a0", "#7a5a17"];
const CORES_REALCE = ["#fff3a3", "#c8f0d2", "#cfe2ff", "#ffd6d6", "#e7d9ff"];

function BarraFormatacao() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [paleta, setPaleta] = useState<null | "cor" | "realce">(null);
  const barraRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dentroDaBarra = (n: Node | null) =>
      !!(n && barraRef.current && barraRef.current.contains(n));

    const atualizar = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (!paleta) { setPos(null); }
        return;
      }
      const node = sel.anchorNode;
      if (dentroDaBarra(node)) return;
      const host = node && (node.nodeType === 3 ? node.parentElement : (node as HTMLElement));
      if (!host || !host.closest || !host.closest(".editavel")) { setPos(null); setPaleta(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
    };

    const esconder = () => { setPos(null); setPaleta(null); };
    document.addEventListener("selectionchange", atualizar);
    window.addEventListener("scroll", esconder, true);
    window.addEventListener("resize", esconder);
    return () => {
      document.removeEventListener("selectionchange", atualizar);
      window.removeEventListener("scroll", esconder, true);
      window.removeEventListener("resize", esconder);
    };
  }, [paleta]);

  if (!pos) return null;

  const cmd = (c: string, v?: string) => {
    try { document.execCommand("styleWithCSS", false, "true"); } catch {}
    document.execCommand(c, false, v);
  };

  const alinhar = (al: "left" | "center" | "right" | "justify") => {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode;
    const host = node && (node.nodeType === 3 ? node.parentElement : (node as HTMLElement));
    const td = host && host.closest ? (host.closest("td") as HTMLElement | null) : null;
    if (!td) return;
    td.style.textAlign = al;
    const just = al === "center" ? "center" : al === "right" ? "flex-end" : al === "justify" ? "space-between" : "flex-start";
    const ali = al === "center" ? "center" : al === "right" ? "flex-end" : "flex-start";
    td.querySelectorAll<HTMLElement>(".lista").forEach((l) => { l.style.alignItems = ali; });
    td.querySelectorAll<HTMLElement>(".linha").forEach((l) => { l.style.justifyContent = just; });
  };

  const Btn = ({ on, title, children }: { on: () => void; title: string; children: ReactNode }) => (
    <button className="fmt-btn" title={title} onClick={on}>{children}</button>
  );

  return createPortal(
    <div
      ref={barraRef}
      className="fmt-bar no-print"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Btn title="Negrito" on={() => cmd("bold")}><b>N</b></Btn>
      <Btn title="Italico" on={() => cmd("italic")}><i>I</i></Btn>
      <Btn title="Sublinhado" on={() => cmd("underline")}><u>S</u></Btn>
      <span className="fmt-sep" />
      <Btn title="Diminuir fonte" on={() => cmd("fontSize", "2")}>A-</Btn>
      <Btn title="Fonte normal" on={() => cmd("fontSize", "3")}>A</Btn>
      <Btn title="Aumentar fonte" on={() => cmd("fontSize", "5")}>A+</Btn>
      <span className="fmt-sep" />
      <Btn title="Alinhar a esquerda" on={() => alinhar("left")}>☰←</Btn>
      <Btn title="Centralizar" on={() => alinhar("center")}>☰</Btn>
      <Btn title="Alinhar a direita" on={() => alinhar("right")}>→☰</Btn>
      <Btn title="Justificar" on={() => alinhar("justify")}>≡</Btn>
      <span className="fmt-sep" />
      <Btn title="Cor do texto" on={() => setPaleta(paleta === "cor" ? null : "cor")}><span className="fmt-cor">A</span></Btn>
      <Btn title="Realce" on={() => setPaleta(paleta === "realce" ? null : "realce")}><span className="fmt-realce">✎</span></Btn>

      {paleta && (
        <div className="fmt-paleta">
          {(paleta === "cor" ? CORES_TEXTO : CORES_REALCE).map((c) => (
            <button
              key={c}
              className="fmt-swatch"
              style={{ background: c }}
              title={c}
              onClick={() => { cmd(paleta === "cor" ? "foreColor" : "hiliteColor", c); setPaleta(null); }}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

export default function EscalaClient() {
  const [cad, setCad] = useState<Cadastro>(SEED_CADASTRO);
  const [escalas, setEscalas] = useState<Record<string, Escala>>({});
  const [data, setData] = useState<string>("2026-06-10");
  const [aba, setAba] = useState<"dia" | "config" | "chefe">("dia");
  // Brasoes: arquivos fixos do sistema (public/brasoes) \u2014 aparecem em todos os PCs.
  const [brasoes, setBrasoes] = useState<Brasoes>({
    pmma: "/brasoes/pmma-190.jpg",
    ma: "/brasoes/armas-ma.png",
    bpm: "/brasoes/brasao-18bpm.png",
    vistoCmt: "/brasoes/assinatura-cmt.png",
    assinaturaChefe: "/brasoes/assinatura-joelson.png",
  });
  // Chefe do P/1: carregado do servidor (aba "Chefe do P1"), igual em todo PC.
  const [chefe, setChefe] = useState<Chefe>({ nome: "1\u00ba TEN QOEM JOELSON DOS REIS SILVA", funcao: "CHEFE DO P/1 DO 18\u00ba BPM", assinatura: "/brasoes/assinatura-joelson.png", assinarGov: false, cmtAssinatura: "/brasoes/assinatura-cmt.png" });
  const [chefeSalvando, setChefeSalvando] = useState(false);
  const [chefeMsg, setChefeMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [efErro, setEfErro] = useState<string | null>(null);
  const [migrado, setMigrado] = useState(false);
  const [joeLista, setJoeLista] = useState<JoeLite[]>([]);

  const cadSaveTimer = useRef<any>(null);
  const ultimoCadSalvo = useRef<string>("");
  const escalasSaveTimer = useRef<any>(null);
  const ultimoEscalasSalvo = useRef<string>("{}");

  useEffect(() => {
    try {
      const qd = new URLSearchParams(window.location.search).get("data");
      if (qd && /^\d{4}-\d{2}-\d{2}$/.test(qd)) setData(qd);
    } catch {}
    // Dias salvos vem do servidor (migra o localStorage antigo se preciso).
    (async () => {
      try {
        const r = await fetch("/api/escala-dias");
        const d = r.ok ? await r.json() : null;
        if (d && d.escalas && Object.keys(d.escalas).length > 0) {
          setEscalas(d.escalas);
          ultimoEscalasSalvo.current = JSON.stringify(d.escalas);
          return;
        }
      } catch {}
      try {
        const eLS = localStorage.getItem("sigep_escalas");
        if (eLS) {
          const parsed = JSON.parse(eLS);
          setEscalas(parsed);
          ultimoEscalasSalvo.current = JSON.stringify(parsed);
          fetch("/api/escala-dias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escalas: parsed }) }).catch(() => {});
        }
      } catch {}
    })();
    // Equipes/afastamentos vem do servidor (migra o localStorage antigo se preciso).
    (async () => {
      try {
        const r = await fetch("/api/escala-config");
        const d = r.ok ? await r.json() : null;
        if (d && d.cad) {
          setCad(d.cad);
          ultimoCadSalvo.current = JSON.stringify(d.cad);
          setReady(true);
          return;
        }
      } catch {}
      try {
        const cLS = localStorage.getItem("sigep_cadastro");
        if (cLS) {
          const parsed = JSON.parse(cLS);
          setCad(parsed);
          ultimoCadSalvo.current = JSON.stringify(parsed);
          fetch("/api/escala-config", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cad: parsed }),
          }).catch(() => {});
        } else {
          ultimoCadSalvo.current = JSON.stringify(SEED_CADASTRO);
        }
      } catch { ultimoCadSalvo.current = JSON.stringify(SEED_CADASTRO); }
      setReady(true);
    })();
  }, []);

  // Salva as equipes no servidor (debounce) + backup local.
  useEffect(() => {
    if (!ready) return;
    const s = JSON.stringify(cad);
    if (s === ultimoCadSalvo.current) return;
    if (cadSaveTimer.current) clearTimeout(cadSaveTimer.current);
    cadSaveTimer.current = setTimeout(() => {
      ultimoCadSalvo.current = s;
      fetch("/api/escala-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cad }),
      }).catch(() => {});
      try { localStorage.setItem("sigep_cadastro", s); } catch {}
    }, 800);
  }, [cad, ready]);

  // Salva os dias no servidor (debounce) + backup local.
  useEffect(() => {
    if (!ready) return;
    const s = JSON.stringify(escalas);
    if (s === ultimoEscalasSalvo.current) return;
    if (escalasSaveTimer.current) clearTimeout(escalasSaveTimer.current);
    escalasSaveTimer.current = setTimeout(() => {
      ultimoEscalasSalvo.current = s;
      fetch("/api/escala-dias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escalas }) }).catch(() => {});
      try { localStorage.setItem("sigep_escalas", s); } catch {}
    }, 900);
  }, [escalas, ready]);

  // Atualizacao ao vivo: puxa dias e equipes do servidor (15s + foco da aba),
  // aplicando so quando nao ha edicao local pendente (nao apaga o que voce edita).
  const cadRefLive = useRef(cad); cadRefLive.current = cad;
  const escalasRefLive = useRef(escalas); escalasRefLive.current = escalas;
  useEffect(() => {
    const puxar = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/escala-dias");
        if (r.ok) {
          const d = await r.json();
          if (d && d.escalas) {
            const s = JSON.stringify(d.escalas);
            if (JSON.stringify(escalasRefLive.current) === ultimoEscalasSalvo.current && s !== ultimoEscalasSalvo.current) {
              ultimoEscalasSalvo.current = s; setEscalas(d.escalas);
            }
          }
        }
      } catch {}
      try {
        const r = await fetch("/api/escala-config");
        if (r.ok) {
          const d = await r.json();
          if (d && d.cad) {
            const s = JSON.stringify(d.cad);
            if (JSON.stringify(cadRefLive.current) === ultimoCadSalvo.current && s !== ultimoCadSalvo.current) {
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

  // Chefe do P/1: vem do servidor (aba "Chefe do P1"), igual em todos os PCs.
  useEffect(() => {
    fetch("/api/escala-chefe")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && (d.nome || d.funcao)) {
          setChefe({
            nome: d.nome || "",
            funcao: d.funcao || "",
            assinatura: d.assinatura || "",
            assinarGov: d.assinarGov === true,
            cmtAssinatura: d.cmtAssinatura || "/brasoes/assinatura-cmt.png",
          });
        }
      })
      .catch(() => {});
  }, []);

  // sobe a imagem da assinatura do chefe (guardada como data URL, salva no servidor)
  const pickAssinaturaChefe = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => setChefe((c) => ({ ...c, assinatura: String(r.result) }));
      r.readAsDataURL(f);
    };
    inp.click();
  };

  // sobe a assinatura do Cmt (VISTO), guardada no servidor junto com o chefe.
  const pickCmtAssinatura = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => setChefe((c) => ({ ...c, cmtAssinatura: String(r.result) }));
      r.readAsDataURL(f);
    };
    inp.click();
  };

  const salvarChefe = async () => {
    setChefeSalvando(true);
    setChefeMsg(null);
    try {
      const r = await fetch("/api/escala-chefe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chefe),
      });
      const d = await r.json().catch(() => ({}));
      setChefeMsg(r.ok ? "Chefe salvo. Aparece em todos os computadores." : (d.error || "Falha ao salvar."));
    } catch {
      setChefeMsg("Falha ao salvar.");
    } finally {
      setChefeSalvando(false);
      setTimeout(() => setChefeMsg(null), 4000);
    }
  };

  // Carrega o efetivo real do Cadastro (Prisma) via API.
  useEffect(() => {
    let vivo = true;
    fetch("/api/efetivo")
      .then((r) => (r.ok ? r.json() : Promise.reject("HTTP " + r.status)))
      .then((d) => { if (vivo) setEfetivo((d.efetivo || d || []) as Militar[]); })
      .catch((err) => { if (vivo) setEfErro(String(err)); });
    return () => { vivo = false; };
  }, []);

  // Carrega os JOE (para a escala da JOE/RENE). Admin ve os candidatos.
  useEffect(() => {
    let vivo = true;
    fetch("/api/joe")
      .then((r) => (r.ok ? r.json() : Promise.reject("HTTP " + r.status)))
      .then((d) => { if (vivo) setJoeLista((d.joe || []) as JoeLite[]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const efMap = useMemo(() => {
    const m: Record<string, Militar> = {};
    for (const x of efetivo) m[x.id] = x;
    return m;
  }, [efetivo]);

  // ID -> nome formatado. Se o token nao for um ID conhecido, devolve ele
  // mesmo (compatibilidade com dados antigos baseados em texto).
  const nomeDe = useMemo<NomeDe>(() => {
    return (token: string) => {
      if (!token) return "";
      const m = efMap[token];
      return m ? fmtMilitar(m) : token;
    };
  }, [efMap]);

  // Converte um token antigo (nome em texto) para o ID PMMA correspondente.
  const migraToken = useMemo(() => {
    return (token: string): string => {
      if (!token || efMap[token]) return token; // ja e ID
      const t = token.trim();
      const barra = t.match(/\d{1,4}\/\d{2}/);
      if (barra) {
        const hit = efetivo.find((m) => (m.numeroBarra || "").trim() === barra[0]);
        if (hit) return hit.id;
      }
      const exato = efetivo.find((m) => fmtMilitar(m) === t);
      if (exato) return exato.id;
      const porMat = efetivo.find((m) => (m.matricula || "").trim() && t.includes((m.matricula || "").trim()));
      if (porMat) return porMat.id;
      return token; // mantem como esta (aparece marcado "fora do efetivo")
    };
  }, [efetivo, efMap]);

  // Migra UMA vez, quando o efetivo chega: nomes antigos -> IDs.
  useEffect(() => {
    if (!ready || migrado || efetivo.length === 0) return;
    setCad((prev) => {
      const conv = (arr: string[]) => arr.map(migraToken);
      return {
        ...prev,
        cpu: conv(prev.cpu),
        ftGraduado: conv(prev.ftGraduado),
        ftMotorista: conv(prev.ftMotorista),
        ftPatrulheiro: conv(prev.ftPatrulheiro),
        rpAdjunto: conv(prev.rpAdjunto),
        rpMotorista: conv(prev.rpMotorista),
        rpPatrulheiro: conv(prev.rpPatrulheiro),
        guardaPermanente: conv(prev.guardaPermanente),
        inteligencia: conv(prev.inteligencia),
        rotemEquipes: prev.rotemEquipes.map((eq) => ({ ...eq, militares: conv(eq.militares) })),
        afastamentos: prev.afastamentos.map((a) => ({ ...a, militar: migraToken(a.militar) })),
      };
    });
    setMigrado(true);
  }, [ready, migrado, efetivo, migraToken]);

  // nome formatado -> ID, para detectar conflito a partir do texto da folha.
  const nameToId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of efetivo) m[fmtMilitar(x)] = x.id;
    return m;
  }, [efetivo]);

  const e: Escala = escalas[data] ?? novaEscala(data, cad, nomeDe);

  const editE = (fn: (d: Escala) => void) => {
    setEscalas((prev) => {
      const base: Escala = prev[data] != null
        ? (JSON.parse(JSON.stringify(prev[data])) as Escala)
        : novaEscala(data, cad, nomeDe);
      fn(base);
      return { ...prev, [data]: base };
    });
  };

  const gerarAutomatica = () => setEscalas((prev) => ({ ...prev, [data]: novaEscala(data, cad, nomeDe) }));

  // Monta a escala da JOE (print 4) a partir dos aprovados do JOE selecionado.
  const montarDaJoe = (joeId: string) => {
    const joe = joeLista.find((j) => j.id === joeId);
    if (!joe) return;
    const aprovados = (joe.candidatos || []).filter((c) => c.status === "aprovado");
    const rows: JoeEscalaLinha[] = aprovados.map((c) => {
      const m = c.efetivoId ? efMap[c.efetivoId] : null;
      return {
        nome: m?.nome || c.ficha?.nome || c.extNome || "",
        id: c.efetivoId || c.extMatricula || "",
        cpf: m ? formatCpf(m.cpf || "") : "",
        local: joe.local || "",
        horario: joe.horario || "",
        funcao: "",
      };
    });
    editE((d) => {
      d.joeId = joeId;
      d.joeRows = rows;
      d.extraOperacao = joe.evento || "";
      d.extraLocal = joe.local || "";
      d.extraHorario = joe.horario || "";
      if (!d.extraUniforme) d.extraUniforme = "4ªA (ARMADO E EQUIPADO)";
    });
  };

  const pickBrasao = (key: keyof Brasoes) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => setBrasoes((b) => ({ ...b, [key]: String(r.result) })); r.readAsDataURL(f);
    };
    inp.click();
  };

  // Conflitos do dia: alguem escalado na folha enquanto afastado.
  const conflitosDoDia = useMemo(() => {
    const nomes: string[] = [];
    const checa = (sl?: Slot) => {
      if (!sl) return;
      const n = semTags(sl.titular || "");
      if (!n) return;
      const id = nameToId[n] || n; // resolve o nome da folha para ID, se possivel
      if (afastado(id, data, cad.afastamentos) && !nomes.includes(n)) nomes.push(n);
    };
    checa(e.cpuDeDia); checa(e.rpAdjunto); checa(e.rpMotorista);
    checa(e.ftGraduado); checa(e.ftMotorista); checa(e.ftPatrulheiro);
    e.guardaPermanente.forEach(checa); e.rpPatrulheiro.forEach(checa);
    e.inteligencia.forEach(checa); e.rotemMilitares.forEach(checa);
    return nomes;
  }, [e, data, cad.afastamentos, nameToId]);

  const fimDeSemana = ehFimDeSemana(data);
  const ehExtra = e.tipo === "extraordinaria";
  const ehJoe = e.tipo === "joe";
  const mostraExpediente = !fimDeSemana && !ehExtra && !ehJoe;
  const feriadoTexto =
    e.tipo === "facultativo"
      ? `PONTO FACULTATIVO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`
      : `FERIADO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`;
  const expedienteFeriado = e.tipo !== "normal";

  const escalaSalva = !!escalas[data];

  return (
    <div className="app-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <BarraFormatacao />

      {/* ---- Barra principal: o fluxo diario ---- */}
      <div className="toolbar no-print">
        <div className="tb-row">
          <span className="tb-title">SIGEP · Escala de Serviço</span>
          <label className="tb-field">Data<input type="date" value={data} onChange={(ev) => setData(ev.target.value)} /></label>
          <label className="tb-field">Tipo
            <select value={e.tipo} onChange={(ev) => editE((d) => { d.tipo = ev.target.value as Tipo; })}>
              <option value="normal">Normal</option>
              <option value="feriado">Feriado</option>
              <option value="facultativo">Ponto facultativo</option>
              <option value="extraordinaria">Extraordinária</option>
              <option value="joe">Escala da JOE (RENE)</option>
            </select>
          </label>
          {e.tipo !== "normal" && (
            <label className="tb-field">Motivo<input type="text" value={e.feriadoLabel} placeholder="ex: CORPUS CHRISTI" onChange={(ev) => editE((d) => { d.feriadoLabel = ev.target.value; })} /></label>
          )}
          <span className="tb-spacer" />
          <button className="btn gen" onClick={gerarAutomatica} title="Preenche a folha com o resultado do motor para esta data">⚡ Gerar escala</button>
          <button className="btn primary" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
        </div>
        <div className="tb-row tb-sub">
          <span className="tb-status">
            {escalaSalva
              ? <span className="st-chip ok" title="Esta data já foi gerada/editada e está salva">● Escala salva para {brCurto(data)}</span>
              : <span className="st-chip auto" title="Mostrando o resultado automático do motor; clique em Gerar escala para fixar">○ Prévia automática (não salva)</span>}
          </span>
          <span className="tb-cpu">CPU do dia: <b>{nomeDe(rodizio(cad.cpu, 1, data, cad.afastamentos, cad.refCpuISO)[0] || "") || "-"}</b></span>
          {fimDeSemana && <span className="tb-hint">Fim de semana · expediente não entra</span>}
          {conflitosDoDia.length > 0 && (
            <span className="st-chip conf" title={"Escalado durante afastamento: " + conflitosDoDia.join(", ")}>
              ⚠ {conflitosDoDia.length} conflito{conflitosDoDia.length > 1 ? "s" : ""} na folha
            </span>
          )}
        </div>
      </div>

      {/* ---- Abas ---- */}
      <div className="abas no-print">
        <button className={"aba-btn" + (aba === "dia" ? " on" : "")} onClick={() => setAba("dia")}>
          📄 Escala do dia
        </button>
        <button className={"aba-btn" + (aba === "config" ? " on" : "")} onClick={() => setAba("config")}>
          ⚙ Efetivo e equipes
        </button>
        <button className={"aba-btn" + (aba === "chefe" ? " on" : "")} onClick={() => setAba("chefe")}>
          👤 Chefe do P1
        </button>
        <a className="aba-btn link" href="/escalas/mapa">🗓 Mapa de Escala →</a>
      </div>

      {aba === "config" && <ConfigMotor cad={cad} setCad={setCad} data={data} efetivo={efetivo} nomeDe={nomeDe} efMap={efMap} efErro={efErro} />}

      {aba === "chefe" && (
        <div className="cfg no-print">
          <div className="cfg-sec">
            <div className="cfg-sec-titulo">Chefe do P/1 · quem assina a escala</div>
            <div className="cfg-sec-sub">
              Preencha uma vez: fica salvo no sistema e aparece na assinatura da escala em <b>todos os computadores</b>.
              Quando trocar o chefe, é só alterar aqui e salvar — sem mexer em banco de dados.
            </div>
            <div className="chefe-grid">
              <div className="chefe-form">
                <label>Nome (posto + nome)
                  <input
                    value={chefe.nome}
                    placeholder="ex: 1º TEN QOEM JOELSON DOS REIS SILVA"
                    onChange={(e) => setChefe((c) => ({ ...c, nome: e.target.value }))}
                  />
                </label>
                <label>Função / cargo
                  <input
                    value={chefe.funcao}
                    placeholder="ex: CHEFE DO P/1 DO 18º BPM"
                    onChange={(e) => setChefe((c) => ({ ...c, funcao: e.target.value }))}
                  />
                </label>
                <div className="chefe-acoes">
                  <button className="btn primary" disabled={chefeSalvando} onClick={salvarChefe}>
                    {chefeSalvando ? "Salvando..." : "💾 Salvar chefe"}
                  </button>
                  {chefeMsg && <span className="chefe-msg">{chefeMsg}</span>}
                </div>
              </div>

              <div className="chefe-ass">
                <div className="chefe-ass-tit">Assinatura do chefe</div>
                <label className="chefe-gov">
                  <input
                    type="checkbox"
                    checked={!!chefe.assinarGov}
                    onChange={(e) => setChefe((c) => ({ ...c, assinarGov: e.target.checked }))}
                  />
                  Assinar pelo Gov.br (sai em branco na escala)
                </label>

                {chefe.assinarGov ? (
                  <div className="chefe-gov-nota">
                    A assinatura sairá <b>em branco</b> na escala; o chefe assina digitalmente pelo Gov.br.
                  </div>
                ) : (
                  <>
                    <div className="chefe-ass-box">
                      {chefe.assinatura
                        ? <img src={chefe.assinatura} alt="assinatura" />
                        : <span className="chefe-ass-ph">sem assinatura (em branco)</span>}
                    </div>
                    <div className="chefe-ass-btns">
                      <button className="btn" onClick={pickAssinaturaChefe}>📤 Subir do PC</button>
                      {chefe.assinatura && (
                        <button className="btn danger" onClick={() => setChefe((c) => ({ ...c, assinatura: "" }))}>🗑 Remover</button>
                      )}
                    </div>
                    <div className="chefe-ass-dica">Salve o chefe para guardar a assinatura no sistema (todos os PCs).</div>
                  </>
                )}

                <div className="chefe-preview">
                  <span className="chefe-preview-lbl">Prévia na escala:</span>
                  {!chefe.assinarGov && chefe.assinatura && (
                    <img className="chefe-preview-img" src={chefe.assinatura} alt="assinatura" />
                  )}
                  <div className="chefe-preview-nome">{chefe.nome || "—"}</div>
                  <div className="chefe-preview-func">{chefe.funcao || "—"}</div>
                </div>
              </div>
            </div>

            <div className="chefe-cmt">
              <div className="chefe-ass-tit">Assinatura do Comandante (VISTO)</div>
              <div className="chefe-cmt-row">
                <div className="chefe-ass-box" style={{ maxWidth: 240 }}>
                  {chefe.cmtAssinatura
                    ? <img src={chefe.cmtAssinatura} alt="assinatura do Cmt" />
                    : <span className="chefe-ass-ph">sem assinatura (em branco)</span>}
                </div>
                <div className="chefe-cmt-acoes">
                  <button className="btn" onClick={pickCmtAssinatura}>📤 Trocar assinatura do Cmt</button>
                  {chefe.cmtAssinatura && (
                    <button className="btn danger" onClick={() => setChefe((c) => ({ ...c, cmtAssinatura: "" }))}>🗑 Remover</button>
                  )}
                  <span className="chefe-ass-dica">Sai no “VISTO” da escala e da escala semanal do CPU. Troque quando mudar o comando; salve para valer em todos os PCs.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {aba === "dia" && (
        <>
          <PreviaRodizio cad={cad} data={data} nomeDe={nomeDe} />

          <div className="paper-wrap">
            {ehJoe && <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4 landscape;margin:6mm}}" }} />}
            <div className={"doc-paper" + (ehJoe ? " landscape" : "")}>
              {/* Cabecalho */}
              <div className="hdr">
                <div className="hdr-left">
                  <BrasaoSlot src={brasoes.pmma} alt="190 anos PMMA" onPick={() => pickBrasao("pmma")} w={92} h={72} />
                </div>
                <div className="hdr-center">
                  <BrasaoSlot src={brasoes.ma} alt="Armas do MA" onPick={() => pickBrasao("ma")} w={72} h={78} />
                  <div className="orgtext">
                    {ORG_TEXTO.map((l, i) => <div key={i} className={i === 4 ? "org-strong" : ""}>{l}</div>)}
                  </div>
                </div>
                <div className="hdr-right">
                  <BrasaoSlot src={brasoes.bpm} alt="18º BPM" onPick={() => pickBrasao("bpm")} w={74} h={80} />
                </div>
              </div>

              <div className="titulo-wrap">
                <div className="visto-side">
                  <div className="visto">VISTO</div>
                  {chefe.cmtAssinatura
                    ? <img className="visto-img" src={chefe.cmtAssinatura} alt="assinatura Cmt" />
                    : <div className="visto-esp" />}
                  <div className="hdr-left-cargo">Cmt. do 18º BPM</div>
                </div>
                <div className="titulo">{(ehExtra || ehJoe) ? "ESCALA DE SERVIÇO EXTRAORDINÁRIA" : "ESCALA DE SERVIÇO"}</div>
              </div>
              <div className="subt">PARA O DIA {extensoUpper(data)} ({diaSemana(data)})</div>

              {/* ---------- EXTRAORDINARIA (print 3) / JOE-RENE (print 4) ---------- */}
              {(ehExtra || ehJoe) && (
                <div className="extra">
                  {ehJoe && (
                    <div className="joe-picker no-print">
                      <label>Montar a partir da JOE:
                        <select value={e.joeId || ""} onChange={(ev) => montarDaJoe(ev.target.value)}>
                          <option value="">— selecione uma JOE —</option>
                          {joeLista.map((j) => (
                            <option key={j.id} value={j.id}>{j.evento} · {brCurto(j.data)}</option>
                          ))}
                        </select>
                      </label>
                      {e.joeId && <button className="btn" onClick={() => montarDaJoe(e.joeId!)}>↻ Remontar</button>}
                    </div>
                  )}

                  <div className="extra-campos">
                    <div className="extra-linha"><span className="extra-lbl">OPERAÇÃO:</span> <Editable value={e.extraOperacao || ""} placeholder="ex: ANIVERSÁRIO DA CIDADE..." onChange={(v) => editE((d) => { d.extraOperacao = v; })} /></div>
                    <div className="extra-linha"><span className="extra-lbl">LOCAL:</span> <Editable value={e.extraLocal || ""} placeholder="ex: PRESIDENTE DUTRA-MA" onChange={(v) => editE((d) => { d.extraLocal = v; })} /></div>
                    <div className="extra-linha"><span className="extra-lbl">HORÁRIO:</span> <Editable value={e.extraHorario || ""} placeholder="ex: 21H NA SEDE DO 18º BPM" onChange={(v) => editE((d) => { d.extraHorario = v; })} /></div>
                    <div className="extra-linha"><span className="extra-lbl">UNIFORME:</span> <Editable value={e.extraUniforme || ""} placeholder="ex: 4ªA (ARMADO E EQUIPADO)" onChange={(v) => editE((d) => { d.extraUniforme = v; })} /></div>
                  </div>

                  {ehExtra && (
                    <ReforcoTabela linhas={e.extraReforco || []} onChange={(rows) => editE((d) => { d.extraReforco = rows; })} efetivo={efetivo} />
                  )}
                  {ehJoe && (
                    <JoeEscalaTabela rows={e.joeRows || []} onChange={(rows) => editE((d) => { d.joeRows = rows; })} />
                  )}
                </div>
              )}

              {/* EXPEDIENTE */}
              {mostraExpediente && (
                <table className="tbl"><tbody>
                  <tr><td className="hd" colSpan={4}>EXPEDIENTE <Editable value={e.expediente.horario} onChange={(v) => editE((d) => { d.expediente.horario = v; })} /></td></tr>
                  {expedienteFeriado ? (
                    <>
                      <tr><td className="lbl">CMT</td><td className="val feriado" rowSpan={4}>{feriadoTexto}</td><td className="lbl">SUBCMT</td><td className="val feriado" rowSpan={4}>{feriadoTexto}</td></tr>
                      <tr><td className="lbl">CMT FT</td><td className="lbl">P4</td></tr>
                      <tr><td className="lbl">P1</td><td className="lbl">RONDA ESCOLAR</td></tr>
                      <tr><td className="lbl">P3</td><td className="lbl">PATRULHA MARIA DA PENHA</td></tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <td className="lbl">CMT</td>
                        <td className="val val-c"><SlotInline semPermuta slot={s2(e.expediente.cmt)} onChange={(ns) => editE((d) => { d.expediente.cmt = ns.titular; })} /></td>
                        <td className="lbl">SUBCMT</td>
                        <td className="val val-c"><SlotInline semPermuta slot={s2(e.expediente.subcmt)} onChange={(ns) => editE((d) => { d.expediente.subcmt = ns.titular; })} /></td>
                      </tr>
                      <tr>
                        <td className="lbl">CMT FT</td>
                        <td className="val val-c"><SlotInline semPermuta slot={s2(e.expediente.cmtFt)} onChange={(ns) => editE((d) => { d.expediente.cmtFt = ns.titular; })} /></td>
                        <td className="lbl">P4</td>
                        <td className="val"><SlotList semPermuta center slots={e.expediente.p4} onChange={(arr) => editE((d) => { d.expediente.p4 = arr; })} /></td>
                      </tr>
                      <tr>
                        <td className="lbl">P1</td>
                        <td className="val"><SlotList semPermuta center slots={e.expediente.p1} onChange={(arr) => editE((d) => { d.expediente.p1 = arr; })} /></td>
                        <td className="lbl">RONDA ESCOLAR</td>
                        <td className="val"><SlotList semPermuta center slots={e.expediente.rondaEscolar} onChange={(arr) => editE((d) => { d.expediente.rondaEscolar = arr; })} /></td>
                      </tr>
                      <tr>
                        <td className="lbl">P3</td>
                        <td className="val"><SlotList semPermuta center slots={e.expediente.p3} onChange={(arr) => editE((d) => { d.expediente.p3 = arr; })} /></td>
                        <td className="lbl">PATRULHA MARIA DA PENHA</td>
                        <td className="val"><SlotList semPermuta center slots={e.expediente.patrulha} onChange={(arr) => editE((d) => { d.expediente.patrulha = arr; })} /></td>
                      </tr>
                    </>
                  )}
                </tbody></table>
              )}

              {!ehExtra && !ehJoe && (<>
              {/* SERVICO 24H */}
              <table className="tbl mt"><tbody>
                <tr><td className="lbl w-cpu">CPU DE DIA</td><td className="val"><SlotInline slot={e.cpuDeDia} onChange={(ns) => editE((d) => { d.cpuDeDia = ns; })} /></td></tr>

                <tr><td className="hd" colSpan={2}>GUARDA DO QUARTEL</td></tr>
                <tr><td className="lbl w-cpu">PERMANENTE</td><td className="val"><SlotList slots={e.guardaPermanente} onChange={(arr) => editE((d) => { d.guardaPermanente = arr; })} /></td></tr>

                <tr><td className="hd" colSpan={2}>RÁDIO PATRULHA</td></tr>
                <tr><td className="lbl w-cpu">ADJUNTO DE DIA</td><td className="val"><SlotInline slot={e.rpAdjunto} onChange={(ns) => editE((d) => { d.rpAdjunto = ns; })} /></td></tr>
                <tr><td className="lbl w-cpu">MOTORISTA</td><td className="val"><SlotInline slot={e.rpMotorista} onChange={(ns) => editE((d) => { d.rpMotorista = ns; })} /></td></tr>
                <tr><td className="lbl w-cpu">PATRULHEIRO</td><td className="val"><SlotList slots={e.rpPatrulheiro} onChange={(arr) => editE((d) => { d.rpPatrulheiro = arr; })} /></td></tr>

                <tr><td className="hd" colSpan={2}>SERVIÇO DE INTELIGÊNCIA 24 HRS</td></tr>
                <tr><td className="val" colSpan={2}><SlotList centro slots={e.inteligencia} onChange={(arr) => editE((d) => { d.inteligencia = arr; })} /></td></tr>

                <tr><td className="hd" colSpan={2}>FORÇA TÁTICA</td></tr>
                <tr><td className="lbl w-cpu">GRADUADO</td><td className="val"><SlotInline slot={e.ftGraduado} onChange={(ns) => editE((d) => { d.ftGraduado = ns; })} /></td></tr>
                <tr><td className="lbl w-cpu">MOTORISTA</td><td className="val"><SlotInline slot={e.ftMotorista} onChange={(ns) => editE((d) => { d.ftMotorista = ns; })} /></td></tr>
                <tr><td className="lbl w-cpu">PATRULHEIRO</td><td className="val"><SlotInline slot={e.ftPatrulheiro} onChange={(ns) => editE((d) => { d.ftPatrulheiro = ns; })} /></td></tr>

                <tr><td className="hd" colSpan={2}>ROTEM</td></tr>
                <tr>
                  <td className="lbl w-cpu rotem-h"><HorarioList horarios={e.rotemHorarios} onChange={(arr) => editE((d) => { d.rotemHorarios = arr; })} /></td>
                  <td className="val"><SlotList slots={e.rotemMilitares} onChange={(arr) => editE((d) => { d.rotemMilitares = arr; })} /></td>
                </tr>
              </tbody></table>

              <div className="rodape-local">Quartel do 18º BPM, em Presidente Dutra-MA, {extensoLow(e.dataConfeccao)}.</div>
              </>)}

              <div className="assinatura">
                {chefe.assinarGov ? (
                  <div className="ass-gov-espaco" />
                ) : (
                  chefe.assinatura ? (
                    <img className="ass-img" src={chefe.assinatura} alt="assinatura" />
                  ) : <div className="ass-gov-espaco" />
                )}
                <div className="ass-nome">{chefe.nome}</div>
                <div className="ass-funcao">{chefe.funcao}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== CSS ============================== */

const CSS = `
.app-shell{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }

.toolbar{ background:#0F1B2D; border:1px solid #1d2c44;
  border-radius:12px; padding:12px 14px; margin-bottom:12px; box-shadow:0 6px 24px rgba(0,0,0,.35); }
.tb-row{ display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px; }
.tb-sub{ margin-top:10px; padding-top:10px; border-top:1px solid #1d2c44; align-items:center; }
.tb-title{ font-weight:700; color:#D4AF37; letter-spacing:.3px; margin-right:6px; align-self:center; }
.tb-spacer{ flex:1; }
.tb-field{ display:flex; flex-direction:column; font-size:11px; color:#9fb0c7; gap:4px; }
.tb-field input, .tb-field select{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:13px; }
.tb-cpu{ font-size:13px; color:#cdd9ea; } .tb-cpu b{ color:#D4AF37; }
.tb-hint{ font-size:12px; color:#f0c674; }
.tb-status{ display:flex; align-items:center; }
.st-chip{ font-size:12px; border-radius:999px; padding:3px 10px; border:1px solid transparent; }
.st-chip.ok{ background:#10301f; color:#9fe6bd; border-color:#235b3c; }
.st-chip.auto{ background:#16243a; color:#9fb0c7; border-color:#2b3f63; }
.st-chip.conf{ background:#3a1414; color:#ffb3b3; border-color:#7a1f1f; font-weight:600; cursor:help; }

.btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 12px; font-size:13px; cursor:pointer; }
.btn:hover{ border-color:#D4AF37; }
.btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.btn.gen{ background:#1b3a2a; border-color:#2e6b48; color:#bff0d0; font-weight:700; }
.btn.gen:hover{ border-color:#46c47e; }
.btn.danger:hover{ border-color:#e06464; color:#ffb3b3; }

/* Abas */
.abas{ display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
.aba-btn{ background:#0F1B2D; color:#9fb0c7; border:1px solid #1d2c44; border-radius:10px 10px 0 0;
  padding:9px 16px; font-size:13.5px; cursor:pointer; border-bottom:2px solid transparent; text-decoration:none; }
.aba-btn:hover{ color:#E8EEF6; border-color:#2b3f63; }
.aba-btn.on{ color:#D4AF37; font-weight:700; border-bottom-color:#D4AF37; background:#13223a; }
.aba-btn.link{ margin-left:auto; border-radius:10px; }

/* Previa do rodizio */
.previa{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:10px 12px; margin-bottom:14px; }
.previa-toggle{ background:none; border:none; color:#D4AF37; font-size:13px; font-weight:700; cursor:pointer; padding:2px 0; }
.previa-scroll{ overflow:auto; margin-top:8px; }
.previa-tab{ border-collapse:collapse; font-size:12.5px; width:100%; }
.previa-tab th, .previa-tab td{ border:1px solid #1d2c44; padding:5px 9px; text-align:center; white-space:nowrap; }
.previa-tab th{ background:#13223a; color:#9fb0c7; font-weight:600; }
.previa-tab td{ background:#0a1424; color:#cdd9ea; }
.previa-tab .pv-srv{ text-align:left; background:#0F1B2D; color:#E8EEF6; font-weight:600; min-width:170px; }
.previa-tab .pv-hoje{ background:#1d1a0a !important; color:#f3df9d; }
.previa-tab th.pv-hoje{ color:#D4AF37; }
.pv-dsem{ font-size:10px; color:#6f82a0; margin-left:3px; }
.pv-tag{ display:block; font-size:9px; color:#D4AF37; font-weight:400; }

/* Configuracao */
.cfg{ display:flex; flex-direction:column; gap:14px; margin-bottom:14px; }
.cfg-sec{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.cfg-sec-titulo{ color:#D4AF37; font-weight:700; font-size:14px; }
.cfg-sec-sub{ color:#9fb0c7; font-size:12px; margin:4px 0 12px; }

.pcards{ display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:10px; }
.grupo-srv{ margin-bottom:16px; }
.grupo-srv:last-child{ margin-bottom:0; }
.grupo-srv-titulo{ font-size:12px; color:#D4AF37; font-weight:700; letter-spacing:.4px; margin:0 0 8px; padding-bottom:5px; border-bottom:1px solid #1d2c44; }
.pcard{ text-align:left; background:#13223a; border:1px solid #28395a; border-radius:10px; padding:11px 12px;
  cursor:pointer; color:#E8EEF6; display:flex; flex-direction:column; gap:6px; transition:border-color .12s; }
.pcard:hover{ border-color:#D4AF37; }
.pcard.on{ border-color:#D4AF37; background:#1a2a45; box-shadow:0 0 0 1px #D4AF37 inset; }
.pcard-top{ display:flex; justify-content:space-between; align-items:center; gap:8px; }
.pcard-titulo{ font-weight:700; font-size:13px; }
.pcard-badge{ font-size:11px; background:#10301f; color:#9fe6bd; border:1px solid #235b3c; border-radius:999px; padding:2px 8px; white-space:nowrap; }
.pcard-badge.warn{ background:#3a2c10; color:#f3df9d; border-color:#6b5320; }
.pcard-prox{ font-size:12px; color:#9fb0c7; } .pcard-prox b{ color:#E8EEF6; }
.pcard-edit{ font-size:11px; color:#6f82a0; }
.pcard.on .pcard-edit{ color:#D4AF37; }

.pool-editor{ margin-top:12px; border:1px solid #D4AF37; border-radius:10px; padding:12px; background:#0d1830; }
.pool-editor-top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.pool-editor-titulo{ color:#D4AF37; font-weight:700; font-size:13.5px; }

.chips-wrap{ display:flex; flex-direction:column; gap:8px; }
.chips-add{ display:flex; gap:8px; }
.sel-mil{ position:relative; flex:1; }
.sel-mil input{ width:100%; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.sel-mil input:focus{ outline:none; border-color:#D4AF37; }
.sel-mil-list{ position:absolute; z-index:30; left:0; right:0; top:calc(100% + 4px); background:#0d1830; border:1px solid #2b3f63; border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.5); max-height:280px; overflow:auto; }
.sel-mil-item{ display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%; text-align:left; background:none; border:0; border-bottom:1px solid #18263d; color:#E8EEF6; padding:8px 11px; font-size:13px; cursor:pointer; }
.sel-mil-item:last-child{ border-bottom:0; }
.sel-mil-item:hover{ background:#16243a; }
.sel-mil-nome{ flex:1; }
.sel-mil-mat{ font-size:11px; color:#6f82a0; white-space:nowrap; }
.sel-mil-vazio{ padding:9px 11px; font-size:12.5px; color:#6f82a0; }
.chip-fora{ font-size:10.5px; background:#3a1414; color:#ffb3b3; border:1px solid #7a1f1f; border-radius:999px; padding:2px 8px; white-space:nowrap; cursor:help; }
.ef-banner{ font-size:12.5px; border-radius:8px; padding:9px 12px; margin-bottom:12px; line-height:1.45; }
.ef-banner.ok{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.ef-banner.info{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }
.ef-banner.erro{ background:#3a1414; color:#ffb3b3; border:1px solid #7a1f1f; }
.af-add{ margin-bottom:10px; display:flex; }
.af-nome{ display:flex; align-items:center; gap:6px; font-size:13px; color:#E8EEF6; }
.af-nome .alerta-txt{ color:#ffb3b3; }
.chips-add input{ flex:1; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.chips{ display:flex; flex-direction:column; gap:5px; }
.chip{ display:flex; align-items:center; gap:9px; background:#13223a; border:1px solid #28395a; border-radius:8px; padding:6px 9px; }
.chip:hover{ border-color:#3d5580; }
.chip.dragging{ opacity:.5; border-style:dashed; }
.chip.off{ background:#10182a; }
.chip-grip{ color:#3d5580; cursor:grab; font-size:12px; letter-spacing:-2px; user-select:none; }
.chip-num{ width:21px; height:21px; min-width:21px; border-radius:50%; background:#2a2410; color:#D4AF37;
  font-size:11px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
.chip-nome{ flex:1; font-size:13px; }
.chip-nome.riscado{ text-decoration:line-through; color:#6f82a0; }
.chip-af{ font-size:10.5px; background:#3a2c10; color:#f3df9d; border:1px solid #6b5320; border-radius:999px; padding:2px 8px; white-space:nowrap; cursor:help; }
.chip-btns{ display:flex; gap:4px; }
.chip-btns button{ background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:6px;
  width:24px; height:24px; font-size:12px; cursor:pointer; line-height:1; }
.chip-btns button:hover:not(:disabled){ border-color:#D4AF37; color:#E8EEF6; }
.chip-btns button:disabled{ opacity:.3; cursor:default; }
.chip-btns button.del:hover{ border-color:#e06464; color:#ffb3b3; }
.chips-vazio{ font-size:12.5px; color:#6f82a0; padding:8px 2px; }
.chips-hint{ font-size:11.5px; color:#6f82a0; line-height:1.45; }

.eq-card{ border:1px solid #28395a; border-radius:10px; padding:12px; margin-bottom:10px; background:#13223a; }
.eq-card.hoje{ border-color:#2e6b48; box-shadow:0 0 0 1px #2e6b48 inset; }
.eq-top{ display:flex; gap:10px; align-items:center; margin-bottom:10px; }
.eq-nome{ flex:1; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13.5px; font-weight:600; }
.eq-tag{ font-size:11px; background:#10301f; color:#9fe6bd; border:1px solid #235b3c; border-radius:999px; padding:3px 10px; white-space:nowrap; }
.eq-body{ display:flex; gap:14px; flex-wrap:wrap; }
.eq-col{ display:flex; flex-direction:column; gap:6px; min-width:200px; }
.eq-col.grow{ flex:1; min-width:280px; }
.eq-col label{ font-size:11px; color:#9fb0c7; }
.eq-turno{ display:flex; gap:6px; }
.eq-turno input{ flex:1; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:12.5px; }

.af-wrap{ display:flex; flex-direction:column; gap:6px; }
.af-head{ display:flex; gap:8px; font-size:11px; color:#6f82a0; padding:0 2px; }
.af-linha{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.af-c1{ flex:1; min-width:230px; display:flex; align-items:center; gap:6px; }
.af-c1 input{ flex:1; }
.af-c2{ width:160px; } .af-c2 select{ width:100%; }
.af-c3{ width:140px; } .af-c3 input{ width:100%; }
.af-c4{ width:38px; }
.af-linha input, .af-linha select{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:12.5px; }
.af-linha input.alerta{ border-color:#a3672d; }
.af-alerta{ color:#f0c674; cursor:help; font-size:14px; }

.cfg-avancado-toggle{ background:none; border:none; color:#9fb0c7; font-size:13px; font-weight:600; cursor:pointer; padding:0; }
.cfg-avancado-toggle:hover{ color:#E8EEF6; }
.cfg-avancado{ margin-top:10px; }
.cfg-aviso{ font-size:12.5px; color:#f3df9d; background:#2a2410; border:1px solid #6b5320; border-radius:8px; padding:9px 12px; margin-bottom:10px; line-height:1.5; }
.cfg-refs{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
.cfg-refs label{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.cfg-refs input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:7px 9px; font-size:12.5px; }

/* Aba Chefe do P1 */
.chefe-grid{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }
@media (max-width: 760px){ .chefe-grid{ grid-template-columns:1fr; } }
.chefe-form{ display:flex; flex-direction:column; gap:12px; }
.chefe-form label{ display:flex; flex-direction:column; gap:5px; font-size:12px; color:#9fb0c7; }
.chefe-form input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:9px 11px; font-size:14px; }
.chefe-form input:focus{ outline:none; border-color:#D4AF37; }
.chefe-acoes{ display:flex; align-items:center; gap:12px; }
.chefe-msg{ font-size:12.5px; color:#9fe6bd; }
.chefe-ass{ display:flex; flex-direction:column; gap:10px; border:1px solid #1d2c44; border-radius:10px; padding:14px; background:#0d1830; }
.chefe-ass-tit{ font-size:12.5px; font-weight:700; color:#D4AF37; }
.chefe-gov{ display:flex; align-items:center; gap:8px; font-size:12.5px; color:#cdd9ea; cursor:pointer; }
.chefe-gov input{ width:16px; height:16px; accent-color:#D4AF37; }
.chefe-gov-nota{ font-size:12px; color:#f3df9d; background:#2a2410; border:1px solid #6b5320; border-radius:8px; padding:9px 11px; }
.chefe-ass-box{ background:#fff; border:1px solid #28395a; border-radius:8px; height:70px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.chefe-ass-box img{ max-width:100%; max-height:100%; object-fit:contain; }
.chefe-ass-ph{ font-size:12px; color:#9a9a9a; }
.chefe-ass-btns{ display:flex; gap:8px; }
.chefe-ass-dica{ font-size:11px; color:#6f82a0; }
.chefe-preview{ background:#0a1626; border:1px solid #28395a; border-radius:10px; padding:14px; text-align:center; }
.chefe-preview-lbl{ display:block; font-size:11px; color:#6f82a0; margin-bottom:8px; }
.chefe-preview-img{ max-height:46px; max-width:220px; object-fit:contain; display:block; margin:0 auto 4px; background:#fff; border-radius:4px; padding:2px; }
.chefe-preview-nome{ font-weight:700; color:#E8EEF6; font-size:14px; }
.chefe-preview-func{ color:#cdd9ea; font-size:13px; }
.chefe-cmt{ margin-top:16px; border-top:1px solid #1d2c44; padding-top:14px; }
.chefe-cmt-row{ display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-top:8px; }
.chefe-cmt-acoes{ display:flex; flex-direction:column; gap:6px; align-items:flex-start; }

/* Folha */
.paper-wrap{ display:flex; justify-content:center; }
.doc-paper{ background:#fff; color:#000; width:210mm; max-width:100%; padding:8mm 14mm;
  box-shadow:0 10px 40px rgba(0,0,0,.5); font-family:"Times New Roman", Georgia, serif; line-height:1.1; }

.hdr{ display:flex; gap:6px; align-items:flex-start; }
.hdr-left{ width:122px; text-align:center; font-size:11px; display:flex; flex-direction:column; align-items:center; }
.hdr-right{ width:92px; display:flex; justify-content:center; align-items:flex-start; }
.visto{ font-weight:700; }
.visto-img{ max-width:118px; max-height:44px; object-fit:contain; display:block; margin:0 auto; }
.visto-esp{ height:44px; }
.hdr-left-cargo{ font-weight:700; margin-top:2px; }
.titulo-wrap{ position:relative; }
.visto-side{ position:absolute; left:0; bottom:0; width:122px; text-align:center; font-size:11px; line-height:1.15; }
.hdr-center{ flex:1; text-align:center; display:flex; flex-direction:column; align-items:center; }
.orgtext{ font-size:13.5px; margin-top:4px; } .orgtext .org-strong{ font-weight:700; }
.brasao{ border:1px dashed #b9b9b9; display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; background:#fafafa; margin:0 auto; }
.brasao img{ max-width:100%; max-height:100%; object-fit:contain; }
.brasao-ph{ font-size:8px; color:#9a9a9a; text-align:center; padding:2px; }

.titulo{ text-align:center; font-weight:700; font-size:27px; text-decoration:underline; margin-top:6px; }
.subt{ text-align:center; font-weight:700; font-size:17px; text-decoration:underline; margin-top:4px; }
.subt2{ text-align:center; font-weight:700; font-size:15px; text-decoration:underline; margin:2px 0 8px; }

.tbl{ width:100%; border-collapse:collapse; table-layout:fixed; }
.tbl.mt{ margin-top:2px; }
.tbl td{ border:1px solid #000; padding:2px 6px; font-size:15px; vertical-align:top; }
.tbl .hd{ text-align:center; font-weight:700; }
.tbl .lbl{ font-weight:700; text-align:center; vertical-align:middle; }
.tbl .val{ font-style:italic; }
.tbl .val-c{ font-style:italic; text-align:center; vertical-align:middle; }
.tbl .feriado{ text-align:center; font-style:italic; font-weight:700; vertical-align:middle; }
.w-cpu{ width:30%; }
.rotem-h{ font-style:italic; font-weight:700; vertical-align:middle; }

/* Escala extraordinaria (print 3) */
.extra{ margin-top:8px; }
.extra-campos{ margin:8px 0 10px; }
.extra-linha{ font-size:15px; margin:4px 0; }
.extra-lbl{ font-weight:700; }
.extra-linha .editavel{ display:inline-block; min-width:260px; }
@media screen{ .extra-linha .editavel{ border-bottom:1px dotted #a9a9a9; padding-bottom:1px; } }
.reforco-add{ margin-bottom:8px; max-width:440px; }
.reforco-tbl{ margin-top:2px; }
.reforco-ord{ width:12%; text-align:center; font-weight:700; vertical-align:middle; font-style:normal; }
.reforco-nome-cell{ position:relative; }

/* Escala da JOE/RENE (print 4, paisagem) */
.doc-paper.landscape{ width:297mm; }
.joe-picker{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.joe-picker label{ display:flex; align-items:center; gap:8px; font-size:12px; color:#334; }
.joe-picker select{ background:#fff; color:#111; border:1px solid #99a; border-radius:8px; padding:7px 9px; font-size:13px; }
.joe-esc{ margin-top:6px; }
.joe-esc-tbl td{ font-size:12.5px; }
.joe-c-ord{ width:5%; text-align:center; font-weight:700; vertical-align:middle; font-style:normal; }
.joe-c-id{ width:9%; }
.joe-c-cpf{ width:13%; }
.joe-esc-vazio{ text-align:center; font-style:normal; color:#666; padding:10px; }

.lista{ display:flex; flex-direction:column; gap:1px; }
.lista.center{ align-items:flex-start; text-align:left; }
.lista.centro{ align-items:center; text-align:center; }
.lista.centro .linha{ justify-content:center; }
.lista.bold-italic{ font-weight:700; font-style:italic; }
.linha{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:flex-start; }
.slot{ display:inline; } .perm{ font-weight:700; }

.rodape-local{ text-align:center; font-size:15px; margin-top:10px; }
.assinatura{ text-align:center; margin-top:14px; }
.ass-img{ max-height:50px; max-width:240px; object-fit:contain; display:block; margin:0 auto 2px; }
.ass-gov-espaco{ height:50px; }
.ass-nome{ font-weight:700; font-size:15px; } .ass-funcao{ font-size:15px; }
.data-confec{ margin-top:18px; font-size:12px; color:#444; }
.data-confec input{ border:1px solid #bbb; border-radius:6px; padding:4px 6px; }

.editavel{ outline:none; min-width:8px; display:inline; }
.editavel:empty:before{ content:attr(data-ph); color:#b9b9b9; }
.mini{ font-size:10px; line-height:1; padding:1px 5px; margin-left:3px; border:1px solid #cfcfcf; background:#f3f3f3; color:#555; border-radius:5px; cursor:pointer; font-style:normal; font-weight:400; font-family: ui-sans-serif, system-ui, sans-serif; }
.mini:hover{ border-color:#888; }
.mini.add{ color:#1d6f3a; border-color:#bfe0c8; background:#eef8f1; }

.fmt-bar{ position:fixed; transform:translate(-50%, -100%); z-index:9999;
  display:flex; align-items:center; gap:2px; background:#0F1B2D; border:1px solid #2b3f63;
  border-radius:9px; padding:4px 6px; box-shadow:0 8px 28px rgba(0,0,0,.55); }
.fmt-bar::after{ content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:6px solid transparent; border-top-color:#0F1B2D; }
.fmt-btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:6px;
  min-width:26px; height:26px; padding:0 6px; font-size:13px; cursor:pointer; line-height:1;
  display:inline-flex; align-items:center; justify-content:center; font-family: ui-sans-serif, system-ui, sans-serif; }
.fmt-btn:hover{ border-color:#D4AF37; }
.fmt-sep{ width:1px; height:18px; background:#2b3f63; margin:0 3px; }
.fmt-cor{ font-weight:700; border-bottom:3px solid #b3261e; padding-bottom:1px; }
.fmt-realce{ background:#fff3a3; color:#222; border-radius:3px; padding:0 3px; }
.fmt-paleta{ position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%);
  display:flex; gap:5px; background:#0F1B2D; border:1px solid #2b3f63; border-radius:8px; padding:6px; }
.fmt-swatch{ width:22px; height:22px; border-radius:5px; border:1px solid #00000040; cursor:pointer; }
.fmt-swatch:hover{ outline:2px solid #D4AF37; }
@media screen{
  .editavel:hover{ background:rgba(212,175,55,.10); }
  .editavel:focus{ background:rgba(212,175,55,.18); }
}
@media print{
  @page{ size:A4; margin:6mm; }
  .tbl tr, .tbl td{ page-break-inside:avoid; }
  body{ background:#fff !important; }
  body *{ visibility:hidden !important; }
  .doc-paper, .doc-paper *{ visibility:visible !important; }
  .doc-paper{ position:absolute; left:0; top:0; width:100% !important; max-width:none !important; box-shadow:none !important; padding:0 !important; }
  .no-print{ display:none !important; }
  .editavel:empty:before{ content:"" !important; }
  .editavel:hover, .editavel:focus{ background:transparent !important; }
  .brasao{ border:none !important; background:transparent !important; }
}
`;
