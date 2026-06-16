import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalaClient from "./EscalaClient";

export const dynamic = "force-dynamic";

export default async function EscalasPage() {
  const session = await exigirAdmin();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalaClient />
    </AppShell>
  );
}