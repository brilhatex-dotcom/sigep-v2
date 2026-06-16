import { exigirLogin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import CursosClient from "./CursosClient";

export const dynamic = "force-dynamic";

export default async function CursosPage() {
  const session = await exigirLogin();
  const perfil = (session.user as any).perfil ?? "";
  return (
    <AppShell userName={session.user.name ?? ""} perfil={perfil}>
      <CursosClient perfil={perfil} />
    </AppShell>
  );
}
