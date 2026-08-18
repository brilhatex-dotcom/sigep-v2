import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileUp, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import PainelPromocoes from "@/components/PainelPromocoes";
import CriarPeriodo from "@/components/CriarPeriodo";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";
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

        {temFicha ? (
          <Link
            href="/promocoes/minhas-certidoes"
            className="mb-5 inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 px-3 py-2 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10"
          >
            <FileUp className="h-4 w-4" />
            Enviar as minhas certidões
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
  const mapaP1 = await lerMapaP1();
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
        pdfUnificado: p.pdfUnificado,
        enviadoP1Em: st?.enviadoEm ?? null,
        recebidoP1Em: st?.recebidoEm ?? null,
      };
    })
    // ordena: enviados ao P/1 e ainda nao recebidos primeiro, depois por certidoes
    .sort((a, b) => {
      const pa = a.enviadoP1Em && !a.recebidoP1Em ? 1 : 0;
      const pb = b.enviadoP1Em && !b.recebidoP1Em ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.enviadas - a.enviadas;
    });

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
