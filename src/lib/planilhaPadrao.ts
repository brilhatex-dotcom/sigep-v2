import { classificarPatente } from "@/lib/patentes";
import { dataBR } from "@/lib/datas";
import { CERTIDOES_EXIGIDAS, TOTAL_CERTIDOES } from "@/lib/certidoes";
import type { DadosHistorico } from "@/lib/historicoPolicial";

/* =========================================================================
   PLANILHA PADRÃO DA PROMOÇÃO — Portaria nº 168/2026-CPPPM

   O que a portaria manda (art. 3º e 4º):
     · UMA planilha com os militares "de Soldado ao 1º Sargento mais antigo
       da Unidade" que estão dentro do Limite Quantitativo publicado em
       17/09/2026 (quem entra é gravado por período: planilhaPadraoDb.ts);
     · ela é o documento oficial único de Resumo Histórico e Ficha Conceito;
     · o P/1 confere as certidões "Nada Consta" e informa a situação final de
       cada militar — as certidões ficam arquivadas no P/1, só a planilha
       consolidada e assinada sobe para a Comissão (art. 4º, § 3º);
     · prazo: 06 de novembro de 2026.

   Por isso aqui o sistema monta a planilha SOZINHO com tudo o que ele já sabe,
   e deixa para o P/1 só o que depende de julgamento dele:

     ficha do efetivo  -> graduação, número, nome, matrícula, ID, instrução,
                          data de inclusão
     histórico policial-> QPMP, comportamento, cursos, situação administrativa
                          (punições/processos), medalhas, cursos de carreira
                          (CEFC/CEFS/CAP/EAP) quando o histórico os nomeia
     certidões         -> a coluna das certidões se ESCREVE conforme chegam:
                          quais faltam, pelo nome; "S/A" quando o P/1 dá o
                          recebido nas oito
     promoções lançadas-> data e boletim de cada promoção de praça
     planilha anterior -> o que o sistema não sabe (BG antigo, nota de curso,
                          elogios...), importado de uma planilha já feita
     P/1               -> ficha conceito, elogios, e qualquer correção

   Toda coluna calculada pode ser SOBRESCRITA pelo P/1 — a exatidão é de
   responsabilidade da Unidade (art. 4º, § 2º), então a última palavra é dele.
   A exceção são as colunas de identidade (graduação, nome, matrícula, ID):
   essas se corrigem na FICHA, senão a planilha passaria a dizer uma coisa e
   o cadastro outra.

   A ordem é a de ANTIGUIDADE (src/lib/antiguidade.ts), a mesma da tela
   "Efetivo por Antiguidade": não importa quem mandou as certidões primeiro,
   o 1º Sargento mais antigo abre a planilha.
   ========================================================================= */

export type Origem = "ficha" | "histórico" | "certidões" | "promoções" | "planilha anterior" | "P/1";

export type Coluna = {
  chave: string;
  titulo: string;              // exatamente como no modelo da CPPPM
  identidade?: boolean;        // corrige-se na ficha, não aqui
};

// As 24 colunas, na ORDEM e com os TÍTULOS do modelo oficial (linha 7).
export const COLUNAS: Coluna[] = [
  { chave: "grad", titulo: "GRAD", identidade: true },
  { chave: "num", titulo: "NÚM" },
  { chave: "nome", titulo: "NOME", identidade: true },
  { chave: "mat", titulo: "MAT.", identidade: true },
  { chave: "id", titulo: "ID", identidade: true },
  { chave: "instrucao", titulo: "INSTRUÇÃO" },
  { chave: "incl", titulo: " INCL." },
  { chave: "qpmp", titulo: "QPMP" },
  { chave: "comport", titulo: "COMPORT." },
  { chave: "sitJuridica", titulo: "SIT. JURÍDICA" },
  { chave: "certidoes", titulo: "CERTIDÕES 1º/2º GRAU, JME, TRF1, TRF2, TRF3, TRF4, TRF5" },
  { chave: "sitAdm", titulo: "SIT. ADMINISTRATIVA" },
  { chave: "cursos", titulo: "CURSOS (≥150h)" },
  { chave: "promCabo", titulo: "PROM. CABO" },
  { chave: "prom3", titulo: "PROM. 3º SGT" },
  { chave: "prom2", titulo: "PROM. 2º SGT" },
  { chave: "prom1", titulo: "PROM. 1º SGT" },
  { chave: "cefc", titulo: "CEFC" },
  { chave: "cefs", titulo: "CEFS" },
  { chave: "cap", titulo: "CAP" },
  { chave: "eap", titulo: "EAP" },
  { chave: "elogios", titulo: "ELOGIOS (QTD)" },
  { chave: "medalhas", titulo: "MEDALHAS / TÍTULO" },
  { chave: "conceito", titulo: "FICHA CONCEITO" },
];

/* ---------------------------------------------------------------- escopo */

// ordem de classificarPatente: 9 = 1º Sgt ... 13 = Soldado
const SIGLA: Record<number, string> = { 9: "1SGT", 10: "2SGT", 11: "3SGT", 12: "CB", 13: "SD" };

/* Só praça de Soldado a 1º Sargento entra (art. 3º). Subtenente e oficiais
   ficam de fora — têm outro rito. */
export function entraNaPlanilha(postoGrad: string | null): boolean {
  return classificarPatente(postoGrad).ordem in SIGLA;
}
export const siglaGrad = (postoGrad: string | null) => SIGLA[classificarPatente(postoGrad).ordem] || "";

/* ---------------------------------------------------------------- entrada */

export type FichaPlanilha = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  matricula: string | null;
  grauEscolaridade: string | null;
  dataIncorp: string | null;
  dataPromocao: string | null;
};

export type PromocaoLancada = { postoNovo: string | null; dataPromocao: string | null; referencia: string | null };

export type CertidoesDoMilitar = {
  enviadas: number[];          // ordens (1..8) que já chegaram
  recebidoPeloP1: boolean;     // o P/1 conferiu e deu o recebido
  enviadoAoP1: boolean;        // o militar já mandou ao P/1 (aguarda conferência)
};

export type EntradaLinha = {
  ficha: FichaPlanilha;
  historico: DadosHistorico | null;   // null = ainda não há histórico dele
  promocoes: PromocaoLancada[];
  certidoes: CertidoesDoMilitar;
  manual: Record<string, string>;     // o que o P/1 escreveu por cima
  referencia?: Record<string, string>; // o que veio da planilha de um ciclo anterior
};

export type Celula = { valor: string; origem: Origem; manual: boolean };

export type LinhaPlanilha = {
  efetivoId: string;
  celulas: Record<string, Celula>;
  pendencias: string[];               // o que ainda falta, em português
};

/* ---------------------------------------------------------------- regras */

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const data = (v: string | null) => { const d = dataBR(v); return d === "—" ? "" : d; };

// Texto do histórico que só repete o padrão do modelo não é informação.
const vazioOuPadrao = (t: string) => !t || /^(nada consta|sem altera[cç](ã|a)o(es|ões)?\.?|s\/a)\.?$/i.test(t.trim());

// Nome curto de cada certidão, para a coluna dizer QUAL falta.
const CURTO: Record<number, string> = {
  1: "TJMA 1º GRAU", 2: "TJMA 2º GRAU", 3: "JME", 4: "TRF1", 5: "TRF2", 6: "TRF3", 7: "TRF4", 8: "TRF5",
};

/* A coluna das certidões se escreve sozinha conforme elas chegam.

   O que o sistema SABE: quais das oito chegaram e se o P/1 deu o recebido.
   O que ele NÃO sabe: o que está escrito dentro do PDF. Por isso "S/A" só
   sai depois do recebido — é o P/1 que leu e atestou (art. 4º). Antes disso
   a coluna diz a verdade: em conferência, ou quais faltam pelo nome, que é
   exatamente a alínea "c" do § 1º ("informando a falta de certidão
   específica"). */
export function colunaCertidoes(c: CertidoesDoMilitar): { valor: string; pendente: string | null } {
  const chegaram = new Set(c.enviadas);
  if (chegaram.size === 0) return { valor: "CERTIDÕES NÃO ENVIADAS", pendente: "certidões não enviadas" };
  const faltam = CERTIDOES_EXIGIDAS.map((x) => x.ordem).filter((o) => !chegaram.has(o));
  if (faltam.length) {
    return {
      valor: `CERTIDÃO AUSENTE: ${faltam.map((o) => CURTO[o]).join(", ")}`,
      pendente: `falta${faltam.length > 1 ? "m" : ""} ${faltam.length} certidã${faltam.length > 1 ? "ões" : "o"}`,
    };
  }
  if (c.recebidoPeloP1) return { valor: "S/A", pendente: null };
  return {
    valor: "EM CONFERÊNCIA NO P/1",
    pendente: c.enviadoAoP1 ? "certidões aguardando a conferência do P/1" : "militar ainda não enviou ao P/1",
  };
}

/* Cursos de carreira (CEFC, CEFS, CAP, EAP).

   Na planilha da Unidade a célula diz SE fez e com que nota: "SIM/ 9,580";
   "SIM" quando o histórico nomeia o curso mas não traz a nota; "S/A" quando
   há histórico e ele não fala do curso. Sem histórico fica em branco — não
   se atesta o que ninguém conferiu.

   Só vale o que o histórico NOMEIA. Não se deduz CEFS de "CFS" — são cursos
   diferentes, e um palpite errado vira informação oficial falsa na mão da
   Comissão. A exceção é o CAS-PM: a própria Unidade usa a coluna como
   "CAP/CAS" (planilha de agosto/2026), e o histórico de praça tem campo
   próprio para ele (III, 3º item). */
const CURSO: Record<string, RegExp> = {
  CEFC: /\bCEFC\b|curso especial de forma[çc][ãa]o de cabos/i,
  CEFS: /\bCEFS\b|curso especial de forma[çc][ãa]o de sargentos/i,
  /* "CAP" e tambem a abreviatura de CAPITAO — "ministrado pelo CAP QOPM
     Fulano" nao e curso nenhum. Por isso a sigla so vale quando NAO vem
     seguida de quadro (QO..., PM). */
  CAP: /\bCAP\b(?!\s*(QO|PM\b))|curso de aperfei[çc]oamento de pra[çc]as|\bCAS\b|curso de aperfei[çc]oamento de sargentos/i,
  EAP: /\bEAP\b/,
};

/* A nota do curso, como a Unidade escreve: vírgula decimal ("9,580").
   Número de 0 a 10 com casas decimais; "200h" ou o ano não são nota. */
export function notaDoCurso(linha: string): string {
  const m = linha.match(/(?:^|[^\d/.,])(10(?:[.,]0{1,3})?|\d[.,]\d{1,3})(?![\d/]|\s*(?:h|hs|horas)\b)/i);
  return m ? m[1].replace(".", ",") : "";
}

function cursoDoHistorico(h: DadosHistorico | null, sigla: keyof typeof CURSO, praca: boolean): string {
  if (!h) return "";
  const re = CURSO[sigla];
  for (const chave of ["III.form1", "III.form2", "III.form3", "III.outros"]) {
    const texto = s(h.secoes[chave]);
    if (vazioOuPadrao(texto)) continue;
    const linhas = texto.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    let achada = linhas.find((l) => re.test(l));
    // o campo "CAS-PM / ANO" do histórico de praça É o CAS, mesmo sem a sigla
    if (!achada && sigla === "CAP" && praca && chave === "III.form3") achada = linhas[0];
    if (achada) {
      const nota = notaDoCurso(achada);
      return nota ? `SIM/ ${nota}` : "SIM";
    }
  }
  return "S/A";
}

/* Situação administrativa a partir das seções XII (processos) e XIII
   (punições) do histórico. Sem histórico, fica em branco — ausência de
   histórico NÃO é "nada consta", e escrever S/A para quem ninguém conferiu
   seria atestar o que não se viu. */
function sitAdministrativa(h: DadosHistorico | null): string {
  if (!h) return "";
  const punicoes = ["XIII.prisao", "XIII.detencao", "XIII.repreensao"].some((k) => !vazioOuPadrao(s(h.secoes[k])));
  const processo = !vazioOuPadrao(s(h.secoes["XII"]));
  const partes = [punicoes ? "PUNIÇÕES DISCIPLINARES" : "", processo ? "PROCESSO/CONSELHO (ver histórico, XII)" : ""].filter(Boolean);
  return partes.length ? partes.join("; ") : "S/A";
}

/* Medalhas: a planilha pede a QUANTIDADE (a da Unidade traz 1, 2...), não a
   descrição. Conta uma por linha escrita nas alíneas da seção X. */
function medalhas(h: DadosHistorico | null): string {
  if (!h) return "";
  let n = 0;
  for (const k of ["X.falcao", "X.merito", "X.estudo", "X.servico"]) {
    const t = s(h.secoes[k]);
    if (vazioOuPadrao(t)) continue;
    n += t.split(/\n+/).map((x) => x.trim()).filter((x) => x && !vazioOuPadrao(x)).length;
  }
  return n ? String(n) : "S/A";
}

/* ------------------------------------------------------------ promoções */

// ordem de classificarPatente -> coluna da planilha
const COLUNA_PROM: Record<number, string> = { 12: "promCabo", 11: "prom3", 10: "prom2", 9: "prom1" };
const NOME_PROM: Record<string, string> = { promCabo: "Cabo", prom3: "3º Sgt", prom2: "2º Sgt", prom1: "1º Sgt" };

function grauDaLinha(l: string): number {
  const t = l.toLowerCase();
  if (/\bcabo\b|\bcb\b/.test(t)) return 12;
  const m = t.match(/\b([123])\s*[º°o]?\s*(sargento|sgt)\b/);
  return m ? ({ "3": 11, "2": 10, "1": 9 } as Record<string, number>)[m[1]] : 0;
}

/* A seção IV do histórico ("PROMOÇÕES COM AS RESPECTIVAS DATAS E BG"), lida
   por graduação. O formato que corre na Unidade:
     a) Cabo PM:
     BI nº 028 de 15/07/2011 (11ª CI), publicou ..., transcrito do BG nº 129 de 12/07/2011;
   Dela sai o BOLETIM de cada promoção — e a data, quando vem "a contar de".
   É o que cobre as promoções antigas, de antes do SIGEP. */
export function lerSecaoPromocoes(texto: string): Record<string, { data: string; bg: string }> {
  const out: Record<string, { data: string; bg: string }> = {};
  let atual = "";
  let bloco: string[] = [];
  const fecha = () => {
    if (!atual || out[atual]) return;
    const b = bloco.join(" ");
    const bg = b.match(/\bBG\s*(?:n[º°o]\.?\s*)?(\d+)\s*,?\s*(?:de\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const dt = b.match(/a\s+contar\s+de\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    out[atual] = { data: dt ? dt[1] : "", bg: bg ? `BG nº ${bg[1]} de ${bg[2]}` : "" };
  };
  for (const linha of texto.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    // cabeçalho de alínea: "a) Cabo PM:" ou "b) - A 3º SARGENTO PM: a contar de ..."
    const alinea = /^[a-z]\)/i.test(linha);
    const coluna = COLUNA_PROM[grauDaLinha(linha)];
    if (alinea) {
      fecha();
      atual = coluna || "";
      bloco = coluna ? [linha.replace(/^[^:]*:/, "")] : [];
    } else if (atual) {
      bloco.push(linha);
    }
  }
  fecha();
  return out;
}

/* Promoções: cada graduação de praça que ele já alcançou — "data" em cima,
   "BG nº ... de ..." embaixo, como a Unidade escreve.

   Data: do listão lançado no SIGEP; se não houver, "a contar de" do
   histórico; para a graduação ATUAL, a data da ficha.
   Boletim: do listão; se não houver, da seção IV do histórico.
   Graduação que ele ainda NÃO alcançou é "S/A". */
function promocoes(ficha: FichaPlanilha, lancadas: PromocaoLancada[], h: DadosHistorico | null): Record<string, string> {
  const datas: Record<string, string> = {};
  const bgs: Record<string, string> = {};
  for (const p of lancadas) {
    const chave = COLUNA_PROM[classificarPatente(p.postoNovo).ordem];
    if (!chave) continue;
    if (data(p.dataPromocao)) datas[chave] = data(p.dataPromocao);
    if (s(p.referencia)) bgs[chave] = s(p.referencia);
  }
  const doHistorico = h ? lerSecaoPromocoes(s(h.secoes["IV"])) : {};
  for (const [chave, v] of Object.entries(doHistorico)) {
    if (!datas[chave] && v.data) datas[chave] = v.data;
    if (!bgs[chave] && v.bg) bgs[chave] = v.bg;
  }
  const ordemAtual = classificarPatente(ficha.postoGrad).ordem;
  const atual = COLUNA_PROM[ordemAtual];
  if (atual && !datas[atual] && data(ficha.dataPromocao)) datas[atual] = data(ficha.dataPromocao);

  const out: Record<string, string> = {};
  for (const [ordem, chave] of Object.entries(COLUNA_PROM)) {
    if (Number(ordem) < ordemAtual) { out[chave] = "S/A"; continue; }   // ainda não chegou lá
    out[chave] = [datas[chave], bgs[chave]].filter(Boolean).join("\n");
  }
  return out;
}

/* ------------------------------------------------- planilha anterior */

/* Onde o dado da planilha de um ciclo anterior entra (src/lib/planilhaImportar.ts).
   Regra geral: só preenche o que o sistema NÃO sabe. O histórico, a ficha e
   as certidões de agora vencem sempre — a planilha anterior pode estar velha.

     · promoções: se o sistema não achou nada, ou achou a data mas não o BG;
       nunca para graduação que ele ainda não alcançou ("S/A" do sistema), e
       nunca um "S/A" antigo para graduação que ele já alcançou (foi
       promovido depois da planilha);
     · CEFC/CEFS/CAP/EAP e cursos: se o histórico não nomeia o curso;
     · medalhas: a maior contagem entre as duas (medalha não se perde);
     · elogios, conceito, comportamento, instrução, inclusão: se vazio. */
function usarReferencia(auto: Record<string, [string, Origem]>, ref: Record<string, string>) {
  const REF: Origem = "planilha anterior";
  const r = (k: string) => (ref[k] || "").trim();
  for (const k of ["promCabo", "prom3", "prom2", "prom1"]) {
    const [atual] = auto[k];
    const velho = r(k);
    if (!velho || atual === "S/A" || velho === "S/A") continue;
    if (!atual || (!/\bBG\b/i.test(atual) && /\bBG\b/i.test(velho))) auto[k] = [velho, REF];
  }
  for (const k of ["cefc", "cefs", "cap", "eap"]) {
    const [atual] = auto[k];
    if (r(k) && !/^SIM/i.test(atual)) auto[k] = [r(k), REF];
  }
  if (r("cursos") && r("cursos") !== "S/A" && (!auto.cursos[0] || auto.cursos[0] === "S/A")) auto.cursos = [r("cursos"), REF];
  if (r("medalhas")) {
    const a = Number(auto.medalhas[0]) || 0, b = Number(r("medalhas")) || 0;
    if (!auto.medalhas[0] || b > a) auto.medalhas = [b ? String(b) : r("medalhas"), REF];
  }
  for (const k of ["elogios", "conceito", "comport", "instrucao", "incl"]) {
    if (!auto[k][0] && r(k)) auto[k] = [k === "instrucao" ? r(k).toUpperCase() : r(k), REF];
  }
}

/* ---------------------------------------------------------------- a linha */

export function montarLinha(e: EntradaLinha): LinhaPlanilha {
  const f = e.ficha, h = e.historico;
  const cert = colunaCertidoes(e.certidoes);
  const prom = promocoes(f, e.promocoes, h);
  const campo = (k: string) => (h ? s(h.campos[k]) : "");
  const praca = entraNaPlanilha(f.postoGrad);
  const outrosCursos = h ? s(h.secoes["III.outros"]) : "";

  const auto: Record<string, [string, Origem]> = {
    grad: [siglaGrad(f.postoGrad), "ficha"],
    num: [s(f.numeroBarra), "ficha"],
    nome: [s(f.nome), "ficha"],
    mat: [s(f.matricula), "ficha"],
    id: [s(f.id), "ficha"],
    instrucao: [s(f.grauEscolaridade).toUpperCase(), "ficha"],
    incl: [data(f.dataIncorp), "ficha"],
    // QPMP: toda praça do 18º é QPMP-0 (combatente); o histórico pode dizer outro
    qpmp: [campo("especialidade") || "0", "histórico"],
    comport: [campo("comportamento"), "histórico"],
    // a situação jurídica acompanha a conferência: só "S/A" depois que o
    // P/1 leu as oito e deu o recebido
    sitJuridica: [cert.valor === "S/A" ? "S/A" : "", "certidões"],
    certidoes: [cert.valor, "certidões"],
    sitAdm: [sitAdministrativa(h), "histórico"],
    cursos: [h ? (vazioOuPadrao(outrosCursos) ? "S/A" : outrosCursos) : "", "histórico"],
    promCabo: [prom.promCabo || "", "promoções"],
    prom3: [prom.prom3 || "", "promoções"],
    prom2: [prom.prom2 || "", "promoções"],
    prom1: [prom.prom1 || "", "promoções"],
    cefc: [cursoDoHistorico(h, "CEFC", praca), "histórico"],
    cefs: [cursoDoHistorico(h, "CEFS", praca), "histórico"],
    cap: [cursoDoHistorico(h, "CAP", praca), "histórico"],
    eap: [cursoDoHistorico(h, "EAP", praca), "histórico"],
    elogios: ["", "P/1"],
    medalhas: [medalhas(h), "histórico"],
    conceito: ["", "P/1"],
  };

  usarReferencia(auto, e.referencia || {});

  const celulas: Record<string, Celula> = {};
  for (const c of COLUNAS) {
    const [valor, origem] = auto[c.chave];
    const temManual = !c.identidade && Object.prototype.hasOwnProperty.call(e.manual, c.chave);
    celulas[c.chave] = temManual
      ? { valor: s(e.manual[c.chave]), origem: "P/1", manual: true }
      : { valor, origem, manual: false };
  }

  /* O que falta para a linha ficar pronta para a CPPPM. É a lista que o P/1
     precisa ver antes de 06/11, e não um alerta genérico de "incompleto". */
  const pendencias: string[] = [];
  const v = (k: string) => celulas[k].valor;
  if (!celulas.certidoes.manual && cert.pendente) pendencias.push(cert.pendente);
  if (!v("sitJuridica")) pendencias.push("situação jurídica");
  if (!v("comport")) pendencias.push("comportamento");
  // graduação que ele já alcançou tem de ter data e boletim
  for (const k of ["promCabo", "prom3", "prom2", "prom1"]) {
    const t = v(k);
    if (t === "S/A" || celulas[k].manual) continue;
    if (!t) pendencias.push(`promoção a ${NOME_PROM[k]} (ou S/A, se não passou por ela)`);
    else if (!/\bBG\b/i.test(t)) pendencias.push(`BG da promoção a ${NOME_PROM[k]}`);
  }
  // Ficha Conceito é obrigatória a partir de Cabo (art. 3º, § 1º)
  if (classificarPatente(f.postoGrad).ordem <= 12 && !v("conceito")) pendencias.push("ficha conceito");
  if (!h) pendencias.push("sem histórico cadastrado");

  return { efetivoId: f.id, celulas, pendencias };
}

export { TOTAL_CERTIDOES };
