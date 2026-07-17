import { Map as MapIcon, CalendarClock } from "lucide-react";

/* Apresentação da previsão INDIVIDUAL de escala. Recebe já pronto (calculado no
   servidor) — o navegador do policial NÃO recebe a escala dos outros (LGPD). */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function rotuloDia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} · ${String(d).padStart(2, "0")} ${MESES[m - 1]}`;
}

export default function MeuMapaView({
  meuId, temPrevisao, dias,
}: {
  meuId: string | null;
  temPrevisao: boolean;
  dias: { iso: string; servicos: string[] }[];
}) {
  return (
    <div className="mx-auto max-w-2xl text-[#cdd9ea]">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
        <MapIcon className="h-6 w-6 text-[#D4AF37]" /> Meu Mapa de Escala
      </h1>
      <p className="mb-5 text-sm text-[#94A3B8]">Sua previsão de serviço na sede (RP, FT, ROTEM, permanência, CPU…) para os próximos 60 dias. Previsão automática — a escala oficial é a publicada pelo P/1.</p>

      {!meuId ? (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Seu login não está vinculado a uma ficha. Procure o P/1.</div>
      ) : !temPrevisao ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-6 text-center text-sm text-amber-200">
          Você não tem previsão de serviço na sede. Esta aba é para o efetivo da sede que entra no rodízio (RP, FT, ROTEM, permanência, CPU…).
        </div>
      ) : dias.length === 0 ? (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Sem serviços previstos para você nos próximos 60 dias.</div>
      ) : (
        <ul className="space-y-2">
          {dias.map((d) => (
            <li key={d.iso} className="flex items-center justify-between gap-3 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarClock className="h-4 w-4 text-[#D4AF37]" /> {rotuloDia(d.iso)}
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {d.servicos.map((s, i) => (
                  <span key={i} className="rounded-full border border-[#2b3f63] bg-[#0a1626] px-2.5 py-0.5 text-xs text-[#cdd9ea]">{s}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
