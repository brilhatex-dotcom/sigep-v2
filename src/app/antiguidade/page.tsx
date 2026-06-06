import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AntiguidadeTabela, { MilitarLinha } from "@/components/AntiguidadeTabela";
import { classificarPatente } from "@/lib/patentes";
import { hojeLocal, montarIdsEmFerias, situacaoCalculada } from "@/lib/situacao";

export const dynamic = "force-dynamic";

function ordemData(valor: string | null): number {
  if (!valor || !valor.trim()) return 99999999;
  const s = valor.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return +`${iso[1]}${iso[2]}${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return +`${br[3]}${br[2]}${br[1]}`;
  return 99999999;
}

export default async function AntiguidadePage({
  searchParams,
}: {
  searchParams: { posto?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const hoje = hojeLocal();

  const militares = await prisma.efetivo.findMany({
    select: {
      id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true,
      matricula: true, rg: true, cpf: true, situacao: true, lotacao: true,
      dataPromocao: true, jmsDataInicio: true, jmsDataRetorno: true,
    },
  });

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);

  const ordenados = [...militares].sort((a, b) => {
    const pa = classificarPatente(a.postoGrad).ordem;
    const pb = classificarPatente(b.postoGrad).ordem;
    if (pa !== pb) return pa - pb;
    const da = ordemData(a.dataPromocao);
    const db = ordemData(b.dataPromocao);
    if (da !== db) return da - db;
    return (a.numeroBarra ?? "").localeCompare(b.numeroBarra ?? "");
  });

  const linhas: MilitarLinha[] = ordenados.map((m) => ({
    id: m.id, postoGrad: m.postoGrad, numeroBarra: m.numeroBarra,
    nome: m.nome, nomeGuerra: m.nomeGuerra, matricula: m.matricula,
    rg: m.rg, cpf: m.cpf,
    situacao: situacaoCalculada(m, idsFerias, hoje),
    lotacao: m.lotacao,
  }));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Efetivo por Antiguidade</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Ordenado por posto e, dentro de cada posto, por data de promoção. Situação atualizada (férias/JMS de hoje).
        </p>
        <AntiguidadeTabela militares={linhas} postoInicial={searchParams.posto ?? ""} />
      </div>
    </AppShell>
  );
}
