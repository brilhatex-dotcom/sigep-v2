import { redirect } from "next/navigation";
import { exigirAdminOuLugar } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "../../mapa/MapaClient";
import CpuCalendarioClient from "../cpu/CpuCalendarioClient";

export const dynamic = "force-dynamic";

const VALIDOS = ["rp", "ft", "rotem", "inteligencia", "permanencia", "cpu"];

export default async function ServicoEscalaPage({ params }: { params: { servico: string } }) {
  const { session, lugar } = await exigirAdminOuLugar();
  if (!VALIDOS.includes(params.servico)) redirect("/escalas/mapa");
  // Comando de lugar (interior): só Rádio Patrulha, escopado à própria unidade.
  if (lugar && params.servico !== "rp") redirect("/escalas/servico/rp");
  const escopo = lugar ? lugar.noId : undefined;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav soRp={!!lugar} />
      {/* CPU de dia = calendário mensal (colunas por semana); demais serviços = mapa */}
      {params.servico === "cpu" ? <CpuCalendarioClient /> : <MapaClient servico={params.servico} escopo={escopo} />}
    </AppShell>
  );
}
