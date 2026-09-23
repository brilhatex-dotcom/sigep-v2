import { classificarPatente } from "@/lib/patentes";
import { dataBR } from "@/lib/datas";
import { CERTIDOES_EXIGIDAS, TOTAL_CERTIDOES } from "@/lib/certidoes";
import type { DadosHistorico } from "@/lib/historicoPolicial";

/* =========================================================================
   PLANILHA PADRÃO DA PROMOÇÃO — Portaria nº 168/2026-CPPPM

   O que a portaria manda (art. 3º e 4º):
     · UMA planilha com TODO o efetivo, "de Soldado ao 1º Sargento mais
       antigo da Unidade";
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

export type Origem = "ficha" | "histórico" | "certidões" | "promoções" | "P/1";

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

/* Cursos de carreira: só preenche quando o histórico NOMEIA o curso.
   Não se deduz CEFS de "CFS" nem CAP de "CAS-PM" — são cursos diferentes, e
   um palpite errado aqui vira informação oficial falsa na mão da Comissão. */
const CURSO: Record<string, RegExp> = {
  CEFC: /\bCEFC\b|curso especial de forma[çc][ãa]o de cabos/i,
  CEFS: /\bCEFS\b|curso especial de forma[çc][ãa]o de sargentos/i,
  /* "CAP" e tambem a abreviatura de CAPITAO — "ministrado pelo CAP QOPM
     Fulano" nao e curso nenhum. Por isso a sigla so vale quando NAO vem
     seguida de quadro (QO..., PM). */
  CAP: /\bCAP\b(?!\s*(QO|PM\b))|curso de aperfei[çc]oamento de pra[çc]as/i,
  EAP: /\bEAP\b/,
};

function cursoDoHistorico(h: DadosHistorico | null, sigla: keyof typeof CURSO): string {
  if (!h) return "";
  const re = CURSO[sigla];
  for (const chave of ["III.form1", "III.form2", "III.form3", "III.outros"]) {
    const linhas = s(h.secoes[chave]).split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const achada = linhas.find((l) => re.test(l));
    if (achada) return achada;
  }
  return "";
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

function medalhas(h: DadosHistorico | null): string {
  if (!h) return "";
  const itens = ["X.falcao", "X.merito", "X.estudo", "X.servico"]
    .map((k) => s(h.secoes[k]))
    .filter((t) => !vazioOuPadrao(t));
  return itens.length ? itens.join("; ") : "S/A";
}

/* Promoções: cada graduação de praça que ele já alcançou, com data e boletim.

   Fonte principal: o que o P/1 lançou pelo listão (promocoes_lancadas), que
   traz a referência da publicação. Se a graduação ATUAL não passou pelo
   listão, a data sai da ficha — sem o boletim, que o P/1 completa. */
function promocoes(ficha: FichaPlanilha, lancadas: PromocaoLancada[]): Record<string, string> {
  const alvo: Record<number, string> = { 12: "promCabo", 11: "prom3", 10: "prom2", 9: "prom1" };
  const out: Record<string, string> = {};
  for (const p of lancadas) {
    const chave = alvo[classificarPatente(p.postoNovo).ordem];
    if (!chave) continue;
    const d = data(p.dataPromocao);
    const ref = s(p.referencia);
    out[chave] = [d, ref ? `Publicado no ${ref}` : ""].filter(Boolean).join(" - ");
  }
  const atual = alvo[classificarPatente(ficha.postoGrad).ordem];
  if (atual && !out[atual] && data(ficha.dataPromocao)) out[atual] = data(ficha.dataPromocao);
  return out;
}

/* ---------------------------------------------------------------- a linha */

export function montarLinha(e: EntradaLinha): LinhaPlanilha {
  const f = e.ficha, h = e.historico;
  const cert = colunaCertidoes(e.certidoes);
  const prom = promocoes(f, e.promocoes);
  const campo = (k: string) => (h ? s(h.campos[k]) : "");

  const auto: Record<string, [string, Origem]> = {
    grad: [siglaGrad(f.postoGrad), "ficha"],
    num: [s(f.numeroBarra), "ficha"],
    nome: [s(f.nome), "ficha"],
    mat: [s(f.matricula), "ficha"],
    id: [s(f.id), "ficha"],
    instrucao: [s(f.grauEscolaridade).toUpperCase(), "ficha"],
    incl: [data(f.dataIncorp), "ficha"],
    qpmp: [campo("especialidade"), "histórico"],
    comport: [campo("comportamento"), "histórico"],
    // a situação jurídica acompanha a conferência: só "sem alteração" depois
    // que o P/1 leu as oito e deu o recebido
    sitJuridica: [cert.valor === "S/A" ? "Sem alteração" : "", "certidões"],
    certidoes: [cert.valor, "certidões"],
    sitAdm: [sitAdministrativa(h), "histórico"],
    cursos: [h ? s(h.secoes["III.outros"]) : "", "histórico"],
    promCabo: [prom.promCabo || "", "promoções"],
    prom3: [prom.prom3 || "", "promoções"],
    prom2: [prom.prom2 || "", "promoções"],
    prom1: [prom.prom1 || "", "promoções"],
    cefc: [cursoDoHistorico(h, "CEFC"), "histórico"],
    cefs: [cursoDoHistorico(h, "CEFS"), "histórico"],
    cap: [cursoDoHistorico(h, "CAP"), "histórico"],
    eap: [cursoDoHistorico(h, "EAP"), "histórico"],
    elogios: ["", "P/1"],
    medalhas: [medalhas(h), "histórico"],
    conceito: ["", "P/1"],
  };

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
  // Ficha Conceito é obrigatória a partir de Cabo (art. 3º, § 1º)
  if (classificarPatente(f.postoGrad).ordem <= 12 && !v("conceito")) pendencias.push("ficha conceito");
  if (!h) pendencias.push("sem histórico cadastrado");

  return { efetivoId: f.id, celulas, pendencias };
}

export { TOTAL_CERTIDOES };
