import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/* =========================================================================
   src/lib/auditoria.ts  — registro central de auditoria.

   Use em qualquer rota/acao sensivel:

     import { registrar } from "@/lib/auditoria";
     await registrar({
       acao: "editar_ficha",
       alvo: militar.id,
       alvoNome: militar.nome,
       antes: dadosAntigos,   // objeto (vira JSON)
       depois: dadosNovos,    // objeto (vira JSON)
       detalhe: "Alterou lotacao e telefone",
     });

   O autor (quem fez) e descoberto sozinho pela sessao.
   Nunca quebra a acao principal: se a auditoria falhar, apenas loga no console.
   ========================================================================= */

type RegistroEntrada = {
  acao: string;
  alvo?: string | null;
  alvoNome?: string | null;
  detalhe?: string | null;
  antes?: unknown;
  depois?: unknown;
  // opcional: passar autor manualmente (ex: no proprio login, antes da sessao existir)
  autorLogin?: string | null;
  autorNome?: string | null;
  ip?: string | null;
};

function comoJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function registrar(e: RegistroEntrada): Promise<void> {
  try {
    let autorLogin = e.autorLogin ?? null;
    let autorNome = e.autorNome ?? null;

    if (!autorLogin) {
      const session = await getServerSession(authOptions);
      if (session?.user) {
        autorLogin = (session.user as any).login ?? null;
        autorNome = session.user.name ?? null;
      }
    }

    await prisma.auditoria.create({
      data: {
        acao: e.acao,
        alvo: e.alvo ?? null,
        alvoNome: e.alvoNome ?? null,
        detalhe: e.detalhe ?? null,
        antes: comoJson(e.antes),
        depois: comoJson(e.depois),
        autorLogin,
        autorNome,
        ip: e.ip ?? null,
      } as any,
    });
  } catch (err) {
    // auditoria nunca derruba a acao principal
    console.error("[auditoria] falha ao registrar:", err);
  }
}

/* Compara dois objetos e devolve so os campos que mudaram (antes/depois),
   util para registrar edicoes de ficha sem gravar o objeto inteiro. */
export function diferenca(
  antigo: Record<string, any>,
  novo: Record<string, any>
): { antes: Record<string, any>; depois: Record<string, any>; campos: string[] } {
  const antes: Record<string, any> = {};
  const depois: Record<string, any> = {};
  const campos: string[] = [];
  const chaves = new Set([...Object.keys(antigo || {}), ...Object.keys(novo || {})]);
  for (const k of chaves) {
    const a = antigo ? antigo[k] : undefined;
    const d = novo ? novo[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      antes[k] = a ?? null;
      depois[k] = d ?? null;
      campos.push(k);
    }
  }
  return { antes, depois, campos };
}
