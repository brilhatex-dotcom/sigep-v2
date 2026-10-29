/* =========================================================================
   AVISO DE PROMOÇÃO AO ENTRAR — a chave que liga e desliga.

   Ligado, quem está no Limite Quantitativo (e ainda não mandou as
   certidões ao P/1) recebe a mensagem explicativa da promoção no login:
     · o cartão de "Parabéns" ao entrar (AvisoAoEntrar, via pendências);
     · o desvio do login direto para a tela das certidões (dashboard e
       primeira troca de senha);
     · o passo a passo das certidões abrindo sozinho.

   DESLIGADO em 29/10/2026 a pedido do P/1: o prazo das certidões acabou.
   Nada foi apagado — para o próximo ciclo (março de 2027), é só trocar
   para `true`. O botão "Ver o passo a passo" da tela continua valendo. */
export const AVISO_PROMOCAO_LIGADO = false;
