/* =========================================================================
   formatarLotacao — remove o prefixo numerico "NN. " que veio da base do
   Excel (usado la para ordenacao/formulas). Aqui nao tem utilidade.

   Exemplos:
     "00. ADM"                              -> "ADM"
     "01. 1ª CIA - SEDE"                    -> "1ª CIA - SEDE"
     "01. ROTEM"                            -> "ROTEM"
     "02. 2ª CIA - SANTO ANTONIO DOS LOPES" -> "2ª CIA - SANTO ANTONIO DOS LOPES"

   Mantem o numero original quando NAO for o padrao de prefixo (nao quebra
   textos que por acaso comecem com numero sem ser prefixo de setor).
   ========================================================================= */
export function formatarLotacao(valor: string | null | undefined): string {
  const s = String(valor ?? "").trim();
  if (!s) return "—";
  // remove "NN. " ou "N. " no inicio (1 ou 2+ digitos, ponto, espacos)
  return s.replace(/^\d{1,3}\.\s*/, "").trim() || "—";
}

/* Versao que devolve string vazia (em vez de "—") — util para ordenar/agrupar. */
export function lotacaoLimpa(valor: string | null | undefined): string {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  return s.replace(/^\d{1,3}\.\s*/, "").trim();
}
