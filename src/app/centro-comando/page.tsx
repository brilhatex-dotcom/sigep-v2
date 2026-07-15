import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import CentroComandoClient from "@/components/CentroComandoClient";

export const dynamic = "force-dynamic";

export default async function CentroComandoPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <CentroComandoClient />
    </AppShell>
  );
}
