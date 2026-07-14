import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import PublicacoesClient from "./PublicacoesClient";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage() {
  const session = await exigirAdmin();
  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <PublicacoesClient isAdmin={isAdmin} />
    </AppShell>
  );
}
