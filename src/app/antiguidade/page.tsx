import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AntiguidadeTabela, { MilitarLinha } from "@/components/AntiguidadeTabela";
import { hojeLocal, situacaoCalculada } from "@/lib/situacao";
import { afastadosHoje } from "@/lib/afastadosHoje";
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

  // RAPIDEZ: efetivo, saídas e afastamentos de hoje vão ao banco juntos
  const [fichasBrutas, inativos, afastados] = await Promise.all([
    prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true,
        matricula: true, rg: true, cpf: true, situacao: true, lotacao: true,
        dataPromocao: true, jmsDataInicio: true, jmsDataRetorno: true,
      },
    }),
    idsInativos(),
    afastadosHoje(hoje),
  ]);
  const militares = semInativos(fichasBrutas, inativos);

  // férias (plano + avulsas, menos quem adiou) e licença-prêmio de hoje
  const idsFerias = afastados.ferias;
  const idsLicencaPremio = afastados.licencaPremio;

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
