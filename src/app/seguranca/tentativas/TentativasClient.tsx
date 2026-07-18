"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, ShieldAlert, Lock, Clock, Smartphone, Globe } from "lucide-react";

type Linha = {
  id: string; quando: string; login: string; nome: string;
  acao: string; ip: string; detalhe: string;
};

// Extrai o que der do texto da auditoria (formato montado no login).
function parse(detalhe: string) {
  const d = detalhe || "";
  const gps = /GPS\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(d);
  const ipgeoCoord = /IP-geo[^(]*\((-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\)/.exec(d);
  const ipgeoTxt = /IP-geo\s+([^(·]+?)\s*(?:\(|·|$)/.exec(d);
  const fuso = /fuso\s+([^\s·]+)/.exec(d);
  const plat = /plataforma\s+([^·]+)/.exec(d);
  const tent = /tentativa\s+(\d+\/\d+)/i.exec(d);
  const gpsNegado = /GPS\s+(negado[^·]*|indispon[^·]*|sem suporte|não informado)/i.exec(d);

  let lat = "", lng = "", fonte = "";
  if (gps) { lat = gps[1]; lng = gps[2]; fonte = "GPS"; }
  else if (ipgeoCoord) { lat = ipgeoCoord[1]; lng = ipgeoCoord[2]; fonte = "IP"; }

  return {
    lat, lng, fonte,
    cidade: ipgeoTxt ? ipgeoTxt[1].trim() : "",
    fuso: fuso ? fuso[1] : "",
    plataforma: plat ? plat[1].trim() : "",
    tentativa: tent ? tent[1] : "",
    gpsNegado: gpsNegado ? gpsNegado[1].trim() : "",
  };
}

function quandoBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function TentativasClient({ linhas }: { linhas: Linha[] }) {
  const [q, setQ] = useState("");
  const [soBloqueio, setSoBloqueio] = useState(false);

  const dados = useMemo(() => linhas.map((l) => ({ ...l, p: parse(l.detalhe) })), [linhas]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return dados.filter((l) => {
      if (soBloqueio && l.acao !== "login_bloqueado") return false;
      if (!t) return true;
      return `${l.login} ${l.nome} ${l.ip} ${l.p.cidade} ${l.detalhe}`.toLowerCase().includes(t);
    });
  }, [dados, q, soBloqueio]);

  const bloqueios = dados.filter((l) => l.acao === "login_bloqueado").length;

  return (
    <div className="text-[#cdd9ea]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#22314d] bg-[#0b1626] px-3">
          <Search className="h-4 w-4 text-[#64748b]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por login, IP, cidade…"
            className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-[#4b5c74]" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#94A3B8]">
          <input type="checkbox" checked={soBloqueio} onChange={(e) => setSoBloqueio(e.target.checked)} /> só bloqueios
        </label>
        <span className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">{bloqueios} bloqueio(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#1d2c44]">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="bg-[#0F1B2D] text-[11px] uppercase tracking-wide text-[#94A3B8]">
              <th className="px-3 py-2"><Clock className="mr-1 inline h-3.5 w-3.5" />Quando</th>
              <th className="px-3 py-2">Login</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"><Globe className="mr-1 inline h-3.5 w-3.5" />IP</th>
              <th className="px-3 py-2"><MapPin className="mr-1 inline h-3.5 w-3.5" />Localização</th>
              <th className="px-3 py-2"><Smartphone className="mr-1 inline h-3.5 w-3.5" />Dispositivo</th>
              <th className="px-3 py-2">Mapa</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[#64748b]">Nenhuma tentativa registrada.</td></tr>
            )}
            {filtradas.map((l) => {
              const bloq = l.acao === "login_bloqueado";
              const temMapa = !!(l.p.lat && l.p.lng);
              return (
                <tr key={l.id} className="border-t border-[#16243a] align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[#cdd9ea]">{quandoBR(l.quando)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-white">{l.login || "—"}</div>
                    {l.nome && <div className="text-[11px] text-[#64748b]">{l.nome}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {bloq
                      ? <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-200"><Lock className="h-3 w-3" /> bloqueada</span>
                      : <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200"><ShieldAlert className="h-3 w-3" /> senha errada{l.p.tentativa ? ` ${l.p.tentativa}` : ""}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#cdd9ea]">{l.ip || "—"}</td>
                  <td className="px-3 py-2">
                    {temMapa
                      ? <div><span className="text-white">{l.p.cidade || `${l.p.lat}, ${l.p.lng}`}</span>
                          <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${l.p.fonte === "GPS" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>{l.p.fonte}</span></div>
                      : <span className="text-[#64748b]">{l.p.cidade || (l.p.gpsNegado ? `GPS ${l.p.gpsNegado}` : "—")}</span>}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-[#94A3B8]">
                    {l.p.plataforma || "—"}{l.p.fuso ? <div className="text-[10px] text-[#64748b]">fuso {l.p.fuso}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    {temMapa
                      ? <a href={`https://www.google.com/maps?q=${l.p.lat},${l.p.lng}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2 py-1 text-xs text-[#f3df9d] hover:bg-[#D4AF37]/20"><MapPin className="h-3.5 w-3.5" /> Ver</a>
                      : <span className="text-[11px] text-[#4b5c74]">sem coord.</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#64748b]">
        A localização por <b>GPS</b> (verde) depende de o dispositivo permitir e só é pedida após o 1º erro de senha. A <b>IP</b> (azul) é aproximada pela operadora/rede. O botão “Ver” abre a posição no Google Maps.
      </p>
    </div>
  );
}
