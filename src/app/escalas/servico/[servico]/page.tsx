import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "../../mapa/MapaClient";
import CpuCalendarioClient from "../cpu/CpuCalendarioClient";

export const dynamic = "force-dynamic";

const VALIDOS = ["rp", "ft", "rotem", "inteligencia", "permanencia", "cpu"];

export default async function ServicoEscalaPage({ params }: { params: { servico: string } }) {
  const session = await exigirAdmin();
  if (!VALIDOS.includes(params.servico)) redirect("/escalas/mapa");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      {/* CPU de dia = calendário mensal (colunas por semana); demais serviços = mapa */}
      {params.servico === "cpu" ? <CpuCalendarioClient /> : <MapaClient servico={params.servico} />}
    </AppShell>
  );
}
