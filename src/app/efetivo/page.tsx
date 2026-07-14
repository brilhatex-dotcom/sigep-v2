import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EfetivoLista from "@/components/EfetivoLista";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";

export const dynamic = "force-dynamic";

export default async function EfetivoPage({
  searchParams,
}: {
  searchParams: { q?: string; situacao?: string };
}) {
  // >>> SEGURANCA: bloqueia policial por URL e empurra 1o acesso p/ trocar senha. <<<
  const session = await exigirAdmin();

  const hoje = hojeLocal();

  const militares = await prisma.efetivo.findMany({
    select: {
      id: true, postoGrad: true, nome: true, nomeGuerra: true,
      matricula: true, situacao: true, lotacao: true, telefone: true,
      jmsDataInicio: true, jmsDataRetorno: true,
    },
  });

  // ferias de hoje
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);
  for (const id of await idsFeriasAvulsasHoje(hoje)) idsFerias.add(id); // ferias em datas soltas

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  // aplica situacao calculada e remove os campos extra
  const lista = militares
    .map((m) => ({
      id: m.id,
      postoGrad: m.postoGrad,
      nome: m.nome,
      nomeGuerra: m.nomeGuerra,
      matricula: m.matricula,
      situacao: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
      lotacao: m.lotacao,
      telefone: m.telefone,
    }))
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Cadastro de Efetivo</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">{lista.length} militares cadastrados.</p>
        <EfetivoLista militares={lista} buscaInicial={searchParams.q ?? ""} situacaoInicial={searchParams.situacao ?? ""} />
      </div>
    </AppShell>
  );
}
