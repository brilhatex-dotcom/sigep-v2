"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Loader2, Copy, Clock } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import type { ProblemaPlano, FeriasAtrasadas } from "@/lib/feriasForaDoPlano";

/* Avisos do plano do próximo exercício:
   - quem saiu da unidade ANTES da publicação (outubro do ano anterior) e
     ainda está no plano — quem sai depois da publicação continua nele;
   - quem teria DUAS férias no ano (duas equipes, ou equipe + férias avulsa);
   - quem tem férias ATRASADAS de outros exercícios (só aviso: não entram de
     novo no plano automaticamente — uma férias por ano). */
export default function ProblemasDoPlano({ ano, saidos, repetidos, atrasadas }: {
  ano: string; saidos: ProblemaPlano[]; repetidos: ProblemaPlano[]; atrasadas: FeriasAtrasadas[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!saidos.length && !repetidos.length && !atrasadas.length) return null;
  const anoPub = Number(ano) - 1;
  const dataBR = (d?: string) => {
    const t = (d || "").trim();
    return /^\d{4}-\d{2}-\d{2}/.test(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : t;
  };
  const emDuasEquipes = repetidos.filter((r) => r.equipes.length > 1);

  async function limpar(tipo: "saidos" | "repetidos", ids: string[] | undefined, chave: string, pergunta: string) {
    if (!(await confirmar(pergunta, { rotuloOk: "Corrigir", perigo: true }))) return;
    setOcupado(chave);
    try {
      const r = await fetch("/api/ferias/fora-do-plano", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anoGozo: ano, acao: "limpar", tipo, ids }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d?.erro || "Não foi possível corrigir.", "erro"); return; }
      avisar(`Plano de ${ano} corrigido.`, "sucesso");
      router.refresh();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setOcupado(null); }
  }

  const nome = (p: ProblemaPlano) => `${p.postoGrad} ${p.nome}`.trim();

  return (
    <div className="mb-4 space-y-3">
      {saidos.length > 0 && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <UserMinus className="h-5 w-5 shrink-0 text-red-300" />
            <p className="text-sm text-red-100">
              <b>{saidos.length} militar(es) no Plano de Férias {ano} que saíram da unidade antes da publicação do plano (outubro/{anoPub})</b>
              <span className="text-red-200/80"> — vieram do plano anterior e contam no plano, mas não estão mais no efetivo. Quem sair a partir de outubro continua no plano.</span>
            </p>
            <button onClick={() => limpar("saidos", undefined, "saidos", `Tirar ${saidos.length} militar(es) que já saíram da unidade do Plano de Férias ${ano}?`)}
              disabled={!!ocupado}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50">
              {ocupado === "saidos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Tirar todos do plano
            </button>
          </div>
          <ul className="divide-y divide-red-400/10 border-t border-red-400/20">
            {saidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="text-white">{nome(p)}</span>
                <span className="text-xs text-[#94A3B8]">· equipe {p.equipes.join(" e ")}{p.dataSaida ? ` · saiu em ${dataBR(p.dataSaida)}` : ""}</span>
                <button onClick={() => limpar("saidos", [p.id], p.id, `Tirar ${nome(p)} do Plano de Férias ${ano}?`)} disabled={!!ocupado}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-400/30 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                  {ocupado === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Tirar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {repetidos.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Copy className="h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm text-amber-100">
              <b>{repetidos.length} militar(es) com duas férias em {ano}</b>
              <span className="text-amber-200/80"> — cada militar goza UMA férias por ano.{emDuasEquipes.length > 0 && " “Corrigir” deixa quem está em duas equipes só na equipe em que entrou primeiro."}{repetidos.some((r) => r.avulsas?.length) && " Quem também tem férias avulsas: ajuste em Férias avulsas, lá embaixo."}</span>
            </p>
            {emDuasEquipes.length > 0 && (
              <button onClick={() => limpar("repetidos", emDuasEquipes.map((r) => r.id), "repetidos", `Deixar cada militar que está em duas equipes só na equipe em que entrou primeiro?`)}
                disabled={!!ocupado}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-50">
                {ocupado === "repetidos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Corrigir
              </button>
            )}
          </div>
          <ul className="divide-y divide-amber-400/10 border-t border-amber-400/20">
            {repetidos.map((p) => (
              <li key={p.id} className="px-4 py-2 text-sm">
                <span className="text-white">{nome(p)}</span>
                <span className="text-xs text-[#94A3B8]">
                  {p.equipes.length > 1
                    ? (new Set(p.equipes).size === 1
                        ? ` · ${p.equipes.length} vezes na equipe ${p.equipes[0]}`
                        : ` · aparece nas equipes ${p.equipes.join(", ")}`)
                    : ` · equipe ${p.equipes.join("")}`}
                  {p.avulsas?.length ? ` · e férias avulsas ${p.avulsas.join("; ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {atrasadas.length > 0 && (
        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Clock className="h-5 w-5 shrink-0 text-sky-300" />
            <p className="text-sm text-sky-100">
              <b>{atrasadas.length} militar(es) com férias atrasadas de outros exercícios</b>
              <span className="text-sky-200/80"> — no plano de {ano} cada um goza só UMA férias; as atrasadas não entram automaticamente (marque à parte, se for o caso).</span>
            </p>
          </div>
          <ul className="divide-y divide-sky-400/10 border-t border-sky-400/20">
            {atrasadas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="text-white">{a.nome}</span>
                <span className="text-xs text-sky-200">{a.exercicio ? `férias de ${a.exercicio} adiadas` : "férias adiadas"}</span>
                {a.motivo && <span className="text-xs text-[#94A3B8]">· {a.motivo}</span>}
                <span className="ml-auto text-xs text-[#94A3B8]">{a.equipe ? `equipe ${a.equipe} em ${ano}` : `fora do plano de ${ano}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
