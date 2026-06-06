"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Pencil, Loader2, Search } from "lucide-react";
import SlideOver from "@/components/SlideOver";
import BotoesExport from "@/components/BotoesExport";

export type LinhaJms = {
  id: string;
  nome: string;
  postoGrad: string;
  inicioBR: string;
  inicioISO: string;
  retornoBR: string;
  retornoISO: string;
  dias: number;
  motivo: string;
  urgencia: "vencida" | "proxima" | "normal" | "sem";
};

const URG: Record<string, { rotulo: string; classe: string }> = {
  vencida: { rotulo: "🔴 Vencida", classe: "bg-red-500/15 text-red-300" },
  proxima: { rotulo: "🟡 Próxima", classe: "bg-amber-500/15 text-amber-300" },
  normal: { rotulo: "🟢 Em dia", classe: "bg-emerald-500/15 text-emerald-300" },
  sem: { rotulo: "— sem retorno", classe: "bg-white/5 text-[#94A3B8]" },
};

export default function JmsTabela({ linhas }: { linhas: LinhaJms[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<LinhaJms | null>(null);
  const [ini, setIni] = useState("");
  const [ret, setRet] = useState("");
  const [mot, setMot] = useState("");
  const [salvando, setSalvando] = useState(false);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...linhas]
      .filter((l) => !q || `${l.nome} ${l.postoGrad} ${l.motivo}`.toLowerCase().includes(q))
      .sort((a, b) => b.dias - a.dias);
  }, [linhas, busca]);

  function abrir(l: LinhaJms) {
    setEdit(l);
    setIni(l.inicioISO || "");
    setRet(l.retornoISO || "");
    setMot(l.motivo === "—" ? "" : l.motivo);
  }

  async function salvar() {
    if (!edit) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/jms/${encodeURIComponent(edit.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jmsDataInicio: ini, jmsDataRetorno: ret, jmsMotivo: mot }),
      });
      setSalvando(false);
      if (res.ok) {
        setEdit(null);
        router.refresh();
      }
    } catch {
      setSalvando(false);
    }
  }

  const colunas = ["#", "Militar", "Graduação", "Início", "Dias", "Retorno", "Motivo", "Situação"];
  const dadosExport = filtradas.map((l, i) => [
    i + 1, l.nome, l.postoGrad, l.inicioBR, l.dias, l.retornoBR, l.motivo, URG[l.urgencia].rotulo,
  ]);

  return (
    <section className="ui-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <HeartPulse className="h-4 w-4 text-[#EF4444]" />
          Junta Médica de Saúde ({linhas.length})
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="w-40 rounded-lg border border-white/10 bg-[#0b1626] py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-[#D4AF37]/50 print:hidden"
            />
          </div>
          <BotoesExport nomeArquivo="jms-18bpm" colunas={colunas} linhas={dadosExport} />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#94A3B8]">
          Nenhum militar em JMS no momento.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-3">Militar</th>
                <th className="py-2 pr-3">Início</th>
                <th className="py-2 pr-3">Dias</th>
                <th className="py-2 pr-3">Retorno</th>
                <th className="py-2 pr-3">Motivo</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 print:hidden">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtradas.map((l, i) => (
                <tr key={l.id}>
                  <td className="py-2 pr-2 text-[#94A3B8]">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-white">{l.nome}</span>
                    <span className="block text-[11px] text-[#94A3B8]">{l.postoGrad}</span>
                  </td>
                  <td className="py-2 pr-3 text-[#94A3B8]">{l.inicioBR}</td>
                  <td className="py-2 pr-3 font-semibold text-white">{l.dias}</td>
                  <td className="py-2 pr-3 text-[#94A3B8]">{l.retornoBR}</td>
                  <td className="py-2 pr-3 text-[#94A3B8]">{l.motivo}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${URG[l.urgencia].classe}`}>
                      {URG[l.urgencia].rotulo}
                    </span>
                  </td>
                  <td className="py-2 print:hidden">
                    <button
                      onClick={() => abrir(l)}
                      className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        aberto={!!edit}
        titulo={edit ? `JMS · ${edit.nome}` : "JMS"}
        onFechar={() => setEdit(null)}
      >
        <label className="mb-1 block text-sm font-medium text-white">Início do JMS</label>
        <input type="date" value={ini} onChange={(e) => setIni(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />

        <label className="mb-1 block text-sm font-medium text-white">Retorno previsto</label>
        <input type="date" value={ret} onChange={(e) => setRet(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />

        <label className="mb-1 block text-sm font-medium text-white">Motivo</label>
        <input value={mot} onChange={(e) => setMot(e.target.value)} placeholder="Ex.: Doença, cirurgia..."
          className="mb-5 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />

        <button onClick={salvar} disabled={salvando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] py-2.5 font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar alterações
        </button>
      </SlideOver>
    </section>
  );
}
