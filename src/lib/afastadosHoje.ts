import { prisma } from "@/lib/prisma";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import {
  equipesEmFeriasHoje, equipesEmLicencaHoje, montarIdsEmFerias, montarIdsEmLicencaPremio,
} from "@/lib/situacao";

/* =========================================================================
   QUEM ESTÁ DE FÉRIAS / LICENÇA-PRÊMIO HOJE PELO PLANO — lendo do banco só o
   que a conta usa.

   A conta (montarIdsEmFerias / montarIdsEmLicencaPremio) só olha as equipes
   do ANO CORRENTE e os membros das equipes que estão em gozo HOJE. Mesmo
   assim, cada tela (Dashboard, Efetivo, Ficha, Organograma, Lotação,
   Antiguidade) lia a tabela de membros INTEIRA, de todos os anos — no
   Dashboard, duas vezes. É tráfego do Neon (cota de 5 GB/mês) jogado fora a
   cada visita. Aqui vêm só as equipes do ano e os membros das equipes em gozo;
   o resultado é o mesmo de antes.
   ========================================================================= */

export async function feriasHoje(hoje: Date, adiados?: Set<string>): Promise<Set<string>> {
  const ano = String(hoje.getFullYear());
  const equipes = await prisma.equipeFerias.findMany({
    where: { anoGozo: ano },
    select: {
      numeroEquipe: true, anoGozo: true,
      periodo1Inicio: true, periodo1Fim: true, periodo2Inicio: true, periodo2Fim: true,
    },
  });
  const emGozo = Array.from(equipesEmFeriasHoje(equipes, hoje));
  if (!emGozo.length) return new Set();
  const membros = await prisma.membroFerias.findMany({
    where: { anoGozo: ano, numeroEquipe: { in: emGozo } },
    select: { idPmma: true, numeroEquipe: true, anoGozo: true },
  });
  return montarIdsEmFerias(equipes, membros, hoje, adiados);
}

export async function licencaPremioHoje(hoje: Date): Promise<Set<string>> {
  const ano = String(hoje.getFullYear());
  const equipes = await prisma.equipeLicencaPremio.findMany({
    where: { anoGozo: ano },
    select: { numeroEquipe: true, anoGozo: true, periodoInicio: true, periodoFim: true },
  });
  const emGozo = Array.from(equipesEmLicencaHoje(equipes, hoje));
  if (!emGozo.length) return new Set();
  const membros = await prisma.membroLicencaPremio.findMany({
    where: { anoGozo: ano, numeroEquipe: { in: emGozo } },
    select: { idPmma: true, numeroEquipe: true, anoGozo: true },
  });
  return montarIdsEmLicencaPremio(equipes, membros, hoje);
}

/* Tudo de uma vez: férias do plano + avulsas (menos quem ADIOU) e
   licença-prêmio de hoje. As consultas vão ao banco JUNTAS — antes cada tela
   fazia estas mesmas 5 idas uma atrás da outra (e lia os adiados duas vezes). */
export async function afastadosHoje(hoje: Date): Promise<{
  ferias: Set<string>; licencaPremio: Set<string>; adiados: Set<string>;
}> {
  const [planoFerias, adiados, avulsas, licencaPremio] = await Promise.all([
    feriasHoje(hoje), idsFeriasAdiadas(), idsFeriasAvulsasHoje(hoje), licencaPremioHoje(hoje),
  ]);
  // Quem adiou não sai de férias — nem pelo plano, nem pela avulsa.
  const ferias = new Set<string>();
  for (const id of planoFerias) if (!adiados.has(id)) ferias.add(id);
  for (const id of avulsas) if (!adiados.has(id)) ferias.add(id);
  return { ferias, licencaPremio, adiados };
}
