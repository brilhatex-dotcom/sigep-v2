/* Regras compartilhadas entre o preparo do envio da certidao
   (/api/promocoes/upload) e a confirmacao (/api/promocoes/upload/confirmar).

   A chave no R2 e DETERMINISTICA: sai do periodo, da ficha e da ordem da
   certidao. Isso importa por dois motivos —

   1) reenviar a mesma certidao sobrescreve a anterior, sem lixo acumulado;
   2) na confirmacao da para conferir se a chave e exatamente a que aquele
      militar poderia ter recebido. Sem isso, bastava chamar a confirmacao com
      uma chave qualquer para apontar a certidao de um para o arquivo de
      outro. */

export const LIMITE_CERTIDAO_BYTES = 20 * 1024 * 1024; // 20 MB

export function chaveCertidao(periodoId: string, efetivoId: string, ordem: number): string {
  return `promocoes/${periodoId}/${efetivoId}/certidao-${ordem}.pdf`;
}

/* A Certidão Unificada da Justiça Federal (TRF1 a TRF5) tem chave PROPRIA:
   os itens 4 a 8 apontam todos para ela. Se usasse a chave do item 4, trocar
   depois so a do TRF1 sobrescreveria o arquivo que os itens 5 a 8 ainda usam. */
export function chaveCertidaoUnificada(periodoId: string, efetivoId: string): string {
  return `promocoes/${periodoId}/${efetivoId}/certidao-unificada-trf.pdf`;
}

/* Na hora de juntar: os itens cobertos pela unificada apontam para o MESMO
   arquivo — ele entra uma vez so, no lugar do primeiro (TRF1). */
export function semRepetirArquivo<T extends { r2Key: string }>(certidoes: T[]): T[] {
  const vistos = new Set<string>();
  return certidoes.filter((c) => (vistos.has(c.r2Key) ? false : (vistos.add(c.r2Key), true)));
}
