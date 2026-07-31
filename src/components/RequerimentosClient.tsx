"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Clock, CheckCircle2, XCircle, FileEdit, X, Search, ArrowDownUp,
} from "lucide-react";
import {
  MODALIDADES_COMUM,
  MODALIDADES_CURSOS,
  MODALIDADES_MATERIAL,
  modeloDaModalidade,
} from "@/lib/requerimentos";

type Item = {
  id: string;
  modalidade: string;
  modelo: string;
  status: string;
  criadoEm: string;
  requerente: string;
};

function selo(status: string) {
  const mapa: Record<string, { txt: string; cls: string; Icone: any }> = {
    rascunho: { txt: "Rascunho", cls: "bg-white/10 text-[#94A3B8]", Icone: FileEdit },
    enviado: { txt: "Enviado", cls: "bg-sky-500/15 text-sky-300", Icone: Clock },
    deferido: { txt: "Deferido", cls: "bg-emerald-500/15 text-emerald-300", Icone: CheckCircle2 },
    indeferido: { txt: "Indeferido", cls: "bg-red-500/15 text-red-300", Icone: XCircle },
  };
  return mapa[status] ?? mapa["rascunho"];
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function rotuloMes(chave: string): string {
  const [a, m] = chave.split("-").map(Number);
  return `${MESES_PT[(m || 1) - 1]} de ${a}`;
}

// abas: filtro -> rotulo + quais status entram
type Aba = { id: string; rotulo: string; status: string[] };

const ABAS_ADMIN: Aba[] = [
  { id: "enviado", rotulo: "Pendentes", status: ["enviado"] },
  { id: "deferido", rotulo: "Deferidos", status: ["deferido"] },
  { id: "indeferido", rotulo: "Indeferidos", status: ["indeferido"] },
  { id: "todos", rotulo: "Todos", status: ["rascunho", "enviado", "deferido", "indeferido"] },
];

const ABAS_POLICIAL: Aba[] = [
  { id: "todos", rotulo: "Todos", status: ["rascunho", "enviado", "deferido", "indeferido"] },
  { id: "rascunho", rotulo: "Rascunhos", status: ["rascunho"] },
  { id: "enviado", rotulo: "Enviados", status: ["enviado"] },
  { id: "deferido", rotulo: "Deferidos", status: ["deferido"] },
  { id: "indeferido", rotulo: "Indeferidos", status: ["indeferido"] },
];

export default function RequerimentosClient({
  itens,
  ehAdmin,
  temFicha,
}: {
  itens: Item[];
  ehAdmin: boolean;
  temFicha: boolean;
}) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(false);

  const abas = ehAdmin ? ABAS_ADMIN : ABAS_POLICIAL;
  const [aba, setAba] = useState<string>(abas[0].id);
  const [busca, setBusca] = useState("");
  const [filtroModalidade, setFiltroModalidade] = useState("");
  const [maisAntigos, setMaisAntigos] = useState<boolean>(ehAdmin); // admin: fila justa (antigos 1o)

  function novo(modalidade: string) {
    const modelo = modeloDaModalidade(modalidade);
    const q = new URLSearchParams({ modalidade, modelo });
    router.push(`/requerimentos/novo?${q.toString()}`);
  }

  // contadores por aba (sobre o total, nao sobre o filtrado)
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of abas) c[a.id] = itens.filter((r) => a.status.includes(r.status)).length;
    return c;
  }, [itens, abas]);

  // modalidades distintas presentes (para o dropdown)
  const modalidadesPresentes = useMemo(
    () => Array.from(new Set(itens.map((r) => r.modalidade))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [itens]
  );

  const lista = useMemo(() => {
    const statusDaAba = abas.find((a) => a.id === aba)?.status ?? [];
    const termo = busca.trim().toLowerCase();
    return itens
      .filter((r) => statusDaAba.includes(r.status))
      .filter((r) => (filtroModalidade ? r.modalidade === filtroModalidade : true))
      .filter((r) =>
        termo
          ? r.requerente.toLowerCase().includes(termo) || r.modalidade.toLowerCase().includes(termo)
          : true
      )
      .sort((a, b) => {
        const da = new Date(a.criadoEm).getTime();
        const db = new Date(b.criadoEm).getTime();
        return maisAntigos ? da - db : db - da;
      });
  }, [itens, abas, aba, busca, filtroModalidade, maisAntigos]);

  // Agrupa por mes (como as JOEs): guarda cada requerimento dentro do seu mes.
  const porMes = useMemo(() => {
    const map = new Map<string, typeof lista>();
    for (const r of lista) {
      const d = new Date(r.criadoEm);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(r);
    }
    return Array.from(map.keys())
      .sort((a, b) => (maisAntigos ? a.localeCompare(b) : b.localeCompare(a)))
      .map((mes) => ({ mes, itens: map.get(mes)! }));
  }, [lista, maisAntigos]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Requerimentos</h1>
          <p className="text-sm text-[#94A3B8]">
            {ehAdmin
              ? temFicha
                ? "Analise os requerimentos enviados ou crie o seu próprio."
                : "Requerimentos enviados pelos militares para análise."
              : "Preencha e envie seus requerimentos ao P/1."}
          </p>
        </div>
        {temFicha && (
          <button
            onClick={() => setEscolhendo(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Novo requerimento
          </button>
        )}
      </div>

      {!temFicha && ehAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Para criar requerimentos próprios, vincule sua ficha de efetivo (refEfetivo) ao seu usuário.
          Sem isso, você só visualiza para análise.
        </div>
      )}
      {!temFicha && !ehAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Seu usuário não está vinculado a uma ficha de efetivo, então não é possível criar
          requerimentos. Avise o administrador.
        </div>
      )}

      {/* abas por status */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {abas.map((a) => {
          const ativo = a.id === aba;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                ativo
                  ? "bg-[#D4AF37] text-[#1a1205]"
                  : "border border-white/10 bg-white/5 text-[#94A3B8] hover:text-white"
              }`}
            >
              {a.rotulo}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  ativo ? "bg-[#1a1205]/20 text-[#1a1205]" : "bg-white/10 text-[#94A3B8]"
                }`}
              >
                {contagem[a.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* barra de ferramentas: busca + modalidade + ordenacao */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={ehAdmin ? "Buscar por requerente ou modalidade..." : "Buscar por modalidade..."}
            className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] py-2 pl-9 pr-3 text-sm text-[#E8EEF6] placeholder:text-[#94A3B8]/60 focus:border-[#D4AF37]/40 focus:outline-none"
          />
        </div>

        <select
          value={filtroModalidade}
          onChange={(e) => setFiltroModalidade(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-[#E8EEF6] focus:border-[#D4AF37]/40 focus:outline-none"
        >
          <option value="">Todas as modalidades</option>
          {modalidadesPresentes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <button
          onClick={() => setMaisAntigos((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#94A3B8] transition hover:text-white"
          title="Alternar ordenação"
        >
          <ArrowDownUp className="h-4 w-4" />
          {maisAntigos ? "Mais antigos" : "Mais recentes"}
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="ui-card p-10 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]/40" />
          <p className="text-sm text-[#94A3B8]">
            {busca || filtroModalidade
              ? "Nenhum requerimento corresponde aos filtros."
              : ehAdmin
              ? "Nenhum requerimento nesta aba."
              : "Você ainda não criou nenhum requerimento."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {porMes.map((g) => (
            <div key={g.mes}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                {rotuloMes(g.mes)}
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-normal text-[#94A3B8]">{g.itens.length}</span>
              </h3>
              <ul className="space-y-2">
                {g.itens.map((r) => {
                  const s = selo(r.status);
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => router.push(`/requerimentos/${r.id}`)}
                        className="ui-card flex w-full items-center justify-between gap-3 p-4 text-left transition hover:border-[#D4AF37]/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{r.modalidade}</p>
                          <p className="text-[12px] text-[#94A3B8]">
                            {ehAdmin ? `${r.requerente} · ` : ""}{dataBR(r.criadoEm)}
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
                          <s.Icone className="h-3.5 w-3.5" /> {s.txt}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* modal de escolha de modalidade */}
      {escolhendo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4">
          <div className="ui-card mt-10 w-full max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Escolha a modalidade</h2>
              <button onClick={() => setEscolhendo(false)} className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/5 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">Requerimentos comuns</p>
            <div className="mb-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {MODALIDADES_COMUM.map((m) => (
                <button
                  key={m}
                  onClick={() => novo(m)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-[#E8EEF6] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              Armamento e material bélico
            </p>
            <div className="mb-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {MODALIDADES_MATERIAL.map((m) => (
                <button
                  key={m}
                  onClick={() => novo(m)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-[#E8EEF6] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">Cursos</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {MODALIDADES_CURSOS.map((m) => (
                <button
                  key={m}
                  onClick={() => novo(m)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-[#E8EEF6] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
