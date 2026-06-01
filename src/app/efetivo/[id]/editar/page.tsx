import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import EfetivoForm from "@/components/EfetivoForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditarPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const id = decodeURIComponent(params.id);
  const m = await prisma.efetivo.findUnique({ where: { id } });

  const voltar = (
    <Link
      href={`/efetivo/${encodeURIComponent(id)}`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-sigep-navy"
    >
      <ArrowLeft className="h-4 w-4" /> Voltar à ficha
    </Link>
  );

  if (!m) {
    return (
      <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
        <div className="mx-auto max-w-3xl">
          {voltar}
          <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm ring-1 ring-gray-100">
            Militar não encontrado.
          </div>
        </div>
      </AppShell>
    );
  }

  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const isDono = session.user.refEfetivo === id;

  if (!isAdmin && !isDono) {
    return (
      <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
        <div className="mx-auto max-w-3xl">
          {voltar}
          <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm ring-1 ring-gray-100">
            Você não tem permissão para editar esta ficha. Apenas o
            administrador ou o próprio militar podem fazer alterações.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        {voltar}
        <h1 className="mb-1 text-2xl font-bold text-sigep-navy">
          Editar — {m.nome ?? "(sem nome)"}
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {[m.postoGrad, m.nomeGuerra].filter(Boolean).join(" · ") || "—"}
        </p>
        <EfetivoForm militar={m} isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
