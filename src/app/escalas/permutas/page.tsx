import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import PermutasClient from "./PermutasClient";

export const dynamic = "force-dynamic";

export default async function PermutasPage() {
  const session = await exigirAdmin();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <PermutasClient />
    </AppShell>
  );
}
