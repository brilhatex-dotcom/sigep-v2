import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import GerarLoginsClient from "./GerarLoginsClient";

export const dynamic = "force-dynamic";

export default async function GerarLoginsPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <GerarLoginsClient />
    </AppShell>
  );
}
