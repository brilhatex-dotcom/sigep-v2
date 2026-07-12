import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "../../mapa/MapaClient";

export const dynamic = "force-dynamic";

const VALIDOS = ["rp", "ft", "rotem", "inteligencia", "permanencia", "cpu"];

export default async function ServicoEscalaPage({ params }: { params: { servico: string } }) {
  const session = await exigirAdmin();
  if (!VALIDOS.includes(params.servico)) redirect("/escalas/mapa");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <MapaClient servico={params.servico} />
    </AppShell>
  );
}
