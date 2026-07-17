"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* Mapa das unidades do 18º BPM (Leaflet + OpenStreetMap). Cada cidade recebe um
   marcador: VERDE = efetivo OK, VERMELHO = efetivo baixo (abaixo do mínimo).
   A sede aparece em dourado. Os dados vêm calculados do servidor. */

export type UnidadeMapa = {
  noId: string;
  rotulo: string;
  cidade: string;
  lat: number;
  lng: number;
  disponiveis: number;
  efetivoTotal: number;
  minimo: number;
  faltam: number;
  critico: boolean;
  sede?: boolean;
};

function pino(cor: string, num: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:30px;height:40px">
      <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${cor}" stroke="#00000055" stroke-width="1"/>
      </svg>
      <span style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:#fff;font-weight:700;font-size:12px;font-family:system-ui,sans-serif">${num}</span>
    </div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
}

export default function MapaEfetivo({ unidades }: { unidades: UnidadeMapa[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([-5.29, -44.45], 8);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);

    const pontos: L.LatLng[] = [];
    for (const u of unidades) {
      const cor = u.sede ? "#D4AF37" : u.critico ? "#dc2626" : "#16a34a";
      const num = u.sede ? u.efetivoTotal : u.disponiveis;
      const m = L.marker([u.lat, u.lng], { icon: pino(cor, num) }).addTo(map);
      const status = u.sede
        ? `Sede — ${u.efetivoTotal} militares`
        : `${u.disponiveis} disponíveis / mínimo ${u.minimo}${u.critico ? ` — <b style="color:#dc2626">faltam ${u.faltam}</b>` : ' — <b style="color:#16a34a">OK</b>'}`;
      m.bindPopup(`<b>${u.rotulo}</b><br>${u.cidade}<br>${status}`);
      pontos.push(L.latLng(u.lat, u.lng));
    }
    if (pontos.length > 1) map.fitBounds(L.latLngBounds(pontos).pad(0.2));

    return () => { map.remove(); mapRef.current = null; };
  }, [unidades]);

  return (
    <div>
      <div ref={ref} style={{ height: 420, width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #1d2c44" }} />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#94A3B8]">
        <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#16a34a", display: "inline-block" }} /> Efetivo OK</span>
        <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#dc2626", display: "inline-block" }} /> Efetivo baixo (abaixo do mínimo)</span>
        <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#D4AF37", display: "inline-block" }} /> Sede</span>
        <span>O número no pino é o efetivo disponível.</span>
      </div>
    </div>
  );
}
