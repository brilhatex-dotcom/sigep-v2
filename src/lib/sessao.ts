/* Tempo de INATIVIDADE da sessão (minutos). Um só lugar para o servidor
   (auth.ts, maxAge do JWT deslizante) e o cliente (relógio visível que
   desconecta sozinho). Trocar aqui muda os dois de uma vez. */
export const MINUTOS_INATIVIDADE = 15;
