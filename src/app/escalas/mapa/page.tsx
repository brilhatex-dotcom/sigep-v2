import { redirect } from "next/navigation";
import { exigirAdminOuLugar } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "./MapaClient";

export const dynamic = "force-dynamic";

export default async function MapaEscalaPage() {
  const { session, lugar } = await exigirAdminOuLugar();
  // Comando de lugar: vai para a Rádio Patrulha da própria unidade.
  if (lugar) redirect("/escalas/servico/rp");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <MapaClient />
    </AppShell>
  );
}