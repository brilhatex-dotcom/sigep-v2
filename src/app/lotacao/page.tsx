import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import LotacaoLista, { GrupoLot } from "@/components/LotacaoLista";
import { classificarPatente } from "@/lib/patentes";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsInativos, semInativos } from "@/lib/inativos";
import { exigirAdminOuLugar } from "@/lib/guard";
import { filtrarPeloLugar } from "@/lib/lugarUsuario";
import { lotacaoLimpa } from "@/lib/formatarLotacao";

export const dynamic = "force-dynamic";

/* Ordena as lotacoes: as da SEDE (Comando, ADM, forcas operacionais, ROTEM...)
   vem primeiro; as Companhias (CIA) por ultimo. */
function pesoLotacao(lot: string): number {
  const u = (lot || "").toUpperCase();
  if (u.includes("CIA")) return 100; // companhias por ultimo
  const ordem = [
    "COMANDO", "SUBCOMANDO", "ESTADO MAIOR", "ADM", "ADMINISTR", "P/1", "P1",
    "CPU", "PERMAN", "GUARDA", "FORÇA TÁTICA", "FORCA TATICA",
    "RÁDIO PATRULHA", "RADIO PATRULHA", "ROTEM", "ROTAM", "INTELIG",
  ];
  for (let i = 0; i < ordem.length; i++) if (u.includes(ordem[i])) return i;
  return 50; // outras da sede, antes das CIAs
}

export default async function LotacaoPage() {
  const { session, admin, lugar } = await exigirAdminOuLugar();
  const ehAdmin = admin;

  const hoje = hojeLocal();

  const militares = filtrarPeloLugar(
    semInativos(
      await prisma.efetivo.findMany({
        select: {
          id: true, postoGrad: true, numeroBarra: true, nome: true,
          nomeGuerra: true, matricula: true, situacao: true, lotacao: true,
          jmsDataInicio: true, jmsDataRetorno: true,
        },
      }),
      await idsInativos(),
    ),
    lugar,
  );

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje, await idsFeriasAdiadas());
  for (const id of await idsFeriasAvulsasHoje(hoje)) idsFerias.add(id); // ferias em datas soltas

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  const mapa = new Map<string, typeof militares>();
  militares.forEach((m: (typeof militares)[number]) => {
    // agrupa pela lotacao JA SEM o prefixo numerico ("01. ROTEM" -> "ROTEM")
    const limpa = lotacaoLimpa(m.lotacao);
    const lot = limpa || "(sem lotação)";
    if (!mapa.has(lot)) mapa.set(lot, []);
    mapa.get(lot)!.push(m);
  });

  const grupos: GrupoLot[] = Array.from(mapa.entries())
    .map(([lotacao, lista]) => ({
      lotacao,
      lista: [...lista]
        .sort((a, b) => {
          const pa = classificarPatente(a.postoGrad).ordem;
          const pb = classificarPatente(b.postoGrad).ordem;
          if (pa !== pb) return pa - pb;
          return (a.nome ?? "").localeCompare(b.nome ?? "");
        })
        .map((m) => ({
          id: m.id,
          postoGrad: m.postoGrad,
          numeroBarra: m.numeroBarra,
          nome: m.nome,
          nomeGuerra: m.nomeGuerra,
          matricula: m.matricula,
          situacao: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
        })),
    }))
    .sort((a, b) => pesoLotacao(a.lotacao) - pesoLotacao(b.lotacao) || a.lotacao.localeCompare(b.lotacao));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <LotacaoLista grupos={grupos} totalMil={militares.length} isAdmin={ehAdmin} />
      </div>
    </AppShell>
  );
}
