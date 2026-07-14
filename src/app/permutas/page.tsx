import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import PermutasPolicialClient from "@/components/PermutasPolicialClient";

export const dynamic = "force-dynamic";

export default async function PermutasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const temFicha = !!(session.user as any).refEfetivo;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Permutas de Serviço</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Solicite a troca do seu serviço com um colega. Ele confirma o
          &ldquo;concordo&rdquo; e o P/1 defere. Aprovado, entra na escala.
        </p>
        <PermutasPolicialClient isAdmin={isAdmin} temFicha={temFicha} />
      </div>
    </AppShell>
  );
}
