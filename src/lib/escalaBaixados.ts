import { prisma } from "@/lib/prisma";
import { toISO, type BaixaEscala } from "@/lib/afastamentosPlano";

/* =========================================================================
   "NÃO ESCALAR — BAIXADO DO SERVIÇO ATIVO" — a chave do P/1 por policial.

   Desde nov/2026 o JMS não tira mais da escala: na maior parte das vezes a
   Junta só restringe (sem serviço noturno, sem armamento, sem esforço
   físico) e o policial está pronto. Para o JMS que BAIXA do serviço ativo, o
   P/1 liga esta chave e o policial sai da escala (motor, mapa, diária, CPU).

   Guardada no Config "escala_baixados": { [idPmma]: registro }. Ligada
   durante um JMS (atual ou já marcado para começar), a chave acompanha aquele
   JMS e acaba sozinha no retorno — quem decide o período é a montagem dos
   afastamentos (lib/afastamentosPlano, fonte 6).
   ========================================================================= */

export const CHAVE_BAIXADOS = "escala_baixados";

export type RegistroBaixa = BaixaEscala & { por: string; em: string };

export function lerMapaBaixados(valor: string | null | undefined): Record<string, RegistroBaixa> {
  try {
    const o = valor ? JSON.parse(valor) : {};
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, RegistroBaixa> = {};
    for (const [id, r] of Object.entries(o as Record<string, any>)) {
      const desde = toISO(r?.desde);
      if (!id || !desde) continue;
      out[id] = {
        desde,
        jmsInicio: toISO(r?.jmsInicio) || null,
        por: String(r?.por || ""),
        em: String(r?.em || ""),
      };
    }
    return out;
  } catch { return {}; }
}

export async function lerBaixados(): Promise<Record<string, RegistroBaixa>> {
  const row = await prisma.config.findUnique({ where: { chave: CHAVE_BAIXADOS } });
  return lerMapaBaixados(row?.valor);
}

export async function salvarBaixados(m: Record<string, RegistroBaixa>): Promise<void> {
  const valor = JSON.stringify(m);
  await prisma.config.upsert({
    where: { chave: CHAVE_BAIXADOS },
    update: { valor },
    create: { chave: CHAVE_BAIXADOS, valor, descricao: "Escala: policiais baixados do serviço ativo (não escalar)" },
  });
}

/* O registro novo ao LIGAR a chave. Se a ficha tem um JMS que ainda não
   acabou (já começou ou vai começar), a chave fica amarrada a ele: começa no
   início do JMS (ou hoje, se já começou) e termina no retorno. Sem JMS
   valendo, começa hoje e vale até alguém desligar. */
export function novaBaixa(
  ficha: { jmsDataInicio?: string | null; jmsDataRetorno?: string | null } | null | undefined,
  hoje: string, por: string,
): RegistroBaixa {
  const ini = toISO(ficha?.jmsDataInicio);
  const ret = toISO(ficha?.jmsDataRetorno);
  const jmsAberto = !!ini && (!ret || hoje < ret);
  return {
    desde: jmsAberto && ini > hoje ? ini : hoje,
    jmsInicio: jmsAberto ? ini : null,
    por, em: new Date().toISOString(),
  };
}

// "hoje" no fuso do Batalhão, não no do servidor
export function hojeBatalhao(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
