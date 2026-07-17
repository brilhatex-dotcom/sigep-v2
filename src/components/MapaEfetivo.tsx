"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, X } from "lucide-react";

/* Mapa das unidades do 18º BPM (Leaflet + OpenStreetMap). Cada cidade recebe um
   marcador: VERDE = efetivo OK, VERMELHO = efetivo baixo (abaixo do mínimo).
   A sede aparece em dourado. O popup mostra o EFETIVO DESTACADO (disponível), a
   distância até a sede e a população da cidade. Tem botão de tela cheia. */

export type UnidadeMapa = {
  noId: string;
  rotulo: string;
  cidade: string;
  lat: number;
  lng: number;
  pop: number;
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

// distância em km (Haversine)
function distanciaKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const nf = new Intl.NumberFormat("pt-BR");

export default function MapaEfetivo({ unidades }: { unidades: UnidadeMapa[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([-5.29, -44.45], 8);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);

    const sede = unidades.find((u) => u.sede);
    const pontos: L.LatLng[] = [];
    for (const u of unidades) {
      const cor = u.sede ? "#D4AF37" : u.critico ? "#dc2626" : "#16a34a";
      const num = u.sede ? u.efetivoTotal : u.disponiveis;
      const m = L.marker([u.lat, u.lng], { icon: pino(cor, num) }).addTo(map);
      const dist = sede && !u.sede ? distanciaKm(sede.lat, sede.lng, u.lat, u.lng) : 0;
      const linhaEfetivo = u.sede
        ? `Efetivo na sede: <b>${u.efetivoTotal}</b>`
        : `Efetivo destacado: <b>${u.disponiveis}</b> disponíveis (mínimo ${u.minimo})${u.critico ? ` — <b style="color:#dc2626">faltam ${u.faltam}</b>` : ' — <b style="color:#16a34a">OK</b>'}`;
      m.bindPopup(
        `<b>${u.rotulo}</b><br>${u.cidade}<br>${linhaEfetivo}` +
        (u.sede ? "" : `<br>Distância da sede: <b>${dist.toFixed(0)} km</b>`) +
        `<br>População: <b>${nf.format(u.pop)}</b> hab. (aprox.)`
      );
      pontos.push(L.latLng(u.lat, u.lng));
    }
    if (pontos.length > 1) map.fitBounds(L.latLngBounds(pontos).pad(0.2));

    return () => { map.remove(); mapRef.current = null; };
  }, [unidades]);

  // ao entrar/sair da tela cheia, o Leaflet precisa recalcular o tamanho
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [cheia]);

  return (
    <div className={cheia ? "fixed inset-0 z-[100] bg-[#0a1220] p-3" : ""}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-xs text-[#94A3B8]">
          <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#16a34a", display: "inline-block" }} /> Efetivo OK</span>
          <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#dc2626", display: "inline-block" }} /> Efetivo baixo</span>
          <span className="inline-flex items-center gap-1.5"><i style={{ width: 12, height: 12, borderRadius: 3, background: "#D4AF37", display: "inline-block" }} /> Sede</span>
        </div>
        <button onClick={() => setCheia((v) => !v)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">
          {cheia ? <><X className="h-4 w-4" /> Fechar</> : <><Maximize2 className="h-4 w-4" /> Ver em tela cheia</>}
        </button>
      </div>
      <div ref={ref} style={{ height: cheia ? "calc(100vh - 90px)" : 420, width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #1d2c44" }} />
      <p className="mt-2 text-xs text-[#8fa3bf]">O número no pino é o <b>efetivo destacado disponível</b> em cada cidade. Clique no pino para ver distância da sede e população.</p>
    </div>
  );
}
