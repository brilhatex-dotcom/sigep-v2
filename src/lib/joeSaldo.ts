/* =========================================================================
   SALDO DE JOE — quanto ainda dá para gastar da cota que o CPA/I-2 manda por
   despacho (ex.: "Despacho nº 1198/2026 - CPAI-2/PMMA": 56 vagas,
   R$ 19.600,00, para o período de 20/08/2026 a 21/09/2026).

   O despacho não fala em "mês" — fala num PERÍODO (que atravessa dois meses
   de calendário). Por isso a autorização é guardada pelo período exato do
   despacho, não por competência mensal; a tela deixa isso claro mostrando as
   duas datas.

   Guardado em Config (chave "joe_autorizacoes"), sem mexer no schema — seguindo
   o padrão do projeto para dado que muda pouco e não precisa de índice.
   ========================================================================= */

export type AutorizacaoJoe = {
  id: string;
  despacho: string;        // ex.: "Despacho nº 1198/2026 - CPAI-2/PMMA"
  processoSei: string;     // ex.: "2026.190110.35458"
  periodoInicio: string;   // aaaa-mm-dd
  periodoFim: string;      // aaaa-mm-dd
  quantidade: number;      // vagas autorizadas no período
  valorPorVaga: number;    // R$ por vaga NESTE despacho (varia de despacho pra despacho: 250, 350...)
  valorAutorizado: number; // R$ total autorizado no período = quantidade * valorPorVaga
  criadoPor: string | null;
  criadoEm: string;        // ISO
};

// O que o motor de JOE já guarda (Joe + quantos foram aprovados nele).
export type JoeParaSaldo = {
  id: string;
  evento: string;
  data: string;        // aaaa-mm-dd
  valor: number;        // R$ por vaga aprovada
  totalAprovados: number;
};

export type SaldoJoe = {
  autorizacao: AutorizacaoJoe;
  // quantidade
  quantidadeUsada: number;
  quantidadeDisponivel: number;
  // valor
  valorComprometido: number;
  valorDisponivel: number;
  // uso, 0..100 (sobre quantidade; se não houver cota, sobre valor)
  pctUso: number;
  // os JOEs do período que entraram na conta
  eventos: { id: string; evento: string; data: string; vagas: number; valor: number }[];
};

/* =========================================================================
   O PERÍODO PRECISA SER UMA DATA DE VERDADE, E DE ESTE SÉCULO.

   A conferência era só `^\d{4}-\d{2}-\d{2}$`, e quatro dígitos incluem "0206".
   Um ano digitado errado passava batido — e o estrago não aparecia como erro,
   aparecia como CONTA ERRADA: a comparação de datas é por texto, então
   "2026-07-03" >= "0206-09-22" é verdadeiro, e TODO JOE antigo do sistema caía
   dentro do despacho novo. Foi assim que um despacho de 31 vagas apareceu com
   92 comprometidas e saldo zero.

   Por isso a conferência agora exige data que exista no calendário (30/02 não
   passa) e ano entre 2000 e 2100. Vale no servidor e na tela, do mesmo
   arquivo, para as duas não divergirem.
   ========================================================================= */
const ANO_MIN = 2000, ANO_MAX = 2100;

export function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  if (a < ANO_MIN || a > ANO_MAX) return false;
  // dia 31/04 ou 30/02 viram outro mês ao construir a data: o round-trip pega
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/* Devolve a explicação do problema, ou null quando está tudo certo. Texto
   pronto para a tela: quem digitou 0206 tem de ver o 0206 na mensagem, senão
   procura o erro em outro lugar. */
export function conferirPeriodo(inicio: string, fim: string): string | null {
  const ano = (iso: string) => iso.slice(0, 4);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return "Informe o início e o fim do período.";
  }
  for (const [rotulo, iso] of [["início", inicio], ["fim", fim]] as const) {
    if (!dataValida(iso)) {
      const a = Number(ano(iso));
      return a < ANO_MIN || a > ANO_MAX
        ? `O ano do ${rotulo} do período ficou como ${ano(iso)} — confira a data.`
        : `A data de ${rotulo} do período não existe no calendário.`;
    }
  }
  if (fim < inicio) return "O fim do período não pode vir antes do início.";
  return null;
}

// Despacho já cadastrado com período impossível (ex.: o ano 0206 de antes da
// conferência). A tela usa isto para avisar que a conta dele não vale.
export const periodoOk = (a: Pick<AutorizacaoJoe, "periodoInicio" | "periodoFim">) =>
  conferirPeriodo(a.periodoInicio, a.periodoFim) === null;

/* Um evento de JOE entra na conta de uma autorização quando a DATA do
   evento cai dentro do período do despacho — é a mesma regra que vale no
   papel: o despacho autoriza serviço extraordinário NAQUELE período. */
export function joeNoPeriodo(j: { data: string }, a: Pick<AutorizacaoJoe, "periodoInicio" | "periodoFim">): boolean {
  return j.data >= a.periodoInicio && j.data <= a.periodoFim;
}

export function calcularSaldo(autorizacao: AutorizacaoJoe, joes: JoeParaSaldo[]): SaldoJoe {
  const doPeriodo = joes.filter((j) => joeNoPeriodo(j, autorizacao) && j.totalAprovados > 0);

  const quantidadeUsada = doPeriodo.reduce((soma, j) => soma + j.totalAprovados, 0);
  const valorComprometido = doPeriodo.reduce((soma, j) => soma + j.valor * j.totalAprovados, 0);

  const quantidadeDisponivel = Math.max(0, autorizacao.quantidade - quantidadeUsada);
  const valorDisponivel = Math.max(0, autorizacao.valorAutorizado - valorComprometido);

  const pctUso = autorizacao.quantidade > 0
    ? Math.min(100, Math.round((quantidadeUsada / autorizacao.quantidade) * 100))
    : autorizacao.valorAutorizado > 0
    ? Math.min(100, Math.round((valorComprometido / autorizacao.valorAutorizado) * 100))
    : 0;

  return {
    autorizacao,
    quantidadeUsada,
    quantidadeDisponivel,
    valorComprometido,
    valorDisponivel,
    pctUso,
    eventos: doPeriodo
      .map((j) => ({ id: j.id, evento: j.evento, data: j.data, vagas: j.totalAprovados, valor: j.valor * j.totalAprovados }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  };
}

/* Qual autorização vale HOJE: o período cujo intervalo cobre a data de hoje.
   Se houver mais de uma (não deveria, mas por segurança), pega a mais
   recente pela data de início. Se nenhuma cobrir hoje, cai na última
   cadastrada — melhor mostrar algo desatualizado do que nada. */
export function autorizacaoAtual(lista: AutorizacaoJoe[], hojeISO: string): AutorizacaoJoe | null {
  if (!lista.length) return null;
  const vigentes = lista
    .filter((a) => hojeISO >= a.periodoInicio && hojeISO <= a.periodoFim)
    .sort((a, b) => b.periodoInicio.localeCompare(a.periodoInicio));
  if (vigentes.length) return vigentes[0];
  return [...lista].sort((a, b) => b.periodoInicio.localeCompare(a.periodoInicio))[0];
}
