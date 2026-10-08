import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileUp, AlertTriangle, ShieldCheck, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PainelPromocoes from "@/components/PainelPromocoes";
import { compararAntiguidade } from "@/lib/antiguidade";
import CriarPeriodo from "@/components/CriarPeriodo";
import { periodoAtivo } from "@/lib/promocoes";
import { totalCertidoes } from "@/lib/certidoes";
import { lerMapaP1 } from "@/lib/promocaoStatusP1";

export const dynamic = "force-dynamic";

export default async function PromocoesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  // policial vai direto para a propria tela de envio
  if (!ehAdmin) redirect("/promocoes/minhas-certidoes");
  const periodo = await periodoAtivo();

  // O administrador tambem e militar e tambem concorre a promocao, entao
  // tambem precisa mandar as PROPRIAS certidoes. Como o menu leva o admin
  // para este painel do P/1 (e so o policial e desviado para a tela de
  // envio), sem este atalho ele nao tinha por onde chegar na propria tela.
  const temFicha = !!session.user.refEfetivo;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Promoções — Certidões
        </h1>
        <p className="mb-4 text-sm text-[#94A3B8]">
          Gestão das certidões enviadas pelos militares no período de promoção.
        </p>

        {/* Lançar o listão: quando sai a relação de promovidos, promove todo
            mundo de uma vez em vez de ficha por ficha. */}
        <Link
          href="/promocoes/listao"
          className="mb-3 flex items-start gap-3 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/[.06] p-4 transition hover:bg-[#D4AF37]/[.12]"
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">Importar listão de promoções</span>
            <span className="block text-xs text-[#94A3B8]">
              Saiu a relação de promovidos? Jogue o PDF aqui: o sistema acha quem é do 18º BPM,
              mostra para o senhor conferir e promove todos de uma vez.
            </span>
          </span>
        </Link>

        {/* As certidões do PRÓPRIO admin: uma faixa bem visível, no mesmo
            dourado do 1º passo da tela para onde ela leva. */}
        {temFicha ? (
          <Link
            href="/promocoes/minhas-certidoes"
            className="group mb-5 flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#e8c55a] to-amber-500 px-4 py-3 text-[#1a1205] shadow-[0_10px_30px_-12px_rgba(212,175,55,0.55)] ring-1 ring-[#D4AF37]/60 transition hover:brightness-110"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/20 ring-2 ring-white/30">
              <FileUp className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black uppercase tracking-[0.22em] opacity-80">
                O senhor também concorre
              </span>
              <span className="block text-base font-bold leading-tight">Enviar as minhas certidões</span>
              <span className="block text-[11px] opacity-80">
                1º envie as certidões · 2º gere o PDF · 3º envie ao P/1
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold sm:inline-flex">
              Abrir <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 sm:hidden" />
          </Link>
        ) : (
          <p className="mb-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Seu usuário de administrador não está vinculado a uma ficha de
            efetivo, então não dá para enviar certidões próprias por aqui.
            Vincule a ficha em Usuários e logins.
          </p>
        )}
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
  // RAPIDEZ: participantes, situação no P/1 e lista de períodos vão juntos
  const [participantes, mapaP1, todos] = await Promise.all([
    prisma.participantePromocao.findMany({
      where: { periodoId },
      include: {
        _count: { select: { certidoes: true } },
      },
    }),
    lerMapaP1(),
    // lista de todos os periodos (pro seletor e aba de arquivadas)
    prisma.periodoPromocao.findMany({
      orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
      include: { _count: { select: { participantes: true } } },
    }),
  ]);
  const ids = participantes.map((p) => p.efetivoId);
  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      postoGrad: true,
      nome: true,
      nomeGuerra: true,
      matricula: true,
      dataPromocao: true,
      numeroBarra: true,
    },
  });
  const mapaFicha = new Map(fichas.map((f) => [f.id, f]));
  const linhas = participantes
    .map((p) => {
      const f = mapaFicha.get(p.efetivoId);
      const st = mapaP1[`${periodoId}:${p.efetivoId}`];
      return {
        efetivoId: p.efetivoId,
        postoGrad: f?.postoGrad ?? null,
        nome: f?.nome ?? null,
        nomeGuerra: f?.nomeGuerra ?? null,
        matricula: f?.matricula ?? null,
        enviadas: p._count.certidoes,
        // oficial deve 9 certidoes (inclui o TRF da 6ª Regiao); praca, 8
        total: totalCertidoes(f?.postoGrad ?? null),
        pdfUnificado: p.pdfUnificado,
        enviadoP1Em: st?.enviadoEm ?? null,
        recebidoP1Em: st?.recebidoEm ?? null,
      };
    })
    /* Ordem: primeiro quem ENVIOU e aguarda a conferencia (e o trabalho do
       P/1 agora); dentro de cada grupo, a ANTIGUIDADE. Antes o desempate era
       "quem mandou mais certidoes", e a lista virava a ordem de chegada — um
       soldado adiantado aparecia acima do 1º Sargento mais antigo. A mesma
       regua da Planilha Padrao e da tela de Antiguidade. */
    .sort((a, b) => {
      const pa = a.enviadoP1Em && !a.recebidoP1Em ? 1 : 0;
      const pb = b.enviadoP1Em && !b.recebidoP1Em ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const fa = mapaFicha.get(a.efetivoId), fb = mapaFicha.get(b.efetivoId);
      return compararAntiguidade(
        { postoGrad: a.postoGrad, nome: a.nome, dataPromocao: fa?.dataPromocao ?? null, numeroBarra: fa?.numeroBarra ?? null },
        { postoGrad: b.postoGrad, nome: b.nome, dataPromocao: fb?.dataPromocao ?? null, numeroBarra: fb?.numeroBarra ?? null },
      );
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
      participantes={linhas}
      periodos={periodos}
    />
  );
}
