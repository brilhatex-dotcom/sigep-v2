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
