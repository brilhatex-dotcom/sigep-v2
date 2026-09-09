"use client";

import { useMemo, useState, useEffect } from "react";
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
  if (v.includes("pronto")) return "bg-emerald-500/15 text-emerald-300";
  if (v.includes("jms")) return "bg-red-500/15 text-red-300";
  if (v.includes("féria") || v.includes("feria")) return "bg-sky-500/15 text-sky-300";
  if (v.includes("licen") || v === "lp" || v === "ltip") return "bg-amber-500/15 text-amber-300";
  if (v.includes("reserva")) return "bg-white/10 text-apagado";
  return "bg-white/5 text-apagado";
}

export default function EfetivoLista({
  militares,
  buscaInicial = "",
  situacaoInicial = "",
}: {
  militares: Militar[];
  buscaInicial?: string;
  situacaoInicial?: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaInicial);
  const [situacao, setSituacao] = useState(situacaoInicial);

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
      const alvo = `${m.nome ?? ""} ${m.nomeGuerra ?? ""} ${m.matricula ?? ""} ${m.postoGrad ?? ""} ${m.lotacao ?? ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [militares, busca, situacao]);

  // busca inteligente: se veio uma busca da URL e ela casa com 1 militar,
  // abre a ficha direto.
  useEffect(() => {
    if (buscaInicial.trim()) {
      const q = buscaInicial.trim().toLowerCase();
      const casa = militares.filter((m) =>
        `${m.nome ?? ""} ${m.nomeGuerra ?? ""} ${m.matricula ?? ""}`.toLowerCase().includes(q)
      );
      if (casa.length === 1) {
        router.replace(`/efetivo/${encodeURIComponent(casa[0].id)}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir(id: string) {
    router.push(`/efetivo/${encodeURIComponent(id)}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-apagado" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, matrícula, posto, lotação..."
            className="w-full rounded-lg border border-white/10 bg-campo py-2 pl-9 pr-3 text-sm text-white placeholder-apagado outline-none focus:border-ouro/50"
          />
        </div>
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className="rounded-lg border border-white/10 bg-campo px-3 py-2 text-sm text-white outline-none focus:border-ouro/50"
        >
          <option value="">Todas as situações</option>
          {situacoes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <a
          href="/efetivo/novo"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-ouro px-4 py-2 text-sm font-semibold text-ouro-texto shadow-lg shadow-ouro/20 transition hover:brightness-110"
        >
          + Adicionar novo militar
        </a>
      </div>

      <p className="mb-3 text-sm text-apagado">
        Mostrando <span className="font-semibold text-white">{filtrados.length}</span> de {militares.length} militares
      </p>

      <div className="overflow-x-auto rounded-xl border border-white/5 bg-painel">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-apagado">
              <th className="px-4 py-3 font-semibold">Posto/Grad</th>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Matrícula</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
              <th className="px-4 py-3 font-semibold">Lotação</th>
              <th className="px-4 py-3 font-semibold">Telefone</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtrados.map((m) => (
              <tr
                key={m.id}
                onClick={() => abrir(m.id)}
                className="group cursor-pointer transition hover:bg-white/5"
              >
                <td className="whitespace-nowrap px-4 py-3 text-apagado">{m.postoGrad ?? "—"}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{m.nome ?? "—"}</p>
                  {m.nomeGuerra && <p className="text-xs text-apagado">{m.nomeGuerra}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-apagado">{m.matricula ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${corSituacao(m.situacao)}`}>
                    {m.situacao && m.situacao.trim() ? m.situacao : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-apagado">{m.lotacao ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-apagado">{m.telefone ?? "—"}</td>
                <td className="px-2 py-3">
                  <ChevronRight className="h-4 w-4 text-white/20 transition group-hover:text-ouro" />
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-apagado">
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
