"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2, UserPlus } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import type { ForaDoPlano as Item } from "@/lib/feriasForaDoPlano";

/* AVISO: militares do efetivo que não estão em nenhuma equipe do plano do ano
   (normalmente quem chegou à unidade). Cada um já vem com a equipe sugerida —
   a com menos gente da unidade dele —, que pode ser trocada antes de incluir. */
export default function ForaDoPlano({ ano, itens, equipes }: { ano: string; itens: Item[]; equipes: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!itens.length) return null;
  const naoAdidos = itens.filter((i) => !i.adido);
  const adidos = itens.length - naoAdidos.length;
  const anoAnterior = String(Number(ano) - 1);

  const equipeDe = (i: Item) => escolha[i.id] || i.equipeSugerida;

  async function incluirUm(i: Item) {
    setOcupado(i.id);
    try {
      const r = await fetch("/api/ferias/membros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: i.id, numeroEquipe: equipeDe(i), anoGozo: ano }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d?.erro || "Não foi possível incluir.", "erro"); return; }
      avisar(`${i.postoGrad} ${i.nomeGuerra || i.nome} incluído na equipe ${equipeDe(i)}.`, "sucesso");
      router.refresh();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setOcupado(null); }
  }

  async function incluirTodos() {
    // adidos nunca entram em lote: as férias deles são da unidade de origem
    const trocados = naoAdidos.filter((i) => escolha[i.id] && escolha[i.id] !== i.equipeSugerida);
    const ok = await confirmar(
      `Incluir ${naoAdidos.length} militar(es) no Plano de Férias ${ano}, cada um na equipe indicada na lista?` +
      (adidos ? ` Os ${adidos} adido(s) ficam de fora (inclua um a um, se for o caso).` : ""),
      { rotuloOk: "Incluir todos" },
    );
    if (!ok) return;
    setOcupado("todos");
    try {
      // quem teve a equipe trocada na lista entra na escolhida; o resto, na sugerida
      for (const i of trocados) {
        await fetch("/api/ferias/membros", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idPmma: i.id, numeroEquipe: escolha[i.id], anoGozo: ano }),
        });
      }
      const r = await fetch("/api/ferias/fora-do-plano", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anoGozo: ano }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d?.erro || "Não foi possível incluir.", "erro"); return; }
      avisar(`${(d.incluidos?.length || 0) + trocados.length} militar(es) incluídos no Plano de Férias ${ano}.`, "sucesso");
      router.refresh();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setOcupado(null); }
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
        <p className="text-sm text-amber-100">
          {naoAdidos.length ? (
            <>
              <b>{naoAdidos.length} militar(es) do efetivo fora do Plano de Férias {ano}</b>
              <span className="text-amber-200/80">
                {" "}— não estão em nenhuma equipe. O plano novo só herda quem estava no plano de {anoAnterior}.
                {adidos > 0 && <> {adidos} adido(s) também aparecem na lista, mas não entram em “Incluir todos”.</>}
              </span>
            </>
          ) : (
            <>
              <b>Todo o efetivo está no Plano de Férias {ano}.</b>
              <span className="text-amber-200/80"> Só {adidos} adido(s) fora — as férias deles são da unidade de origem; inclua um a um, se for o caso.</span>
            </>
          )}
        </p>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/10">
            {aberto ? "Esconder" : "Ver lista"} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
          {naoAdidos.length > 0 && <button onClick={incluirTodos} disabled={!!ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
            {ocupado === "todos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Incluir todos
          </button>}
        </div>
      </div>
      {aberto && (
        <ul className="divide-y divide-amber-400/10 border-t border-amber-400/20">
          {itens.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm">
              <span className="font-medium text-white">{i.postoGrad} {i.nome}</span>
              {i.nomeGuerra && <span className="text-xs text-[#94A3B8]">({i.nomeGuerra})</span>}
              <span className="text-xs text-[#94A3B8]">· {i.unidade}</span>
              {i.adido ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-[#cbd5e1]">adido</span>
              ) : i.equipeAnoAnterior ? (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">estava na equipe {i.equipeAnoAnterior} em {anoAnterior}</span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">não estava no plano de {anoAnterior}</span>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-[#94A3B8]">
                Equipe
                <select value={equipeDe(i)} onChange={(e) => setEscolha((s) => ({ ...s, [i.id]: e.target.value }))}
                  className="rounded-md border border-white/10 bg-[#0b1626] px-2 py-1 text-xs text-white">
                  {equipes.map((n) => (
                    <option key={n} value={n}>{n}{n === i.equipeSugerida ? " (sugerida)" : ""}</option>
                  ))}
                </select>
              </label>
              <button onClick={() => incluirUm(i)} disabled={!!ocupado}
                className="inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/40 px-2 py-1 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:opacity-50">
                {ocupado === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Incluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
