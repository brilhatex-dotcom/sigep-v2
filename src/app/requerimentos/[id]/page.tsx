import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentoDetalhe from "@/components/RequerimentoDetalhe";
import { ehModeloAquisicao, ehModeloTransferencia, registroDeOrigem } from "@/lib/requerimentos";
import { lerDadosArma } from "@/lib/requerimentoArma";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DetalheRequerimentoPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  const r = await prisma.requerimento.findUnique({ where: { id: params.id } });
  if (!r) redirect("/requerimentos");
  if (!ehAdmin && r.efetivoId !== meuEfetivo) redirect("/requerimentos");

  // "PISTOLA TAURUS G3C · CAL. 9MM · 01" — resumo do quadro 2 do formulário.
  // Na transferência entram o número de série e o registro da arma.
  const arma = ehModeloAquisicao(r.modelo) ? lerDadosArma(r.p2Complementares) : null;
  const transferencia = ehModeloTransferencia(r.modelo);
  const pceResumo = arma
    ? [
        [arma.produto, arma.marca, arma.modeloArma].filter(Boolean).join(" "),
        arma.calibre ? `CAL. ${arma.calibre}` : "",
        arma.quantidade ? `QTD. ${arma.quantidade}` : "",
        transferencia && arma.serie ? `SÉRIE ${arma.serie}` : "",
        transferencia && arma.registro ? `${registroDeOrigem(r.modelo)} Nº ${arma.registro}` : "",
      ].filter(Boolean).join(" · ")
    : "";
  // "2º SGT FULANO DE TAL · CPF 000.000.000-00" — quem passa a arma
  const alienanteResumo = arma && transferencia
    ? [
        [arma.alienantePosto, arma.alienanteNome].filter(Boolean).join(" "),
        arma.alienanteCpf ? `CPF ${arma.alienanteCpf}` : "",
      ].filter(Boolean).join(" · ")
    : "";

  const dados = {
    id: r.id,
    modalidade: r.modalidade === "OUTROS" && r.modalidadeOutros ? r.modalidadeOutros : r.modalidade,
    modelo: r.modelo,
    status: r.status,
    nomeCompleto: r.nomeCompleto ?? "",
    postoGrad: r.postoGrad ?? "",
    matricula: r.matricula ?? "",
    amparoLegal: r.amparoLegal ?? "",
    infoAdicional: r.infoAdicional ?? "",
    temDocx: !!r.docxKey,
    parecer: r.parecer ?? "",
    criadoEm: r.criadoEm.toISOString(),
    pce: pceResumo,
    alienante: alienanteResumo,
    cpf: r.cpf ?? "",
  };

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-3xl">
        <Link href="/requerimentos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <RequerimentoDetalhe dados={dados} ehAdmin={ehAdmin} />
      </div>
    </AppShell>
  );
}
