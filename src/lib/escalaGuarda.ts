import { prisma } from "@/lib/prisma";

/* =========================================================================
   PROTEÇÃO DA ESCALA CONTRA GRAVAÇÃO VAZIA

   A escala inteira (dias e equipes) mora em UMA linha da tabela Config, e a
   tela grava sempre o objeto todo de uma vez. Isso torna o conjunto frágil de
   um jeito específico: qualquer tela que carregue vazia e depois salve apaga
   tudo o que estava lá.

   E era exatamente o que podia acontecer: quando o banco falhava, a leitura
   devolvia "{}" com HTTP 200. Do lado do navegador isso é indistinguível de
   "ainda não tem escala nenhuma" — a tela limpava os nomes e, na primeira
   edição seguinte, gravava o vazio por cima da escala boa.

   Este arquivo separa as duas coisas em toda leitura (não existe X o banco
   falhou) e guarda uma cópia antes de toda gravação que encolhe o conteúdo.
   ========================================================================= */

export type Leitura =
  | { ok: true; valor: string | null }   // valor null = a chave ainda não existe
  | { ok: false; erro: unknown };

export async function lerConfig(chave: string): Promise<Leitura> {
  try {
    const row = await prisma.config.findUnique({ where: { chave } });
    return { ok: true, valor: row?.valor ?? null };
  } catch (erro) {
    return { ok: false, erro };
  }
}

/* Cópia do valor anterior em "<chave>__anterior", tirada antes de uma gravação
   que diminui o conteúdo. É uma linha a mais na tabela e dá ao P/1 de onde
   recuperar caso uma gravação ruim passe por aqui. Melhor-esforço de
   propósito: falhar o backup nunca pode impedir uma gravação legítima. */
export async function guardarAnterior(chave: string, valor: string | null): Promise<void> {
  if (!valor) return;
  try {
    await gravarConfig(`${chave}__anterior`, valor, "Cópia anterior da escala (recuperação)");
  } catch { /* silencioso: é rede de segurança, não parte da gravação */ }
}

/* ---------------------------------------------------------------------------
   GRAVAR E CONFERIR SEM TRAZER A ESCALA DE VOLTA

   O Neon cobra o tráfego que SAI do banco (cota de 5 GB/mês). O
   prisma.config.upsert devolve a linha gravada inteira — ou seja, cada vez
   que a escala era salva, ela voltava do banco completa, à toa; e a leitura
   feita antes, só para contar quantos dias havia, trazia ela de novo. Numa
   tarde de edição da escala isso era o mesmo bloco grande indo e voltando
   centenas de vezes. As três funções abaixo fazem o mesmo trabalho sem que o
   conteúdo saia do banco.
   --------------------------------------------------------------------------- */

// Grava (cria ou troca) sem devolver nada.
export async function gravarConfig(chave: string, valor: string, descricao: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO config ("Chave", "Valor", "Descricao") VALUES (${chave}, ${valor}, ${descricao})
    ON CONFLICT ("Chave") DO UPDATE SET "Valor" = EXCLUDED."Valor"`;
}

/* Quantas chaves (dias) o objeto guardado tem — contado no próprio banco.
   Conteúdo que não é objeto JSON conta 0, como o objetoDe acima. */
export async function contarChaves(chave: string): Promise<{ ok: true; n: number } | { ok: false; erro: unknown }> {
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT CASE WHEN jsonb_typeof("Valor"::jsonb) = 'object'
                  THEN (SELECT count(*)::int FROM jsonb_object_keys("Valor"::jsonb))
                  ELSE 0 END AS n
        FROM config WHERE "Chave" = ${chave}`;
    return { ok: true, n: rows[0]?.n ?? 0 };
  } catch {
    /* JSON ilegível no banco (o ::jsonb falha) ou banco fora: tenta do jeito
       antigo, lendo — e, se nem isso der, devolve o erro (a gravação para). */
    const lida = await lerConfig(chave);
    if (!lida.ok) return lida;
    return { ok: true, n: Object.keys(objetoDe(lida.valor)).length };
  }
}

/* Mesma cópia de segurança do guardarAnterior, feita dentro do banco (o valor
   atual é copiado para "<chave>__anterior" sem passar pelo servidor). */
export async function guardarAnteriorNoBanco(chave: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO config ("Chave", "Valor", "Descricao")
      SELECT ${`${chave}__anterior`}, "Valor", 'Cópia anterior da escala (recuperação)'
        FROM config WHERE "Chave" = ${chave} AND COALESCE("Valor", '') <> ''
      ON CONFLICT ("Chave") DO UPDATE SET "Valor" = EXCLUDED."Valor"`;
  } catch { /* silencioso: é rede de segurança, não parte da gravação */ }
}

export function objetoDe(valor: string | null): Record<string, any> {
  if (!valor) return {};
  try {
    const o = JSON.parse(valor);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

/* Quantos militares um Cadastro de equipes carrega. Serve para perceber que
   uma gravação está prestes a trocar as equipes de verdade pelas equipes de
   exemplo (o SEED que a tela usa antes de carregar). */
export function quantosNoCadastro(cad: any): number {
  if (!cad || typeof cad !== "object") return 0;
  let n = 0;
  for (const v of Object.values(cad)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") n += item.trim() ? 1 : 0;
        else if (item && typeof item === "object") n += Object.values(item).filter((x) => typeof x === "string" && x.trim()).length;
      }
    }
  }
  return n;
}
