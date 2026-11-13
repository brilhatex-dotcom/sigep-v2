/* =========================================================================
   ASSINATURA DO MILITAR NO MEMORANDO DE FÉRIAS/LP — por onde ela é feita.

   false (nov/2026, até o Cmt definir): o militar NÃO assina pelo SIGEP. Em
   "Minhas Férias" ele baixa o memorando em PDF e assina pelo gov.br (assinador
   do ITI) ou imprime e assina à mão, e entrega ao P/1. O servidor recusa a
   assinatura do militar pelo SIGEP.

   true: volta a assinatura avançada SIGEP (senha + carimbo com QR) do militar.

   A assinatura da SEÇÃO (Chefe do P/1) e o visto do Cmt não mudam: o memorando
   fica "pronto" quando a seção assina, com ou sem a assinatura do militar.
   ========================================================================= */
export const ASSINATURA_SIGEP_DO_MILITAR = false;

// assinador oficial do gov.br (ITI) — assina PDF com a conta gov.br
export const URL_ASSINADOR_GOVBR = "https://assinador.iti.br";
