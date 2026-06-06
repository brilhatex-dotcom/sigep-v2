"use client";

// Grafico de barras horizontais simples, em CSS. Recebe os dados
// ja calculados no servidor. Sem libs.
export default function BarrasPosto({
  dados,
}: {
  dados: { rotulo: string; valor: number }[];
}) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <div className="space-y-2.5">
      {dados.map((d, i) => (
        <div key={d.rotulo} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-[#94A3B8]">
            {d.rotulo}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
            <div
              className="ui-fade h-full rounded bg-gradient-to-r from-[#D4AF37]/70 to-[#D4AF37]"
              style={{
                width: `${(d.valor / max) * 100}%`,
                animationDelay: `${i * 0.04}s`,
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-white">
            {d.valor}
          </span>
        </div>
      ))}
    </div>
  );
}
