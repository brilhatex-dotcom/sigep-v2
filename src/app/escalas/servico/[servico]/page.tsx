import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAdminOuLugar } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import MapaClient from "../../mapa/MapaClient";
import CpuCalendarioClient from "../cpu/CpuCalendarioClient";
import { acharNo } from "@/lib/organograma";

export const dynamic = "force-dynamic";

const VALIDOS = ["rp", "ft", "rotem", "inteligencia", "permanencia", "cpu"];

export default async function ServicoEscalaPage({
  params, searchParams,
}: {
  params: { servico: string };
  searchParams: { escopo?: string };
}) {
  const { session, admin, lugar } = await exigirAdminOuLugar();
  if (!VALIDOS.includes(params.servico)) redirect("/escalas/mapa");
  // Comando de lugar (interior): só Rádio Patrulha, escopado à própria unidade.
  if (lugar && params.servico !== "rp") redirect("/escalas/servico/rp");

  // Admin pode abrir a escala de uma unidade via ?escopo=; comando de lugar = a própria.
  const escopo = lugar ? lugar.noId : (admin ? (searchParams.escopo || undefined) : undefined);
  const rotuloEscopo = escopo ? (acharNo(escopo)?.rotulo || escopo) : "";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav soRp={!!lugar} />
      {admin && escopo && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-2 text-sm text-[#f3df9d]">
          <span>Escala da unidade: <b>{rotuloEscopo}</b></span>
          <Link href="/escalas/unidades" className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/5">← Todas as unidades</Link>
        </div>
      )}
      {/* CPU de dia = calendário mensal (colunas por semana); demais serviços = mapa */}
      {params.servico === "cpu" ? <CpuCalendarioClient /> : <MapaClient servico={params.servico} escopo={escopo} />}
    </AppShell>
  );
}
