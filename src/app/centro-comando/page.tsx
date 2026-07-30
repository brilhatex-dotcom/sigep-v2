import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import CentroComandoClient from "@/components/CentroComandoClient";

export const dynamic = "force-dynamic";

/* Só o controle de entrada e saída. A lista de quem está de férias hoje
   fica no Dashboard — aqui ela não tem relação com a movimentação. */

export default async function CentroComandoPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <CentroComandoClient />
    </AppShell>
  );
}
