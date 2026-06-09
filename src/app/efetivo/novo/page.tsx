import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import NovoEfetivoForm from "@/components/NovoEfetivoForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NovoEfetivoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // somente admin cadastra novo militar
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/efetivo");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <Link
          href="/efetivo"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à lista
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">Novo Militar</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Preencha os dados. O ID PMMA é obrigatório e não pode repetir.
        </p>
        <NovoEfetivoForm />
      </div>
    </AppShell>
  );
}
