/* =========================================================================
   O QUE A TELA E O SERVIDOR PRECISAM SABER IGUAL, no requerimento de
   premiação pecuniária.

   Módulo sem Prisma e sem nada de servidor, de propósito: `requerimentoPecunia`
   abre conexão com o banco, e importar aquilo de um componente "use client"
   arrastaria o Prisma inteiro para dentro do navegador.

   O que mora aqui é a REGRA DE FORMATO — como as três respostas do
   questionário viram a linha da coluna DADOS BANCÁRIOS. Ela precisa ser a
   mesma dos dois lados: essa string é o que entra no conteúdo assinado, então
   montar de um jeito na tela e de outro no servidor faria a assinatura
   divergir do documento que ela lacra.
   ========================================================================= */

export type RespostaBanco = {
  bancoNome?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: string;   // "CC" (corrente) | "CP" (poupança)
};

/* Dados bancários no formato do modelo em papel:
   "AG: 1234-5 CC: 98765-4 BANCO DO BRASIL".

   `banco` é aceito como nome alternativo do banco para quem já vinha
   chamando assim (a ficha do efetivo usa esse nome de campo). */
export function linhaBanco(f: RespostaBanco & { banco?: string }): string {
  const tipo = (f.tipoConta || "CC").trim().toUpperCase();
  const partes = [
    f.agencia ? `AG: ${f.agencia}` : "",
    f.conta ? `${tipo}: ${f.conta}` : "",
    (f.bancoNome ?? f.banco ?? "").trim().toUpperCase(),
  ].filter(Boolean);
  return partes.join(" ");
}

/* Policial do efetivo que ainda não tem a conta no documento — é quem o
   questionário está esperando. Linha avulsa (civil, ou de fora do efetivo)
   não conta: ninguém vai responder por ela no sistema. */
export const faltaBanco = (l: { efetivoId?: string; banco?: string }) =>
  !!l.efetivoId && !String(l.banco || "").trim();
