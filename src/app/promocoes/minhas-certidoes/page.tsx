import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import MinhasCertidoes from "@/components/MinhasCertidoes";
import MinhaCertidaoP1 from "@/components/MinhaCertidaoP1";
import { periodoAtivo, postoDoMilitar } from "@/lib/promocoes";
import { certidoesExigidas, ehCpopm } from "@/lib/certidoes";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { chaveCertidaoUnificada } from "@/lib/promocaoUpload";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MinhasCertidoesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const efetivoId = session.user.refEfetivo;
  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Minhas Certidões para Promoção
        </h1>
        {/* O menu leva o admin para o painel do P/1, entao ele chega aqui pelo
            atalho de la — este link e a volta, para nao ficar sem saida. */}
        {ehAdmin && (
          <Link
            href="/promocoes"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#D4AF37] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel do P/1
          </Link>
        )}
        <Conteudo efetivoId={efetivoId} />
      </div>
    </AppShell>
  );
}

async function Conteudo({ efetivoId }: { efetivoId: string | null }) {
  if (!efetivoId) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Seu usuário não está vinculado a uma ficha de efetivo, então não é
        possível enviar certidões por aqui. Avise o administrador.
      </div>
    );
  }

  const periodo = await periodoAtivo();
  if (!periodo) {
    return (
      <div className="mt-4 rounded-xl ui-card p-6 text-sm text-[#94A3B8]">
        Nenhum período de promoção está aberto no momento. Quando o
        administrador abrir, as certidões aparecerão aqui para envio.
      </div>
    );
  }

  // RAPIDEZ: certidões, posto e situação no P/1 vão ao banco juntos
  const [participante, posto, st] = await Promise.all([
    prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
      include: { certidoes: true },
    }),
    postoDoMilitar(efetivoId),
    statusP1(periodo.id, efetivoId),
  ]);

  const enviadas = new Map(
    (participante?.certidoes ?? []).map((c) => [c.ordem, c.nomeArquivo])
  );
  // itens 4 a 8 preenchidos de uma vez pela Certidao Unificada da Justica Federal
  const chaveUnificada = chaveCertidaoUnificada(periodo.id, efetivoId);
  const pelaUnificada = new Set(
    (participante?.certidoes ?? []).filter((c) => c.r2Key === chaveUnificada).map((c) => c.ordem)
  );

  // oficial: 9 certidoes (inclui o TRF da 6ª Regiao); praca: 8
  const exigidas = certidoesExigidas(posto);
  const total = exigidas.length;
  const itens = exigidas.map((c) => ({
    ordem: c.ordem,
    orgao: c.orgao,
    descricao: c.descricao,
    link: c.link,
    linkRotulo: c.linkRotulo,
    enviada: enviadas.has(c.ordem),
    nomeArquivo: enviadas.get(c.ordem) ?? null,
    pelaUnificada: pelaUnificada.has(c.ordem),
  }));


  return (
    <>
      <p className="mb-5 text-sm text-[#94A3B8]">
        Período: <span className="font-semibold text-[#D4AF37]">{periodo.nome}</span>.
        Siga os 3 passos: envie as certidões em PDF (as 3 estaduais e a
        Certidão Unificada da Justiça Federal, que vale do TRF1 ao TRF5
        {ehCpopm(posto) ? " — e, para oficial e subtenente, a do TRF da 6ª Região" : ""}),
        gere o PDF unificado e envie ao P/1.
      </p>
      <MinhasCertidoes
        itens={itens}
        total={total}
        pdfUnificadoKey={participante?.pdfUnificado ?? null}
        efetivoId={efetivoId}
        enviadoP1Em={st?.enviadoEm ?? null}
        recebidoP1Em={st?.recebidoEm ?? null}
      >
        {/* oficial e subtenente geram aqui a própria declaração individual */}
        {ehCpopm(posto) && <MinhaCertidaoP1 />}
      </MinhasCertidoes>
    </>
  );
}
