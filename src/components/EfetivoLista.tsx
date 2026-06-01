"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";

type Militar = {
  id: string;
  postoGrad: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  situacao: string | null;
  lotacao: string | null;
  telefone: string | null;
};

function corSituacao(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("pronto")) return "bg-emerald-100 text-emerald-700";
  if (v.includes("jms")) return "bg-red-100 text-red-700";
  if (v.includes("licen") || v === "lp" || v === "ltip")
    return "bg-amber-100 text-amber-700";
  if (v.includes("reserva")) return "bg-gray-200 text-gray-600";
  return "bg-slate-100 text-slate-600";
}

export default function EfetivoLista({ militares }: { militares: Militar[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("");

  const situacoes = useMemo(() => {
    const set = new Set<string>();
    militares.forEach((m) => {
      if (m.situacao && m.situacao.trim()) set.add(m.situacao.trim());
    });
    return Array.from(set).sort();
  }, [militares]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return militares.filter((m) => {
      if (situacao && (m.situacao ?? "") !== situacao) return false;
      if (!q) return true;
      const alvo = `${m.nome ?? ""} ${m.nomeGuerra ?? ""} ${m.matricula ?? ""} ${
        m.postoGrad ?? ""
      } ${m.lotacao ?? ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [militares, busca, situacao]);

  function abrir(id: string) {
    router.push(`/efetivo/${encodeURIComponent(id)}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, matrícula, posto, lotação..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sigep-dourado"
          />
        </div>
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-sigep-dourado"
        >
          <option value="">Todas as situações</option>
          {situacoes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-gray-500">
        Mostrando{" "}
        <span className="font-semibold text-sigep-navy">{filtrados.length}</span>{" "}
        de {militares.length} militares
      </p>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 font-semibold">Posto/Grad</th>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Matrícula</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
              <th className="px-4 py-3 font-semibold">Lotação</th>
              <th className="px-4 py-3 font-semibold">Telefone</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map((m) => (
              <tr
                key={m.id}
                onClick={() => abrir(m.id)}
                className="group cursor-pointer transition hover:bg-sigep-cinza/60"
              >
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                  {m.postoGrad ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-sigep-navy">{m.nome ?? "—"}</p>
                  {m.nomeGuerra && (
                    <p className="text-xs text-gray-400">{m.nomeGuerra}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {m.matricula ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${corSituacao(
                      m.situacao
                    )}`}
                  >
                    {m.situacao && m.situacao.trim() ? m.situacao : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {m.lotacao ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {m.telefone ?? "—"}
                </td>
                <td className="px-2 py-3">
                  <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:text-sigep-dourado" />
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Nenhum militar encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
