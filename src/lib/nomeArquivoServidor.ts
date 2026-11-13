import { prisma } from "@/lib/prisma";
import { militarDaLinha, type MilitarArquivo } from "@/lib/nomeArquivo";
import { dadosDoTexto, type MilitarLite } from "@/lib/refMilitar";

/* O militar de um documento para o NOME DO ARQUIVO (só no servidor): o nome
   de guerra mora na ficha do efetivo; posto e nome, se a ficha não tiver,
   vêm do próprio documento (requerimento, permuta...). */
export async function militarDoEfetivo(
  efetivoId: string | null | undefined,
  reserva?: MilitarArquivo,
): Promise<MilitarArquivo> {
  let f: { postoGrad: string | null; nomeGuerra: string | null; nome: string | null } | null = null;
  if (efetivoId) {
    try {
      f = await prisma.efetivo.findUnique({
        where: { id: efetivoId },
        select: { postoGrad: true, nomeGuerra: true, nome: true },
      });
    } catch { f = null; }
  }
  return {
    postoGrad: f?.postoGrad || reserva?.postoGrad || null,
    nomeGuerra: f?.nomeGuerra || reserva?.nomeGuerra || null,
    nome: f?.nome || reserva?.nome || null,
  };
}

/* Quem um campo de texto livre aponta ("envolvido" de FATD, sindicância,
   IPM...): procura no efetivo, com a mesma regra da tela, para achar o nome
   de guerra. Sem correspondência, lê o próprio texto. */
export async function militarDoTexto(texto: string | null | undefined): Promise<MilitarArquivo | string> {
  const t = String(texto || "").trim();
  if (!t) return "";
  try {
    const efetivo = await prisma.efetivo.findMany({
      select: { id: true, postoGrad: true, nome: true, nomeGuerra: true, numeroBarra: true, quadro: true },
    }) as unknown as MilitarLite[];
    const d = dadosDoTexto(t, efetivo);
    if (d?.posto || d?.guerra) return { postoGrad: d.posto, nomeGuerra: d.guerra, nome: d.nome };
  } catch { /* sem efetivo, fica o texto */ }
  return militarDaLinha(t, true);
}
