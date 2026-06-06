"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import type { NoOrg } from "@/lib/organograma";

export type Contagens = Record<string, number>;

function Caixa({ no, qtd, destaque }: { no: NoOrg; qtd: number; destaque?: boolean }) {
  return (
    <Link
      href={`/organograma/${no.id}`}
      className={`block rounded-xl border p-3 text-center transition hover:-translate-y-0.5 ${
        destaque
          ? "border-[#D4AF37]/40 bg-[#D4AF37]/10"
          : "border-white/10 bg-[#0F1B2D] hover:border-[#D4AF37]/40"
      }`}
    >
      <p className={`text-sm font-bold ${destaque ? "text-[#D4AF37]" : "text-white"}`}>{no.rotulo}</p>
      {no.cidade && <p className="text-[10px] text-[#94A3B8]">{no.cidade}</p>}
      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#94A3B8]">
        <Users className="h-3 w-3" /> {qtd}
      </p>
    </Link>
  );
}

export default function OrganogramaArvore({ raiz, contagens }: { raiz: NoOrg; contagens: Contagens }) {
  const nivel1 = raiz.filhos ?? [];
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
                  <Caixa no={no} qtd={contagens[no.id] ?? 0} />
                </div>
                {filhos.length > 0 && (
                  <>
                    <div className="h-5 w-px bg-white/15" />
                    <div className="flex flex-col gap-2">
                      {filhos.map((f) => (
                        <div key={f.id} className="w-52">
                          <Caixa no={f} qtd={contagens[f.id] ?? 0} />
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
