import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import HistoricoClient from "@/app/historico/HistoricoClient";

export const dynamic = "force-dynamic";

/* Aba HISTÓRICO POLICIAL MILITAR: a folha de assentamento do militar, no
   modelo do 18º BPM. Só o P/1 — a folha reúne dados pessoais, punições e
   processos de toda a carreira. */
export default async function HistoricoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/dashboard");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Histórico Policial Militar</h1>
        <p className="mb-5 text-sm text-apagado">
          Alimente as seções uma vez e gere o histórico no padrão, em Word ou PDF.
        </p>
        <HistoricoClient />
      </div>
    </AppShell>
  );
}
