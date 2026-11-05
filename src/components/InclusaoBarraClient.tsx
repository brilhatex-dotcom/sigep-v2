"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, NotebookPen, CalendarCheck, RefreshCw } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";

/* A tela da conferência das datas de inclusão (ver lib/inclusaoBarra e
   /api/efetivo/inclusao). Cada linha já vem com a data sugerida no campo;
   o P/1 confere, ajusta se quiser e grava — uma a uma ou todas de uma vez. */

type Item = {
  id: string; postoGrad: string; nome: string; nomeGuerra: string; numeroBarra: string;
  dataAtual: string | null; motivo: "em_branco" | "fora_do_ano";
  sugestao: string | null; colegas: number; anotado: boolean;
};

const br = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const quem = (i: Item) => {
  const barra = i.numeroBarra.replace(/^[-–—\s]+$/, "").trim();   // oficial vem com "-"
  return [i.postoGrad, barra ? `nº ${barra}` : "", i.nomeGuerra || i.nome].filter(Boolean).join(" ");
};

export default function InclusaoBarraClient() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/efetivo/inclusao", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Falha ao carregar.", "erro"); return; }
      setItens(d.itens);
      setDatas(Object.fromEntries((d.itens as Item[]).map((i) => [i.id, i.sugestao || ""])));
    } catch { avisar("Sem conexão.", "erro"); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const comSugestao = useMemo(() => (itens || []).filter((i) => datas[i.id]), [itens, datas]);
  const semReferencia = useMemo(() => (itens || []).filter((i) => !i.sugestao && !i.anotado), [itens]);

  async function enviar(corpo: object, chave: string, ok: (n: number) => string) {
    setOcupado(chave);
    try {
      const r = await fetch("/api/efetivo/inclusao", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d?.error || "Não foi possível gravar.", "erro"); return; }
      avisar(ok(d.feitos ?? 0), "sucesso");
      await carregar();
    } catch { avisar("Sem conexão.", "erro"); }
    finally { setOcupado(null); }
  }

  const gravar = (lista: Item[], chave: string) =>
    enviar({ acao: "aplicar", itens: lista.map((i) => ({ id: i.id, data: datas[i.id] })) }, chave,
      (n) => `${n} data(s) de inclusão gravada(s).`);
  const anotar = (lista: Item[], chave: string) =>
    enviar({ acao: "anotar", ids: lista.map((i) => i.id) }, chave, (n) => `${n} ficha(s) anotada(s).`);

  if (!itens) return <p className="flex items-center gap-2 py-10 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo o efetivo…</p>;
  if (!itens.length) {
    return <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">Todas as fichas têm a data de inclusão, e no ano da barra. Nada a corrigir.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#cbd5e1]"><b className="text-white">{itens.length}</b> militar(es) para conferir</span>
        <div className="flex-1" />
        <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#94A3B8] hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Conferir de novo
        </button>
        {comSugestao.length > 0 && (
          <button
            onClick={async () => {
              if (await confirmar(`Gravar a data de inclusão de ${comSugestao.length} militar(es), como está nos campos?`)) gravar(comSugestao, "todos");
            }}
            disabled={!!ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#1a1205] hover:brightness-110 disabled:opacity-50">
            {ocupado === "todos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
            Gravar todas as datas ({comSugestao.length})
          </button>
        )}
        {semReferencia.length > 0 && (
          <button
            onClick={async () => {
              if (await confirmar(`Anotar na ficha de ${semReferencia.length} militar(es) sem referência que a data de inclusão está em branco (ou, se houver data de outro ano, que está a conferir)?`)) anotar(semReferencia, "anotar-todos");
            }}
            disabled={!!ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
            {ocupado === "anotar-todos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NotebookPen className="h-3.5 w-3.5" />}
            Anotar os sem referência ({semReferencia.length})
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#0F1B2D] text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
            <tr>
              <th className="px-3 py-2">Militar</th>
              <th className="px-3 py-2">Na ficha</th>
              <th className="px-3 py-2">Referência da barra</th>
              <th className="px-3 py-2">Data a gravar</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {itens.map((i) => (
              <tr key={i.id} className="align-middle hover:bg-white/[.03]">
                <td className="px-3 py-2">
                  <span className="block font-medium text-white">{quem(i)}</span>
                  <span className="block text-[11px] text-[#94A3B8]">{i.nome} · ID {i.id}</span>
                </td>
                <td className="px-3 py-2">
                  {i.motivo === "em_branco"
                    ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">em branco</span>
                    : <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300" title="O ano da data não bate com o ano da barra">{br(i.dataAtual)} · fora do ano da barra</span>}
                  {i.anotado && <span className="mt-1 block text-[10px] text-[#94A3B8]">já anotado na ficha</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[#cbd5e1]">
                  {i.sugestao
                    ? <><b className="text-white">{br(i.sugestao)}</b><span className="block text-[11px] text-[#94A3B8]">{i.colegas} colega(s) da barra com essa data</span></>
                    : <span className="text-[#94A3B8]">nenhum colega da barra com data</span>}
                </td>
                <td className="px-3 py-2">
                  <input type="date" value={datas[i.id] || ""} onChange={(e) => setDatas((d) => ({ ...d, [i.id]: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white [color-scheme:dark] outline-none focus:border-[#D4AF37]/50" />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {datas[i.id] ? (
                    <button onClick={() => gravar([i], i.id)} disabled={!!ocupado}
                      className="inline-flex items-center gap-1 rounded border border-[#D4AF37]/40 px-2 py-1 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#1a1205] disabled:opacity-50">
                      {ocupado === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Gravar
                    </button>
                  ) : !i.anotado ? (
                    <button onClick={() => anotar([i], i.id)} disabled={!!ocupado}
                      title={i.motivo === "em_branco" ? "Anota na ficha (observações): data de inclusão em branco — falta informar" : "Anota na ficha (observações): data de inclusão a conferir — não bate com o ano da barra"}
                      className="inline-flex items-center gap-1 rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
                      {ocupado === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NotebookPen className="h-3.5 w-3.5" />} Anotar na ficha
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
