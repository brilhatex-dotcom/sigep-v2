import { Plane } from "lucide-react";
import type { FeriasHoje } from "@/lib/feriasHoje";

/* Painel "de férias hoje" — reaproveitado no Centro de Comando e na aba Férias.
   Componente de servidor (sem estado): só exibe a lista já calculada. */
export default function FeriasHojePainel({ militares }: { militares: FeriasHoje[] }) {
  return (
    <div className={`mb-4 rounded-xl border p-4 ${militares.length ? "border-teal-800/50 bg-teal-950/25" : "border-[#1d2c44] bg-[#0F1B2D]"}`}>
      <div className="flex items-center gap-2 text-sm text-[#cdd9ea]">
        <Plane className="h-4 w-4 text-teal-300" />
        <b className="text-teal-200 text-base">{militares.length}</b>
        {militares.length === 1 ? "policial de férias hoje" : "policiais de férias hoje"}
      </div>
      {militares.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {militares.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-teal-800/50 bg-teal-950/40 px-3 py-1 text-xs text-teal-100">
              {m.posto ? `${m.posto} ` : ""}{m.nome}
              <span className="rounded-full bg-teal-900/60 px-1.5 py-0.5 text-[10px] uppercase text-teal-300">{m.origem === "avulsa" ? "avulsa" : "plano"}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
