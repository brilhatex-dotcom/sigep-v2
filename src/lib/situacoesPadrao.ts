export type SituacaoItem = { nome: string; afastamento: boolean };

/* Situacoes padrao do sistema (usadas enquanto o admin nao personalizar).
   afastamento=true significa que o militar NAO esta disponivel para o servico
   (sai da escala/organograma e aparece destacado). */
export const SITUACOES_PADRAO: SituacaoItem[] = [
  { nome: "Pronto", afastamento: false },
  { nome: "Licença", afastamento: true },
  { nome: "LTIP", afastamento: true },
  { nome: "Reserva", afastamento: true },
  { nome: "JMS", afastamento: true },
  { nome: "Férias", afastamento: true },
  { nome: "Licença-Prêmio", afastamento: true },
  { nome: "Agregação", afastamento: true },
];

/* Heuristica de fallback: disponivel = pronto/apto/disponivel; qualquer outra
   situacao conta como afastamento. Usada quando a lista configurada nao esta
   carregada. */
export function ehAfastamentoHeuristica(situacao: string | null | undefined): boolean {
  const v = (situacao ?? "").toLowerCase().trim();
  if (!v || v === "—" || v === "-") return false;
  if (v.includes("pronto") || v.includes("apto") || v.includes("disponí") || v.includes("disponi")) return false;
  return true;
}

/* Decide se uma situacao conta como afastamento, usando a lista configurada
   (quando disponivel) e caindo na heuristica para nomes desconhecidos. */
export function ehAfastamento(situacao: string | null | undefined, itens?: SituacaoItem[] | null): boolean {
  const nome = (situacao ?? "").trim();
  if (!nome || nome === "—" || nome === "-") return false;
  if (itens && itens.length) {
    const achou = itens.find((s) => s.nome.toLowerCase() === nome.toLowerCase());
    if (achou) return achou.afastamento;
  }
  return ehAfastamentoHeuristica(nome);
}
