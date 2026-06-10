import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MapaClient from "./MapaClient";

export const dynamic = "force-dynamic";

export default async function MapaEscalaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <MapaClient />
    </AppShell>
  );
}
