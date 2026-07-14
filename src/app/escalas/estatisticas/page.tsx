import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import EstatisticasClient from "./EstatisticasClient";

export const dynamic = "force-dynamic";

export default async function EstatisticasPage() {
  const session = await exigirAdmin();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <EstatisticasClient />
    </AppShell>
  );
}
