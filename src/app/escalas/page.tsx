import { redirect } from "next/navigation";
import { exigirAdminOuLugar } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import EscalaClient from "./EscalaClient";

export const dynamic = "force-dynamic";

export default async function EscalasPage() {
  const { session, lugar } = await exigirAdminOuLugar();
  // A folha diária da sede ainda não é escopada por lugar; o comando de lugar
  // usa a Rádio Patrulha da unidade.
  if (lugar) redirect("/escalas/servico/rp");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <EscalaClient />
    </AppShell>
  );
}