import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import OrganogramaArvore, { Contagens } from "@/components/OrganogramaArvore";
import { ORGANOGRAMA, NoOrg, pertenceAoNo } from "@/lib/organograma";

export const dynamic = "force-dynamic";

function contar(no: NoOrg, lotacoes: (string | null)[], acc: Contagens) {
  acc[no.id] = lotacoes.filter((l) => pertenceAoNo(l, no)).length;
  for (const f of no.filhos ?? []) contar(f, lotacoes, acc);
}

export default async function OrganogramaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militares = await prisma.efetivo.findMany({ select: { lotacao: true } });
  const lotacoes = militares.map((m) => m.lotacao);

  const contagens: Contagens = {};
  contar(ORGANOGRAMA, lotacoes, contagens);

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Organograma — 18º BPM</h1>
        <p className="mb-6 text-sm text-[#94A3B8]">
          Estrutura do batalhão (Memorando 116/2022). Clique em uma CIA ou pelotão para ver o efetivo.
        </p>
        <OrganogramaArvore raiz={ORGANOGRAMA} contagens={contagens} />
      </div>
    </AppShell>
  );
}
