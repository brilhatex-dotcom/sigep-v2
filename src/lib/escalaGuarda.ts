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
    await prisma.config.upsert({
      where: { chave: `${chave}__anterior` },
      update: { valor },
      create: { chave: `${chave}__anterior`, valor, descricao: "Cópia anterior da escala (recuperação)" },
    });
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
