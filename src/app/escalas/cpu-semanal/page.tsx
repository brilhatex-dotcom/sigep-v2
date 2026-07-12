import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import CpuSemanalClient from "./CpuSemanalClient";

export const dynamic = "force-dynamic";

export default async function CpuSemanalPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <CpuSemanalClient />
    </AppShell>
  );
}
