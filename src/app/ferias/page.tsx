import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PlanoFeriasClient from "@/components/PlanoFeriasClient";
import FeriasAvulsas from "@/components/FeriasAvulsas";
import { classificarPatente } from "@/lib/patentes";
import { numeracaoDoAno } from "@/lib/numeracaoMemorandos";
import {
  paraData,
  dataBR,
  statusEquipe,
  hojeBR,
  CORES_STATUS,
  type Periodo,
} from "@/lib/ferias";
import { motivosSustacao, motivoDe } from "@/lib/feriasSustacao";
import { foraDoPlano, problemasDoPlano, type ForaDoPlano as ItemFora, type ProblemaPlano, type FeriasAtrasadas } from "@/lib/feriasForaDoPlano";
import ProblemasDoPlano from "@/components/ProblemasDoPlano";
import ForaDoPlano from "@/components/ForaDoPlano";

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
      // usada no painel "Distribuição por unidade": mostra quantos de cada
      // unidade saem de férias em cada equipe
      lotacao: true,
    },
  });
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));

  const hoje = hojeBR();
  const mesAtual = hoje.getMonth();
  const motivos = await motivosSustacao();

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
          lotacao: f?.lotacao ?? null,
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
      motivoSustacao: motivoDe(motivos, e.anoGozo, e.numeroEquipe),
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

  /* Militares ativos fora de qualquer equipe — só no plano do PRÓXIMO
     exercício: o do ano corrente está em andamento e não recebe inclusão
     automática (quem chegar no meio do ano entra à mão, em "Adicionar"). */
  const anoCorrente = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
  const planoFuturo = Number(anoSelecionado) > anoCorrente;
  let fora: ItemFora[] = [];
  if (isAdmin && planoFuturo) { try { fora = await foraDoPlano(anoSelecionado); } catch { /* sem aviso */ } }
  // e o contrário: quem está no plano e já saiu da unidade, ou está repetido
  let problemas: { saidos: ProblemaPlano[]; repetidos: ProblemaPlano[]; atrasadas: FeriasAtrasadas[] } = { saidos: [], repetidos: [], atrasadas: [] };
  if (isAdmin && planoFuturo) { try { problemas = await problemasDoPlano(anoSelecionado); } catch { /* sem aviso */ } }

  // houve reequilíbrio com cópia guardada? (botão "Desfazer reequilíbrio")
  let reequilibrioEm: string | null = null;
  if (isAdmin) {
    try {
      const row = await prisma.config.findUnique({ where: { chave: `ferias_reequilibrio_backup_${anoSelecionado}` }, select: { valor: true } });
      reequilibrioEm = row?.valor ? (JSON.parse(row.valor)?.em ?? null) : null;
    } catch { /* sem cópia */ }
  }

  // Numeração contínua dos memorandos do ano (plano + férias avulsas
  // intercaladas). A LP continua a partir do último número.
  const numeracao = await numeracaoDoAno(anoSelecionado);

  // Militares que ADIARAM as férias (não saem de férias; alimentam o relatório
  // de férias vencidas). Guardado em Config "ferias_postergados".
  let postergadosIniciais: { idPmma: string; nome: string; motivo: string; data: string; exercicio?: string }[] = [];
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_postergados" } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    if (Array.isArray(lista)) postergadosIniciais = lista;
  } catch {}

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Plano de Férias {anoSelecionado}
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          {totalMilitares} militares em {equipesAno.length} equipes · ano de gozo {anoSelecionado}.
        </p>

        {anos.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-8 text-center text-sm text-[#94A3B8]">
            Nenhum plano de férias cadastrado ainda.
          </div>
        ) : (
          <>
          {isAdmin && (
            <ProblemasDoPlano ano={anoSelecionado} saidos={problemas.saidos} repetidos={problemas.repetidos} atrasadas={problemas.atrasadas} />
          )}
          {isAdmin && (
            <ForaDoPlano ano={anoSelecionado} itens={fora} equipes={equipesAno.map((e) => e.numeroEquipe)} />
          )}
          <PlanoFeriasClient
            anos={anos}
            anoSelecionado={anoSelecionado}
            equipes={equipesView}
            totalMilitares={totalMilitares}
            totalOficiais={totalOficiais}
            totalPracas={totalPracas}
            isAdmin={isAdmin}
            numerosMemorando={numeracao.militares}
            postergadosIniciais={postergadosIniciais}
            reequilibrioEm={reequilibrioEm}
          />
          </>
        )}

        <FeriasAvulsas ano={anoSelecionado} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
