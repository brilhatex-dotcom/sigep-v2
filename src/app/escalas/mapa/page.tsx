import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "./MapaClient";

export const dynamic = "force-dynamic";

export default async function MapaEscalaPage() {
  const session = await exigirAdmin();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <MapaClient />
    </AppShell>
  );
}