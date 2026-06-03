/* eslint-disable react/no-unescaped-entities */
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Search,
  FilterX,
  ClipboardCheck,
  Loader2,
  Plus,
} from "lucide-react";

export type LinhaParticipante = {
  efetivoId: string;
  postoGrad: string | null;
  nomeGuerra: string | null;
  nome: string | null;
  matricula: string | null;
  enviadas: number;
  pdfUnificado: string | null;
};

type Props = {
  periodoNome: string;
  periodoData: string | null;
  total: number;
  participantes: LinhaParticipante[];
};

function statusDe(enviadas: number, total: number) {
  if (enviadas >= total) return { rotulo: "Completo", cor: "bg-emerald-100 text-emerald-700" };
  if (enviadas > 0) return { rotulo: "Parcial", cor: "bg-amber-100 text-amber-700" };
  return { rotulo: "Não iniciou", cor: "bg-gray-100 text-gray-500" };
}

export default function PainelPromocoes({
  periodoNome,
  periodoData,
  total,
  participantes,
}: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [carregando, setCarregando] = useState(false);

  const resumo = useMemo(() => {
    let completos = 0, parciais = 0, naoIniciaram = 0;
    participantes.forEach((p) => {
      if (p.enviadas >= total) completos++;
      else if (p.enviadas > 0) parciais++;
      else naoIniciaram++;
    });
    return { completos, parciais, naoIniciaram };
  }, [participantes, total]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return participantes.filter((p) => {
      const st = statusDe(p.enviadas, total).rotulo;
      if (filtroStatus && st !== filtroStatus) return false;
      if (!q) return true;
      const alvo = `${p.nome ?? ""} ${p.nomeGuerra ?? ""} ${p.matricula ?? ""} ${p.postoGrad ?? ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [participantes, busca, filtroStatus, total]);

  async function adicionarTodos() {
    setCarregando(true);
    try {
      const res = await fetch("/api/promocoes/participantes", { method: "POST" });
      await res.json().catch(() => ({}));
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  const Card = ({
    Icone,
    valor,
    rotulo,
    cor,
  }: {
    Icone: React.ComponentType<{ className?: string }>;
    valor: number;
    rotulo: string;
    cor: string;
  }) => (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <Icone className={`mb-1 h-5 w-5 ${cor}`} />
      <p className="text-2xl font-bold text-sigep-navy">{valor}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Cabecalho do periodo */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sigep-navy p-4 text-white">
        <ClipboardCheck className="h-6 w-6 text-sigep-dourado" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{periodoNome}</p>
          {periodoData && <p className="text-xs text-white/60">Alvo: {periodoData}</p>}
        </div>
        <button
          onClick={adicionarTodos}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-60"
        >
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar todo o efetivo
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card Icone={Users} valor={participantes.length} rotulo="Total no processo" cor="text-sigep-dourado" />
        <Card Icone={CheckCircle2} valor={resumo.completos} rotulo="Completos" cor="text-emerald-600" />
        <Card Icone={Clock} valor={resumo.parciais} rotulo="Parciais" cor="text-amber-500" />
        <Card Icone={AlertTriangle} valor={resumo.naoIniciaram} rotulo="Não iniciaram" cor="text-red-500" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, matrícula, posto..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sigep-dourado"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-sigep-dourado"
        >
          <option value="">Todos os status</option>
          <option value="Completo">Completos</option>
          <option value="Parcial">Parciais</option>
          <option value="Não iniciou">Não iniciaram</option>
        </select>
        {(busca || filtroStatus) && (
          <button
            onClick={() => { setBusca(""); setFiltroStatus(""); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            <FilterX className="h-4 w-4" /> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 font-semibold">Grad.</th>
              <th className="px-4 py-3 font-semibold">Nome de Guerra</th>
              <th className="px-4 py-3 font-semibold">Matrícula</th>
              <th className="px-4 py-3 font-semibold">Certidões</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map((p) => {
              const st = statusDe(p.enviadas, total);
              return (
                <tr key={p.efetivoId} className="hover:bg-sigep-cinza/50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                    {p.postoGrad ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-sigep-navy">
                      {p.nomeGuerra || p.nome || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    {p.matricula ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-sigep-navy">{p.enviadas}</span>
                    <span className="text-gray-400">/{total}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cor}`}>
                      {st.rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.pdfUnificado ? (
                      <a
                        href={`/api/promocoes/download?key=${encodeURIComponent(p.pdfUnificado)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sigep-navy/20 px-2.5 py-1 text-xs font-medium text-sigep-navy transition hover:bg-sigep-navy hover:text-white"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF unificado
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">aguardando</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Nenhum policial no processo ainda. Use 'Adicionar todo o efetivo' ou aguarde os envios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
