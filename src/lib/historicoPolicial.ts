import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   HISTÓRICO POLICIAL MILITAR — estrutura do documento.

   Copiado dos dois modelos do 18º BPM (1º Sgt PM Brandão e 2º Ten PM Silas):
   quinze seções numeradas em romano, cada uma com uma faixa de título e o
   conteúdo transcrito de boletim por baixo.

   O corpo é TEXTO. Um histórico é feito de frases de boletim ("BG nº 134 de
   22/07/2022, publicou que foi promovido à graduação de 1º Sargento PM, por
   princípio de Tempo de Serviço"), e nenhum campo estruturado daria conta
   disso sem amarrar as mãos do P/1. O sistema entra onde ele sabe: os dados
   pessoais saem da ficha, e as promoções, férias, licença-prêmio e JMS que
   estão no SIGEP viram SUGESTÕES de linha, para o P/1 completar com o número
   do boletim.

   A única diferença entre oficial e praça está nos cursos de formação
   (CFO/CÃO/CSP contra CFSD/CFS/CAS-PM); o resto do formulário é igual.
   ========================================================================= */

export type Secao = {
  num: string;      // "I", "II", ...
  titulo: string;
  /* Itens fixos que o modelo já traz escritos (as alíneas). Cada um vira um
     campo de texto próprio; o que ficar vazio sai como o padrão do modelo. */
  itens?: { chave: string; rotulo: string; padrao?: string }[];
  /* Seção de texto livre: um bloco só. */
  livre?: boolean;
};

export const SECOES: Secao[] = [
  { num: "I", titulo: "DADOS PESSOAIS" },   // montada dos campos, não é texto livre
  { num: "II", titulo: "DADOS FUNCIONAIS" },
  {
    num: "III", titulo: "CURSOS REALIZADOS: MILITARES E CIVIS",
    itens: [
      { chave: "form1", rotulo: "" },  // CFO / CFSD — o rótulo depende do posto
      { chave: "form2", rotulo: "" },  // CÃO / CFS
      { chave: "form3", rotulo: "" },  // CSP / CAS-PM
      { chave: "outros", rotulo: "OUTROS CURSOS" },
    ],
  },
  { num: "IV", titulo: "PROMOÇÕES COM AS RESPECTIVAS DATAS E BG", livre: true },
  { num: "V", titulo: "EXCLUSÃO / LICENCIAMENTO", livre: true },
  { num: "VI", titulo: "AVERBAÇÃO DE TEMPO DE SERVIÇO", livre: true },
  {
    num: "VII", titulo: "FÉRIAS / LICENÇAS CONCESSÃO (GOZO)",
    itens: [
      { chave: "ferias", rotulo: "FÉRIAS" },
      { chave: "lp", rotulo: "LICENÇA PRÊMIO", padrao: "Sem alterações." },
      { chave: "dispensas", rotulo: "OUTRAS DISPENSAS", padrao: "Nada consta." },
    ],
  },
  {
    num: "VIII", titulo: "JUNTA MILITAR DE SAÚDE (JMS)",
    itens: [
      { chave: "dispensa", rotulo: "DISPENSA MÉDICA", padrao: "Sem alterações." },
      { chave: "ultima", rotulo: "DATA DA ÚLTIMA JMS", padrao: "Sem alterações." },
      { chave: "situacao", rotulo: "SITUAÇÃO NA JMS", padrao: "Sem alterações." },
    ],
  },
  {
    num: "IX", titulo: "ELOGIOS",
    itens: [
      { chave: "sangue", rotulo: "Doação de Sangue", padrao: "Nada consta." },
      { chave: "bravura", rotulo: "Bravura ou Ação Meritória", padrao: "Nada consta." },
    ],
  },
  {
    num: "X", titulo: "CONDECORAÇÕES",
    itens: [
      { chave: "falcao", rotulo: "MEDALHA BRIGADEIRO FALCÃO", padrao: "Nada consta." },
      { chave: "merito", rotulo: "MEDALHA DE MÉRITO OU TÍTULO DE CIDADANIA ESTADUAL", padrao: "Nada consta." },
      { chave: "estudo", rotulo: "MEDALHA DE APLICAÇÃO E ESTUDO (1º LUGAR)", padrao: "Nada consta." },
      { chave: "servico", rotulo: "MEDALHA DO SERVIÇO POLICIAL MILITAR", padrao: "Nada consta." },
    ],
  },
  { num: "XI", titulo: "RELAÇÃO DE DEPENDENTES QUE RECEBEM SALÁRIO FAMÍLIA", livre: true },
  { num: "XII", titulo: "PROCESSOS PENAIS / CIVIS / ADMINISTRATIVOS (CD / DESERÇÃO) EM QUE ESTIVER ENVOLVIDO", livre: true },
  {
    num: "XIII", titulo: "PUNIÇÕES DISCIPLINARES",
    itens: [
      { chave: "prisao", rotulo: "PRISÃO", padrao: "Nada consta." },
      { chave: "detencao", rotulo: "DETENÇÃO", padrao: "Nada consta." },
      { chave: "repreensao", rotulo: "REPREENSÃO / ADVERTÊNCIA", padrao: "Nada consta." },
    ],
  },
  { num: "XIV", titulo: "OUTRAS PUBLICAÇÕES", livre: true },
  { num: "XV", titulo: "PUBLICAÇÕES EM BOLETIM (NOTAS ELETRÔNICAS)", livre: true },
];

/* Rótulos dos cursos de formação: mudam entre oficial e praça. */
export function rotulosFormacao(postoGrad: string): [string, string, string] {
  return classificarPatente(postoGrad || "").ordem <= 7
    ? ["CFO / ANO", "CÃO / ANO", "CSP / ANO"]
    : ["CFSD / ANO", "CFS / ANO", "CAS-PM / ANO"];
}

/* Campos das seções I e II. Os que a ficha do efetivo já responde vêm
   preenchidos; os outros o P/1 digita uma vez e ficam salvos.

   `daFicha` diz de onde o valor sai sozinho — quando existe, a tela mostra o
   valor da ficha e o P/1 só escreve se quiser sobrescrever. */
export type Campo = { chave: string; rotulo: string; daFicha?: boolean; sePraca?: boolean; seOficial?: boolean };

export const CAMPOS_PESSOAIS: Campo[] = [
  { chave: "nome", rotulo: "NOME", daFicha: true },
  { chave: "postoGrad", rotulo: "POSTO/GRADUAÇÃO", daFicha: true },
  { chave: "filiacao", rotulo: "FILIAÇÃO", daFicha: true },
  { chave: "dataNasc", rotulo: "DATA DE NASCIMENTO", daFicha: true },
  { chave: "naturalidade", rotulo: "NATURALIDADE", daFicha: true },
  { chave: "estadoCivil", rotulo: "ESTADO CIVIL", daFicha: true },
  { chave: "grauEnsino", rotulo: "GRAU DE ENSINO", daFicha: true },
  { chave: "tipoSangue", rotulo: "TIPO DE SANGUE", daFicha: true },
  { chave: "tituloEleitoral", rotulo: "TÍTULO ELEITORAL" },
  { chave: "cpf", rotulo: "CPF", daFicha: true },
  { chave: "rg", rotulo: "REGISTRO GERAL (CI)", daFicha: true },
  { chave: "matricula", rotulo: "MATRICULA", daFicha: true },
  // Medidas de fardamento: só o modelo do oficial traz.
  { chave: "cutis", rotulo: "CÚTIS", seOficial: true },
  { chave: "olhos", rotulo: "OLHOS", seOficial: true },
  { chave: "peso", rotulo: "PESO", seOficial: true },
  { chave: "cintura", rotulo: "CINTURA", seOficial: true },
  { chave: "calcado", rotulo: "CALÇADO", seOficial: true },
  { chave: "altura", rotulo: "ALTURA", seOficial: true },
  { chave: "cabeca", rotulo: "CABEÇA", seOficial: true },
  { chave: "camisa", rotulo: "CAMISA", seOficial: true },
  { chave: "sinais", rotulo: "SINAIS PARTICULARES", seOficial: true },
];

export const CAMPOS_FUNCIONAIS: Campo[] = [
  { chave: "dataInclusao", rotulo: "DATA DE INCLUSÃO", daFicha: true },
  { chave: "bgInclusao", rotulo: "BOLETIM GERAL Nº" },
  { chave: "unidade", rotulo: "UNIDADE QUE SERVE", daFicha: true },
  { chave: "opmServiu", rotulo: "OPM QUE JÁ SERVIU" },
  { chave: "especialidade", rotulo: "ESPECIALIDADE/QPMP" },
  { chave: "comportamento", rotulo: "COMPORTAMENTO" },
  { chave: "funcao", rotulo: "FUNÇÃO JÁ EXERCIDA", daFicha: true },
  // Só o modelo do oficial abre o tempo de serviço em duas alíneas.
  { chave: "tempoServico", rotulo: "TEMPO DE EFETIVO SERVIÇO EM FUNÇÃO", seOficial: true },
  { chave: "arregimentada", rotulo: "a) - ARREGIMENTADA", seOficial: true },
  { chave: "naoArregimentada", rotulo: "b) - NÃO ARREGIMENTADA", seOficial: true },
];

export type DadosHistorico = {
  campos: Record<string, string>;
  secoes: Record<string, string>;   // "IV" | "III.outros" | "VII.ferias" ...
  dataDoc: string;                  // data do rodapé (ISO); vazio = hoje
  chefe: string;                    // quem assina; vazio = Chefe do P/1 da Escala
};

export const VAZIO: DadosHistorico = { campos: {}, secoes: {}, dataDoc: "", chefe: "" };

export function normalizar(v: unknown): DadosHistorico {
  const o = (v && typeof v === "object" ? v : {}) as Partial<DadosHistorico>;
  const texto = (x: unknown) => (typeof x === "string" ? x : "");
  const mapa = (x: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (x && typeof x === "object") for (const [k, val] of Object.entries(x)) out[k] = texto(val);
    return out;
  };
  return { campos: mapa(o.campos), secoes: mapa(o.secoes), dataDoc: texto(o.dataDoc), chefe: texto(o.chefe) };
}

/* ---------------------------------------------------------------- ficha */

export type FichaHistorico = {
  id: string; nome?: string | null; nomeGuerra?: string | null; postoGrad?: string | null;
  numeroBarra?: string | null; quadro?: string | null; matricula?: string | null; rg?: string | null;
  cpf?: string | null; dataNasc?: string | null; dataIncorp?: string | null; estadoCivil?: string | null;
  naturalidade?: string | null; naturalidadeUF?: string | null; nomePai?: string | null; nomeMae?: string | null;
  tipoSanguineo?: string | null; fatorRH?: string | null; grauEscolaridade?: string | null;
  funcao?: string | null; lotacao?: string | null;
};

const s = (v?: string | null) => String(v ?? "").trim();
const brData = (iso?: string | null) => {
  const t = s(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  return t;
};

/* O que a ficha do efetivo já responde das seções I e II. */
export function daFicha(f: FichaHistorico): Record<string, string> {
  const barra = s(f.numeroBarra);
  const posto = [s(f.postoGrad), s(f.quadro) || "PM", barra ? `nº ${barra}` : ""].filter(Boolean).join(" ");
  const filiacao = [s(f.nomeMae), s(f.nomePai)].filter(Boolean).join("\n");
  const sangue = [s(f.tipoSanguineo), s(f.fatorRH)].filter(Boolean).join(" ");
  const natural = [s(f.naturalidade), s(f.naturalidadeUF)].filter(Boolean).join(" - ");
  return {
    nome: s(f.nome) || s(f.nomeGuerra),
    postoGrad: posto,
    filiacao,
    dataNasc: brData(f.dataNasc),
    naturalidade: natural,
    estadoCivil: s(f.estadoCivil),
    grauEnsino: s(f.grauEscolaridade),
    tipoSangue: sangue,
    cpf: s(f.cpf),
    rg: s(f.rg) ? `${s(f.rg)} – PMMA` : "",
    matricula: s(f.matricula),
    dataInclusao: brData(f.dataIncorp),
    unidade: "18º Batalhão de Polícia Militar",
    funcao: s(f.funcao),
  };
}

/* Valor final de um campo: o que o P/1 escreveu manda; senão o da ficha. */
export function valorCampo(dados: DadosHistorico, ficha: Record<string, string>, chave: string): string {
  const manual = s(dados.campos[chave]);
  return manual || s(ficha[chave]);
}

/* Conteúdo final de uma seção (ou alínea): o que foi escrito, senão o padrão
   do modelo. Chave da alínea = "VII.ferias". */
export function valorSecao(dados: DadosHistorico, chave: string, padrao = ""): string {
  const v = s(dados.secoes[chave]);
  return v || padrao;
}

/* ------------------------------------------------------- sugestões */

/* Linhas prontas a partir do que o SIGEP já sabe, para o P/1 completar com o
   número do boletim. Nunca sobrescrevem o que já está escrito: a tela mostra
   como sugestão e ele decide.

   Deliberadamente com o "BG nº ___ de __/__/____" em branco: o sistema não
   guarda o boletim, e inventar número em documento funcional seria pior que
   deixar a lacuna à vista. */
export type Sugestoes = { chave: string; rotulo: string; linhas: string[] }[];

export function sugerirPromocoes(
  lancadas: { postoNovo?: string | null; dataPromocao?: string | null; referencia?: string | null }[],
): string[] {
  return lancadas
    .filter((p) => s(p.postoNovo))
    .sort((a, b) => s(a.dataPromocao).localeCompare(s(b.dataPromocao)))
    .map((p) => {
      const quando = brData(p.dataPromocao);
      const ref = s(p.referencia);
      return `${s(p.postoNovo).toUpperCase()}: a contar de ${quando || "__/__/____"}, BG nº ____ de __/__/____` +
        (ref ? ` (${ref})` : "") + ".";
    });
}

export function sugerirFerias(periodos: { ano: string; inicio: string; fim: string }[]): string[] {
  return periodos
    .filter((p) => p.ano)
    .sort((a, b) => a.ano.localeCompare(b.ano))
    .map((p) => {
      const janela = p.inicio && p.fim ? ` (${brData(p.inicio)} a ${brData(p.fim)})` : "";
      return `Exercício de ${p.ano}${janela}, BI nº ____ de __/__/____;`;
    });
}

export function sugerirLicencaPremio(periodos: { ano: string; inicio: string; fim: string }[]): string[] {
  return periodos
    .filter((p) => p.ano)
    .sort((a, b) => a.ano.localeCompare(b.ano))
    .map((p) => {
      const janela = p.inicio && p.fim ? ` (${brData(p.inicio)} a ${brData(p.fim)})` : "";
      return `Licença-prêmio de ${p.ano}${janela}, BG nº ____ de __/__/____;`;
    });
}

export function sugerirJms(f: { jmsDataInicio?: string | null; jmsDataRetorno?: string | null; jmsMotivo?: string | null }): string[] {
  const ini = brData(f.jmsDataInicio);
  if (!ini) return [];
  const ret = brData(f.jmsDataRetorno);
  const motivo = s(f.jmsMotivo);
  return [`Dispensa a contar de ${ini}${ret ? `, retorno em ${ret}` : ""}${motivo ? ` (${motivo})` : ""}, BI nº ____ de __/__/____;`];
}
