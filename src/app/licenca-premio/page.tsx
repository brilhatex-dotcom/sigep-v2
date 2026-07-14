import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import LicencaPremioClient from "@/components/LicencaPremioClient";
import { classificarPatente } from "@/lib/patentes";
import { paraData, dataBR, hojeBR, diffDias } from "@/lib/ferias";

export const dynamic = "force-dynamic";

// As 4 equipes sao fixas e sempre aparecem, mesmo sem registro no banco
// ainda (evita ter que "semear" linhas antes de usar a tela).
const EQUIPES_FIXAS = ["1", "2", "3", "4"];

function ehOficial(postoGrad: string | null): boolean {
  return classificarPatente(postoGrad).ordem <= 7;
}

type StatusChave = "concluida" | "em_licenca" | "agendada" | "indefinida";

function statusEquipeLicenca(inicio: Date | null, fim: Date | null) {
  const hoje = hojeBR();
  if (!inicio || !fim) {
    return { chave: "indefinida" as StatusChave, rotulo: "Sem datas", detalhe: "" };
  }
  if (inicio <= hoje && hoje <= fim) {
    const restantes = diffDias(hoje, fim);
    return {
      chave: "em_licenca" as StatusChave,
      rotulo: "Em Licença-Prêmio",
      detalhe: restantes <= 0 ? "último dia" : `${restantes} dia(s) restante(s)`,
    };
  }
  if (inicio > hoje) {
    const faltam = diffDias(hoje, inicio);
    return { chave: "agendada" as StatusChave, rotulo: "Agendada", detalhe: `Sai em ${faltam} dia(s)` };
  }
  return { chave: "concluida" as StatusChave, rotulo: "Concluída", detalhe: "Concluída" };
}

const CORES_STATUS: Record<StatusChave, string> = {
  concluida: "bg-gray-100 text-gray-600",
  em_licenca: "bg-amber-100 text-amber-700",
  agendada: "bg-emerald-100 text-emerald-700",
  indefinida: "bg-slate-100 text-slate-500",
};

export default async function LicencaPremioPage({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const hoje = hojeBR();
  const anoAtual = String(hoje.getFullYear());

  const todasEquipes = await prisma.equipeLicencaPremio.findMany();
  const anosBanco = Array.from(new Set(todasEquipes.map((e) => e.anoGozo)));
  const anos = Array.from(new Set([anoAtual, ...anosBanco])).sort().reverse();

  const anoSelecionado =
    searchParams.ano && anos.includes(searchParams.ano) ? searchParams.ano : anoAtual;

  const equipesAno = todasEquipes.filter((e) => e.anoGozo === anoSelecionado);
  const mapaEquipe = new Map(equipesAno.map((e) => [e.numeroEquipe, e]));

  const membros = await prisma.membroLicencaPremio.findMany({
    where: { anoGozo: anoSelecionado },
  });
  const ids = Array.from(new Set(membros.map((m) => m.idPmma)));
  const fichas = ids.length
    ? await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, postoGrad: true, numeroBarra: true, nome: true,
          nomeGuerra: true, matricula: true, quadro: true,
        },
      })
    : [];
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));

  const mesAtual = hoje.getMonth();

  const equipesView = EQUIPES_FIXAS.map((num) => {
    const e = mapaEquipe.get(num);
    const inicio = paraData(e?.periodoInicio ?? null);
    const fim = paraData(e?.periodoFim ?? null);
    const st = statusEquipeLicenca(inicio, fim);

    const emLicencaHoje = st.chave === "em_licenca";
    const noMes = !!(
      (inicio && inicio.getMonth() === mesAtual && inicio.getFullYear() === hoje.getFullYear()) ||
      (fim && fim.getMonth() === mesAtual && fim.getFullYear() === hoje.getFullYear())
    );

    const meusMembros = membros
      .filter((m) => m.numeroEquipe === num)
      .map((m) => {
        const f = mapaFicha.get(m.idPmma);
        return {
          membroId: m.id,
          efetivoId: m.idPmma,
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
      numeroEquipe: num,
      inicioBR: dataBR(e?.periodoInicio ?? null),
      fimBR: dataBR(e?.periodoFim ?? null),
      status: { ...st, cor: CORES_STATUS[st.chave] },
      emLicencaHoje,
      noMes,
      membros: meusMembros,
    };
  });

  const totalMilitares = membros.length;
  const totalOficiais = membros.filter((m) =>
    ehOficial(mapaFicha.get(m.idPmma)?.postoGrad ?? null)
  ).length;
  const totalPracas = totalMilitares - totalOficiais;

  // Numeracao CONTINUA dos memorandos: as ferias ocupam 1..N (N = total de
  // militares do plano de ferias do mesmo ano); a Licenca-Premio segue logo
  // em seguida (N+1 em diante — ex.: ferias terminando em 107, LP comeca em
  // 108). Contamos os militares de ferias do ano para saber onde continuar.
  const baseNumeroMemorando = await prisma.membroFerias.count({
    where: { anoGozo: anoSelecionado },
  });

  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Licença-Prêmio {anoSelecionado}
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          {totalMilitares} militares em 4 equipes · 3 meses cada · ano {anoSelecionado}.
        </p>

        <LicencaPremioClient
          anos={anos}
          anoSelecionado={anoSelecionado}
          equipes={equipesView}
          totalMilitares={totalMilitares}
          totalOficiais={totalOficiais}
          totalPracas={totalPracas}
          idsJaAlocados={ids}
          baseNumeroMemorando={baseNumeroMemorando}
          isAdmin={isAdmin}
        />
      </div>
    </AppShell>
  );
}
