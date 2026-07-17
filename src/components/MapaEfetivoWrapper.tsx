"use client";

import dynamic from "next/dynamic";
import type { UnidadeMapa } from "@/components/MapaEfetivo";

/* Carrega o mapa apenas no navegador (Leaflet usa window). */
const MapaEfetivo = dynamic(() => import("@/components/MapaEfetivo"), {
  ssr: false,
  loading: () => <div style={{ height: 420 }} className="flex items-center justify-center rounded-xl border border-[#1d2c44] bg-[#0F1B2D] text-sm text-[#94A3B8]">Carregando mapa…</div>,
});

export default function MapaEfetivoWrapper({ unidades }: { unidades: UnidadeMapa[] }) {
  return <MapaEfetivo unidades={unidades} />;
}
