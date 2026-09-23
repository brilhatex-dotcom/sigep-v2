import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AntiguidadeTabela, { MilitarLinha } from "@/components/AntiguidadeTabela";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsInativos, semInativos } from "@/lib/inativos";
import { compararAntiguidade } from "@/lib/antiguidade";

export const dynamic = "force-dynamic";

export default async function AntiguidadePage({
  searchParams,
}: {
  searchParams: { posto?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const hoje = hojeLocal();

  const militares = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true,
        matricula: true, rg: true, cpf: true, situacao: true, lotacao: true,
        dataPromocao: true, jmsDataInicio: true, jmsDataRetorno: true,
      },
    }),
    await idsInativos(),
  );

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje, await idsFeriasAdiadas());
  // ferias em datas soltas contam igual as do plano — sem isso, quem esta de
  // ferias avulsas aparecia aqui como se estivesse a disposicao
  // As férias avulsas também respeitam o adiamento: sem isto, quem o P/1
  // acabou de adiar voltava a aparecer de férias por esta linha.
  const idsAdiadosAvulsas = await idsFeriasAdiadas();
  for (const id of await idsFeriasAvulsasHoje(hoje)) if (!idsAdiadosAvulsas.has(id)) idsFerias.add(id);

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  // a regra mora em src/lib/antiguidade.ts (a Planilha Padrao usa a mesma)
  const ordenados = [...militares].sort(compararAntiguidade);

  const linhas: MilitarLinha[] = ordenados.map((m) => ({
    id: m.id, postoGrad: m.postoGrad, numeroBarra: m.numeroBarra,
    nome: m.nome, nomeGuerra: m.nomeGuerra, matricula: m.matricula,
    rg: m.rg, cpf: m.cpf,
    situacao: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
    lotacao: m.lotacao,
  }));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Efetivo por Antiguidade</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Ordenado por posto e, dentro de cada posto, por data de promoção. Situação atualizada (férias/JMS/licença-prêmio de hoje).
        </p>
        <AntiguidadeTabela militares={linhas} postoInicial={searchParams.posto ?? ""} />
      </div>
    </AppShell>
  );
}
