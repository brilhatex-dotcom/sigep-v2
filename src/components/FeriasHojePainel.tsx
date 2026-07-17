import { Plane } from "lucide-react";
import type { ResumoFerias } from "@/lib/feriasHoje";

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : "";
}

/* Painel de férias — reaproveitado no Centro de Comando e na aba Férias.
   Mostra quem está de férias HOJE e as férias avulsas registradas que ainda
   não terminaram (mesmo futuras), com a data — assim o "0 hoje" fica explicado
   e nada registrado some da vista. Componente de servidor (sem estado). */
export default function FeriasHojePainel({ resumo }: { resumo: ResumoFerias }) {
  const { hojeCount, itens } = resumo;
  const temHoje = hojeCount > 0;
  return (
    <div className={`mb-4 rounded-xl border p-4 ${temHoje ? "border-teal-800/50 bg-teal-950/25" : "border-[#1d2c44] bg-[#0F1B2D]"}`}>
      <div className="flex items-center gap-2 text-sm text-[#cdd9ea]">
        <Plane className="h-4 w-4 text-teal-300" />
        <b className="text-teal-200 text-base">{hojeCount}</b>
        {hojeCount === 1 ? "policial de férias hoje" : "policiais de férias hoje"}
      </div>

      {itens.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {itens.map((m, i) => (
            <span key={m.id + i} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${m.ativaHoje ? "border-teal-800/50 bg-teal-950/40 text-teal-100" : "border-[#2b3f63] bg-[#0a1626] text-[#cdd9ea]"}`}>
              {m.posto ? `${m.posto} ` : ""}{m.nome}
              <span className="text-[10px] text-[#8fa3bf]">
                {m.inicio && m.fim ? `${dBR(m.inicio)}–${dBR(m.fim)}` : ""}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase ${m.ativaHoje ? "bg-teal-900/60 text-teal-300" : "bg-[#3a2f10] text-[#f3df9d]"}`}>
                {m.ativaHoje ? "hoje" : "a partir de " + dBR(m.inicio)}
              </span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] uppercase text-[#8fa3bf]">{m.origem === "avulsa" ? "avulsa" : "plano"}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#8fa3bf]">Nenhuma férias registrada em vigência. Lançamentos aparecem aqui automaticamente.</p>
      )}
    </div>
  );
}
