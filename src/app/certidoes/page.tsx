import { exigirAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import CertidoesClient from "@/components/CertidoesClient";
import { idsInativos, semInativos } from "@/lib/inativos";
import { compararAntiguidade } from "@/lib/antiguidade";

export const dynamic = "force-dynamic";

/* CERTIDÕES do P/1: os modelos de certidão que o sistema monta sozinho —
   escolhe o modelo, escolhe o policial, confere e baixa em Word. Por
   enquanto, a Certidão para Medalha do Serviço Policial Militar. */
export default async function CertidoesPage() {
  const session = await exigirAdmin();
  const [fichas, inativos] = await Promise.all([
    prisma.efetivo.findMany({
      select: { id: true, postoGrad: true, nome: true, nomeGuerra: true, matricula: true, numeroBarra: true, dataPromocao: true },
    }),
    idsInativos(),
  ]);
  const efetivo = semInativos(fichas, inativos)
    .sort(compararAntiguidade)
    .map((f) => ({
      id: f.id,
      postoGrad: f.postoGrad || "",
      nome: f.nome || "",
      nomeGuerra: f.nomeGuerra || "",
      matricula: f.matricula || "",
    }));
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <CertidoesClient efetivo={efetivo} />
    </AppShell>
  );
}
