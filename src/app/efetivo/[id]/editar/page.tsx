import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import EfetivoForm from "@/components/EfetivoForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditarEfetivoPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militar = await prisma.efetivo.findUnique({ where: { id: params.id } });
  if (!militar) redirect("/efetivo");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const ehDono = session.user.refEfetivo === militar.id;
  // policial so edita a propria ficha
  if (!ehAdmin && !ehDono) redirect("/dashboard");

  // converte para Record<string,string|null> para o form
  const dados = JSON.parse(JSON.stringify(militar)) as Record<string, string | null>;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/efetivo/${encodeURIComponent(militar.id)}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à ficha
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">
          Editar — {militar.nome ?? militar.nomeGuerra ?? militar.id}
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          {militar.postoGrad ?? ""} {militar.nomeGuerra ? `· ${militar.nomeGuerra}` : ""}
        </p>

        <EfetivoForm militar={dados} isAdmin={ehAdmin} />
      </div>
    </AppShell>
  );
}
