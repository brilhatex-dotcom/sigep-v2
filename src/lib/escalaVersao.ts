import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/* =========================================================================
   ASSINATURA DA ESCALA — a pergunta barata

   Antes, para saber se alguém tinha mexido na escala, a tela baixava a escala
   INTEIRA de 15 em 15 segundos: todos os dias já gerados, o ano todo, quatro
   vezes por minuto — quase sempre para concluir que nada tinha mudado. É o
   mesmo que mandar um portador buscar o arquivo completo do P/1 de quinze em
   quinze minutos só para ver se entrou folha nova.

   Aqui o servidor devolve só uma ASSINATURA de 32 caracteres do conteúdo. A
   tela pergunta essa, e só busca a escala de verdade quando a assinatura muda.
   O md5 é calculado DENTRO do Postgres de propósito: assim o conteúdo grande
   nem chega a sair do banco.
   ========================================================================= */

export const semAssinatura = "";

function md5Local(valor: string | null | undefined): string {
  return crypto.createHash("md5").update(valor ?? "").digest("hex");
}

/* A MESMA conta que o Postgres faz em md5(COALESCE("Valor", '')): md5 dos
   bytes UTF-8, e nada no lugar de nulo. As duas pontas precisam bater, senão a
   tela buscaria a escala inteira a cada 5 segundos achando que mudou. */
export function assinaturaDoValor(valor: string | null | undefined): string {
  return md5Local(valor);
}

/* -------------------------------------------------------------------------
   REVALIDAÇÃO PELO NAVEGADOR (ETag = a assinatura)

   A escala é grande e a tela a baixava INTEIRA a cada visita, tivesse mudado
   ou não — o maior volume que sai do banco num dia de trabalho do P/1. Com a
   assinatura como ETag, o navegador guarda a última cópia e, na visita
   seguinte, só pergunta "mudou?" (If-None-Match). Não mudou: resposta 304,
   sem corpo, e o navegador usa a cópia que já tem — a conferência é o md5
   feito dentro do Postgres, então a escala nem sai de lá.
   ------------------------------------------------------------------------- */
export const CACHE_REVALIDAR = "private, no-cache";

// A assinatura atual, se for a mesma que o navegador já tem; senão null.
export async function versaoQueONavegadorTem(req: Request, chave: string): Promise<string | null> {
  const tem = req.headers.get("if-none-match") || "";
  if (!tem) return null;
  try {
    const v = (await assinaturas(chave, chave))[chave];
    // compara pelo conteúdo: a Vercel pode marcar o ETag como fraco (W/"...")
    return v && tem.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function respostaNaoMudou(versao: string): Response {
  return new Response(null, { status: 304, headers: { ETag: `"${versao}"`, "Cache-Control": CACHE_REVALIDAR } });
}

// Cabeçalhos da resposta completa: guardar, mas sempre conferir antes de usar.
export function cabecalhosVersao(versao: string): Record<string, string> {
  return { ETag: `"${versao}"`, "Cache-Control": CACHE_REVALIDAR };
}

export async function assinaturas(chaveA: string, chaveB: string): Promise<Record<string, string>> {
  const fora: Record<string, string> = {};
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT "Chave" AS chave, md5(COALESCE("Valor", '')) AS h FROM config WHERE "Chave" IN ($1, $2)`,
      chaveA, chaveB,
    );
    for (const r of rows) if (r?.chave) fora[String(r.chave)] = String(r.h || "");
    /* Chave que ainda não existe tem de dar a MESMA assinatura que a leitura
       cheia devolve nesse caso (md5 de vazio). Se uma ponta dissesse "" e a
       outra o md5, a tela acharia que mudou a cada 5 segundos e baixaria a
       escala inteira sem parar — o oposto do que este arquivo existe para
       fazer. Instalação nova é exatamente esse caso. */
    for (const k of [chaveA, chaveB]) if (!fora[k]) fora[k] = md5Local(null);
    return fora;
  } catch {
    /* Se o md5 no banco não funcionar (nome de coluna diferente do esperado,
       por exemplo), calcula aqui mesmo. Sai mais caro, mas a escala não pode
       parar por causa de uma otimização. */
    for (const chave of [chaveA, chaveB]) {
      try {
        const row = await prisma.config.findUnique({ where: { chave } });
        fora[chave] = md5Local(row?.valor);
      } catch { fora[chave] = md5Local(null); }
    }
    return fora;
  }
}
