import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PainelPromocoes from "@/components/PainelPromocoes";
import CriarPeriodo from "@/components/CriarPeriodo";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";

export const dynamic = "force-dynamic";

export default async function PromocoesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  // policial vai direto para a propria tela de envio
  if (!ehAdmin) redirect("/promocoes/minhas-certidoes");
  const periodo = await periodoAtivo();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Promoções — Certidões
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Gestão das certidões enviadas pelos militares no período de promoção.
        </p>
        {!periodo ? (
          <CriarPeriodo />
        ) : (
          <PainelConteudo periodoId={periodo.id} nome={periodo.nome} dataAlvo={periodo.dataAlvo} />
        )}
      </div>
    </AppShell>
  );
}

async function PainelConteudo({
  periodoId,
  nome,
  dataAlvo,
}: {
  periodoId: string;
  nome: string;
  dataAlvo: string | null;
}) {
  const participantes = await prisma.participantePromocao.findMany({
    where: { periodoId },
    include: {
      _count: { select: { certidoes: true } },
    },
  });
  const ids = participantes.map((p) => p.efetivoId);
  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      postoGrad: true,
      nome: true,
      nomeGuerra: true,
      matricula: true,
    },
  });
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));
  const linhas = participantes
    .map((p) => {
      const f = mapaFicha.get(p.efetivoId);
      return {
        efetivoId: p.efetivoId,
        postoGrad: f?.postoGrad ?? null,
        nome: f?.nome ?? null,
        nomeGuerra: f?.nomeGuerra ?? null,
        matricula: f?.matricula ?? null,
        enviadas: p._count.certidoes,
        pdfUnificado: p.pdfUnificado,
      };
    })
    .sort((a, b) => b.enviadas - a.enviadas);

  // lista de todos os periodos (pro seletor e aba de arquivadas)
  const todos = await prisma.periodoPromocao.findMany({
    orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
    include: { _count: { select: { participantes: true } } },
  });
  const periodos = todos.map((p) => ({
    id: p.id,
    nome: p.nome,
    dataAlvo: p.dataAlvo,
    ativo: p.ativo,
    participantes: p._count.participantes,
  }));

  return (
    <PainelPromocoes
      periodoId={periodoId}
      periodoNome={nome}
      periodoData={dataAlvo}
      total={TOTAL_CERTIDOES}
      participantes={linhas}
      periodos={periodos}
    />
  );
}
