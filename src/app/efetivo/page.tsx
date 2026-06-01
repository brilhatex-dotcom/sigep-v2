import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import EfetivoLista from "@/components/EfetivoLista";

export const dynamic = "force-dynamic";

export default async function EfetivoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militares = await prisma.efetivo.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      postoGrad: true,
      nome: true,
      nomeGuerra: true,
      matricula: true,
      situacao: true,
      lotacao: true,
      telefone: true,
    },
  });

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-sigep-navy">
          Cadastro de Efetivo
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {militares.length} militares cadastrados no 18º BPM.
        </p>
        <EfetivoLista militares={militares} />
      </div>
    </AppShell>
  );
}
