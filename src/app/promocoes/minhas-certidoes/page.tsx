import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import MinhasCertidoes from "@/components/MinhasCertidoes";
import { periodoAtivo } from "@/lib/promocoes";
import { CERTIDOES_EXIGIDAS, TOTAL_CERTIDOES } from "@/lib/certidoes";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MinhasCertidoesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const efetivoId = session.user.refEfetivo;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold text-white">
          Minhas Certidões para Promoção
        </h1>
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

  const participante = await prisma.participantePromocao.findUnique({
    where: { periodoId_efetivoId: { periodoId: periodo.id, efetivoId } },
    include: { certidoes: true },
  });

  const enviadas = new Map(
    (participante?.certidoes ?? []).map((c) => [c.ordem, c.nomeArquivo])
  );

  const itens = CERTIDOES_EXIGIDAS.map((c) => ({
    ordem: c.ordem,
    orgao: c.orgao,
    descricao: c.descricao,
    link: c.link,
    linkRotulo: c.linkRotulo,
    enviada: enviadas.has(c.ordem),
    nomeArquivo: enviadas.get(c.ordem) ?? null,
  }));

  const st = await statusP1(periodo.id, efetivoId);

  return (
    <>
      <p className="mb-5 text-sm text-[#94A3B8]">
        Período: <span className="font-semibold text-[#D4AF37]">{periodo.nome}</span>.
        Envie cada certidão em PDF. Quando as {TOTAL_CERTIDOES} estiverem
        enviadas, gere o PDF unificado e envie ao P/1.
      </p>
      <MinhasCertidoes
        itens={itens}
        total={TOTAL_CERTIDOES}
        pdfUnificadoKey={participante?.pdfUnificado ?? null}
        efetivoId={efetivoId}
        enviadoP1Em={st?.enviadoEm ?? null}
        recebidoP1Em={st?.recebidoEm ?? null}
      />
    </>
  );
}
