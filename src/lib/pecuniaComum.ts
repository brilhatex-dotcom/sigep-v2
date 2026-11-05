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

import { compararAntiguidade, type ParaAntiguidade } from "@/lib/antiguidade";

/* A ORDEM dos policiais no requerimento: a HIERARQUIA (pedido do P/1 — o mais
   graduado e mais antigo primeiro, no ofício e nas assinaturas). Do efetivo,
   pela ficha (posto, data da promoção, barra); digitado à mão, pelo cargo
   escrito na linha. Empate total mantém a ordem em que foram postos. */
export function emHierarquia<T extends { efetivoId: string; cargo: string; nome: string }>(
  linhas: T[], fichas: Map<string, ParaAntiguidade>,
): T[] {
  const regua = (l: T): ParaAntiguidade => (l.efetivoId && fichas.get(l.efetivoId)) || { postoGrad: l.cargo, nome: l.nome };
  return linhas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => compararAntiguidade(regua(a.l), regua(b.l)) || a.i - b.i)
    .map((x) => x.l);
}

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

/* O tipo de conta da FICHA é texto livre ("Corrente", "Poupança", "CP"...).
   No requerimento ele é só CC ou CP — sem esta conta, "Poupança" virava CC. */
export function tipoContaDaFicha(v?: string | null): "CC" | "CP" {
  const t = String(v || "").trim().toLowerCase();
  return t === "cp" || t.includes("poup") ? "CP" : "CC";
}

/* Policial do efetivo que ainda não tem a conta no documento — é quem o
   questionário está esperando. Linha avulsa (civil, ou de fora do efetivo)
   não conta: ninguém vai responder por ela no sistema. */
export const faltaBanco = (l: { efetivoId?: string; banco?: string }) =>
  !!l.efetivoId && !String(l.banco || "").trim();
