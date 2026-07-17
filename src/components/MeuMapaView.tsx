import { Map as MapIcon } from "lucide-react";
import { ABBR_SERVICO, LABEL_SERVICO } from "@/lib/escalaMotor";

/* Calendário da previsão INDIVIDUAL de escala. Recebe os dias já calculados no
   servidor (só os do policial — LGPD). Marca no calendário os dias em que ele
   está escalado, com a sigla do serviço. É uma PREVISÃO (a oficial é a do P/1). */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pad = (n: number) => String(n).padStart(2, "0");
const isoDe = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function brData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Dia = { iso: string; servicos: string[] };

// meses a exibir: do mês de hoje até o mês de (hoje + dias).
function mesesNaJanela(dias: number): { ano: number; mes: number }[] {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
  const out: { ano: number; mes: number }[] = [];
  let y = hoje.getFullYear(), m = hoje.getMonth();
  while (y < fim.getFullYear() || (y === fim.getFullYear() && m <= fim.getMonth())) {
    out.push({ ano: y, mes: m });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

function Mes({ ano, mes, mapa, hojeISO }: { ano: number; mes: number; mapa: Map<string, string[]>; hojeISO: string }) {
  const primeiroDow = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [];
  for (let i = 0; i < primeiroDow; i++) celulas.push(null);
  for (let d = 1; d <= totalDias; d++) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);

  return (
    <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-3">
      <h2 className="mb-2 text-center text-sm font-bold text-white">{MESES[mes]} de {ano}</h2>
      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase text-[#8fa3bf]">{d}</div>
        ))}
        {celulas.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = isoDe(ano, mes, d);
          const servs = mapa.get(iso);
          const escalado = !!servs?.length;
          const ehHoje = iso === hojeISO;
          return (
            <div
              key={i}
              title={escalado ? `${brData(iso)} — ${servs!.map((s) => LABEL_SERVICO[s] || s).join(", ")}` : brData(iso)}
              className={`flex min-h-[46px] flex-col items-center rounded-md border p-1 text-center ${
                escalado ? "border-[#D4AF37]/60 bg-[#D4AF37]/15" : "border-transparent bg-black/10"
              } ${ehHoje ? "ring-1 ring-teal-400" : ""}`}
            >
              <span className={`text-xs font-semibold ${escalado ? "text-[#F0D98A]" : "text-[#7f93b3]"}`}>{d}</span>
              {escalado && (
                <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {servs!.map((s, j) => (
                    <span key={j} className="rounded bg-[#D4AF37] px-1 text-[8px] font-bold leading-tight text-[#1a1205]">{ABBR_SERVICO[s] || s}</span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MeuMapaView({
  meuId, temPrevisao, dias, janela = 60,
}: {
  meuId: string | null;
  temPrevisao: boolean;
  dias: Dia[];
  janela?: number;
}) {
  const mapa = new Map<string, string[]>(dias.map((d) => [d.iso, d.servicos]));
  const hoje = new Date();
  const hojeISO = isoDe(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + janela);
  const fimISO = isoDe(fim.getFullYear(), fim.getMonth(), fim.getDate());

  return (
    <div className="mx-auto max-w-3xl text-[#cdd9ea]">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
        <MapIcon className="h-6 w-6 text-[#D4AF37]" /> Meu Mapa de Escala
      </h1>
      <p className="mb-1 text-sm text-[#94A3B8]">Calendário com os dias em que você está previsto para o serviço na sede (RP, FT, ROTEM, permanência, CPU…).</p>
      <p className="mb-4 inline-block rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-1 text-xs font-semibold text-amber-200">
        ⚠️ Isto é uma PREVISÃO de escala — a escala oficial é a publicada pelo P/1.
      </p>

      {!meuId ? (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Seu login não está vinculado a uma ficha. Procure o P/1.</div>
      ) : !temPrevisao ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-6 text-center text-sm text-amber-200">
          Você não tem previsão de serviço na sede. Esta aba é para o efetivo da sede que entra no rodízio (RP, FT, ROTEM, permanência, CPU…).
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-[#8fa3bf]">Período: {brData(hojeISO)} a {brData(fimISO)}. Os dias em <span className="font-semibold text-[#F0D98A]">dourado</span> são os seus serviços (a sigla indica qual). Hoje aparece com borda azul.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {mesesNaJanela(janela).map(({ ano, mes }) => (
              <Mes key={`${ano}-${mes}`} ano={ano} mes={mes} mapa={mapa} hojeISO={hojeISO} />
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-3">
            <div className="mb-1 text-xs font-semibold text-white">Legenda das siglas</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#94A3B8]">
              {Object.entries(ABBR_SERVICO).map(([k, ab]) => (
                <span key={k}><b className="text-[#cdd9ea]">{ab}</b> = {LABEL_SERVICO[k]}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
