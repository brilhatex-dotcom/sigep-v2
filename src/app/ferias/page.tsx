import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PlanoFeriasClient from "@/components/PlanoFeriasClient";
import FeriasAvulsas from "@/components/FeriasAvulsas";
import FeriasHojePainel from "@/components/FeriasHojePainel";
import { militaresDeFeriasHoje } from "@/lib/feriasHoje";
import { classificarPatente } from "@/lib/patentes";
import {
  paraData,
  dataBR,
  statusEquipe,
  hojeBR,
  CORES_STATUS,
  type Periodo,
} from "@/lib/ferias";

export const dynamic = "force-dynamic";

function ehOficial(postoGrad: string | null): boolean {
  return classificarPatente(postoGrad).ordem <= 7;
}

export default async function FeriasPage({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const todasEquipes = await prisma.equipeFerias.findMany();
  const anos = Array.from(new Set(todasEquipes.map((e) => e.anoGozo)))
    .filter(Boolean)
    .sort()
    .reverse();

  const anoSelecionado =
    searchParams.ano && anos.includes(searchParams.ano)
      ? searchParams.ano
      : anos[0] ?? String(new Date().getFullYear());

  const equipesAno = todasEquipes
    .filter((e) => e.anoGozo === anoSelecionado)
    .sort((a, b) => Number(a.numeroEquipe) - Number(b.numeroEquipe));

  const membros = await prisma.membroFerias.findMany({
    where: { anoGozo: anoSelecionado },
  });
  const ids = Array.from(new Set(membros.map((m) => m.idPmma)));
  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      postoGrad: true,
      numeroBarra: true,
      nome: true,
      nomeGuerra: true,
      matricula: true,
      quadro: true,
    },
  });
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));

  const hoje = hojeBR();
  const mesAtual = hoje.getMonth();

  const equipesView = equipesAno.map((e) => {
    const p1: Periodo = {
      inicio: paraData(e.periodo1Inicio),
      fim: paraData(e.periodo1Fim),
      apres: e.periodo1Apres,
    };
    const p2: Periodo = {
      inicio: paraData(e.periodo2Inicio),
      fim: paraData(e.periodo2Fim),
      apres: e.periodo2Apres,
    };
    const periodosBrutos = [p1];
    if (p2.inicio && p2.fim) periodosBrutos.push(p2);

    const st = statusEquipe(periodosBrutos);

    const emFeriasHoje = periodosBrutos.some(
      (p) => p.inicio && p.fim && p.inicio <= hoje && hoje <= p.fim
    );
    const noMes = periodosBrutos.some(
      (p) =>
        (p.inicio && p.inicio.getMonth() === mesAtual && p.inicio.getFullYear() === hoje.getFullYear()) ||
        (p.fim && p.fim.getMonth() === mesAtual && p.fim.getFullYear() === hoje.getFullYear())
    );

    const meusMembros = membros
      .filter((m) => m.numeroEquipe === e.numeroEquipe)
      .map((m) => {
        const f = mapaFicha.get(m.idPmma);
        return {
          efetivoId: m.idPmma,
          ordem: 0,
          postoGrad: f?.postoGrad ?? null,
          numeroBarra: f?.numeroBarra ?? null,
          nome: f?.nome ?? null,
          nomeGuerra: f?.nomeGuerra ?? null,
          matricula: f?.matricula ?? null,
          quadro: f?.quadro ?? null,
          ehOficial: ehOficial(f?.postoGrad ?? null),
        };
      })
      .sort((a, b) => {
        const pa = classificarPatente(a.postoGrad).ordem;
        const pb = classificarPatente(b.postoGrad).ordem;
        if (pa !== pb) return pa - pb;
        return (a.nome ?? "").localeCompare(b.nome ?? "");
      });

    return {
      numeroEquipe: e.numeroEquipe,
      periodos: periodosBrutos.map((p, i) => ({
        rotulo: i === 0 ? "1º período" : "2º período",
        inicioBR: dataBR(i === 0 ? e.periodo1Inicio : e.periodo2Inicio),
        fimBR: dataBR(i === 0 ? e.periodo1Fim : e.periodo2Fim),
        apres: dataBR(i === 0 ? e.periodo1Apres : e.periodo2Apres),
      })),
      status: { ...st, cor: CORES_STATUS[st.chave] },
      emFeriasHoje,
      noMes,
      membros: meusMembros,
    };
  });

  const totalMilitares = membros.length;
  const totalOficiais = membros.filter((m) =>
    ehOficial(mapaFicha.get(m.idPmma)?.postoGrad ?? null)
  ).length;
  const totalPracas = totalMilitares - totalOficiais;

  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const feriasHoje = await militaresDeFeriasHoje();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Plano de Férias {anoSelecionado}
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          {totalMilitares} militares em {equipesAno.length} equipes · ano de gozo {anoSelecionado}.
        </p>

        <FeriasHojePainel militares={feriasHoje} />

        {anos.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-8 text-center text-sm text-[#94A3B8]">
            Nenhum plano de férias cadastrado ainda.
          </div>
        ) : (
          <PlanoFeriasClient
            anos={anos}
            anoSelecionado={anoSelecionado}
            equipes={equipesView}
            totalMilitares={totalMilitares}
            totalOficiais={totalOficiais}
            totalPracas={totalPracas}
            isAdmin={isAdmin}
          />
        )}

        <FeriasAvulsas ano={anoSelecionado} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
