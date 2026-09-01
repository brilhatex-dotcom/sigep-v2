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
