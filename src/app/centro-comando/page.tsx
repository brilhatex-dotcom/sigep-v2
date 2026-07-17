import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import CentroComandoClient from "@/components/CentroComandoClient";
import FeriasHojePainel from "@/components/FeriasHojePainel";
import { militaresDeFeriasHoje } from "@/lib/feriasHoje";

export const dynamic = "force-dynamic";

export default async function CentroComandoPage() {
  const session = await exigirAdmin();
  const feriasHoje = await militaresDeFeriasHoje();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <FeriasHojePainel militares={feriasHoje} />
      <CentroComandoClient />
    </AppShell>
  );
}
