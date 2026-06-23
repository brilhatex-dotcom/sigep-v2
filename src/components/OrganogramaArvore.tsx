"use client";

import Link from "next/link";
import { Users, AlertTriangle } from "lucide-react";
import type { NoOrg } from "@/lib/organograma";
import type { StatusUnidade } from "@/lib/efetivoMinimo";

export type Contagens = Record<string, number>;

// reexporta para quem importar do componente
export type StatusNo = StatusUnidade;

function Caixa({
  no, qtd, destaque, minimo, status,
}: {
  no: NoOrg;
  qtd: number;
  destaque?: boolean;
  minimo?: number;        // se este no e controlado, o minimo exigido
  status?: StatusNo;      // status de efetivo minimo (se controlado)
}) {
  const critico = !!status?.critico;

  // estilo da borda/fundo: critico (vermelho) > destaque (dourado) > normal
  const estiloCaixa = critico
    ? "border-red-500/60 bg-red-950/40"
    : destaque
    ? "border-[#D4AF37]/40 bg-[#D4AF37]/10"
    : "border-white/10 bg-[#0F1B2D] hover:border-[#D4AF37]/40";

  const estiloTitulo = critico
    ? "text-red-300"
    : destaque
    ? "text-[#D4AF37]"
    : "text-white";

  return (
    <Link
      href={`/organograma/${no.id}`}
      className={`block rounded-xl border p-3 text-center transition hover:-translate-y-0.5 ${estiloCaixa}`}
    >
      <p className={`text-sm font-bold ${estiloTitulo}`}>
        {critico && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-red-400" />}
        {no.rotulo}
      </p>
      {no.cidade && <p className="text-[10px] text-[#94A3B8]">{no.cidade}</p>}

      <div className="mt-1 flex items-center justify-center gap-1.5">
        {/* efetivo total lotado */}
        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#94A3B8]">
          <Users className="h-3 w-3" /> {qtd}
        </span>

        {/* badge disponiveis/minimo, so para nos controlados */}
        {minimo !== undefined && status && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              critico
                ? "bg-red-500/20 text-red-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
            title={`${status.disponiveis} disponíveis · mínimo ${minimo} · ${status.afastados} afastados`}
          >
            {status.disponiveis}/{minimo}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function OrganogramaArvore({
  raiz,
  contagens,
  minimos,
  statusPorNo,
}: {
  raiz: NoOrg;
  contagens: Contagens;
  minimos?: Record<string, number>;
  statusPorNo?: Record<string, StatusNo>;
}) {
  const nivel1 = raiz.filhos ?? [];

  const mins = minimos ?? {};
  const stats = statusPorNo ?? {};

  return (
    <div className="overflow-x-auto pb-4">
      <div className="mx-auto w-fit min-w-full">
        <div className="flex justify-center">
          <div className="w-64">
            <Caixa no={raiz} qtd={contagens[raiz.id] ?? 0} destaque />
          </div>
        </div>
        <div className="flex justify-center">
          <div className="h-6 w-px bg-white/15" />
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {nivel1.map((no) => {
            const filhos = no.filhos ?? [];
            return (
              <div key={no.id} className="flex flex-col items-center">
                <div className="w-52">
                  <Caixa
                    no={no}
                    qtd={contagens[no.id] ?? 0}
                    minimo={mins[no.id]}
                    status={stats[no.id]}
                  />
                </div>
                {filhos.length > 0 && (
                  <>
                    <div className="h-5 w-px bg-white/15" />
                    <div className="flex flex-col gap-2">
                      {filhos.map((f) => (
                        <div key={f.id} className="w-52">
                          <Caixa
                            no={f}
                            qtd={contagens[f.id] ?? 0}
                            minimo={mins[f.id]}
                            status={stats[f.id]}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
