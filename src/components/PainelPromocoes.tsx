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
  ChevronDown,
  Archive,
  RotateCcw,
  X,
  CalendarPlus,
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

export type PeriodoResumo = {
  id: string;
  nome: string;
  dataAlvo: string | null;
  ativo: boolean;
  participantes: number;
};

type Props = {
  periodoId: string;
  periodoNome: string;
  periodoData: string | null;
  total: number;
  participantes: LinhaParticipante[];
  periodos: PeriodoResumo[]; // todos os periodos (pro seletor e arquivadas)
};

function statusDe(enviadas: number, total: number) {
  if (enviadas >= total) return { rotulo: "Completo", cor: "bg-emerald-500/15 text-emerald-300" };
  if (enviadas > 0) return { rotulo: "Parcial", cor: "bg-amber-500/15 text-amber-300" };
  return { rotulo: "Não iniciou", cor: "bg-white/5 text-[#94A3B8]" };
}

export default function PainelPromocoes({
  periodoId,
  periodoNome,
  periodoData,
  total,
  participantes,
  periodos,
}: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [carregando, setCarregando] = useState(false);

  // controles de periodo
  const [menuAberto, setMenuAberto] = useState(false);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalArquivadas, setModalArquivadas] = useState(false);
  const [acaoPeriodo, setAcaoPeriodo] = useState(false);

  const ativos = periodos.filter((p) => p.ativo);
  const arquivados = periodos.filter((p) => !p.ativo);

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

  async function trocarAtiva(id: string) {
    if (id === periodoId) { setMenuAberto(false); return; }
    setAcaoPeriodo(true);
    try {
      await fetch(`/api/promocoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ativar" }),
      });
      setMenuAberto(false);
      router.refresh();
    } finally {
      setAcaoPeriodo(false);
    }
  }

  async function arquivar(id: string) {
    if (!confirm("Arquivar este período? Ele sai da tela principal, mas todas as certidões e dados são mantidos. Você pode reativar depois.")) return;
    setAcaoPeriodo(true);
    try {
      await fetch(`/api/promocoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "arquivar" }),
      });
      router.refresh();
    } finally {
      setAcaoPeriodo(false);
    }
  }

  async function reativar(id: string) {
    setAcaoPeriodo(true);
    try {
      await fetch(`/api/promocoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ativar" }),
      });
      setModalArquivadas(false);
      router.refresh();
    } finally {
      setAcaoPeriodo(false);
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
    <div className="ui-card p-4">
      <Icone className={`mb-1 h-5 w-5 ${cor}`} />
      <p className="text-2xl font-bold text-white">{valor}</p>
      <p className="text-xs text-[#94A3B8]">{rotulo}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Barra de controles de periodo */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Seletor de periodo ativo */}
        <div className="relative">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white transition hover:border-[#D4AF37]/50"
          >
            <ClipboardCheck className="h-4 w-4 text-[#D4AF37]" />
            <span className="font-medium">{periodoNome}</span>
            <ChevronDown className={`h-4 w-4 text-[#94A3B8] transition ${menuAberto ? "rotate-180" : ""}`} />
          </button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-white/10 bg-[#0F1B2D] p-1 shadow-xl">
                {ativos.length === 0 && (
                  <p className="px-3 py-2 text-xs text-[#94A3B8]">Nenhum período ativo.</p>
                )}
                {ativos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => trocarAtiva(p.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
                      p.id === periodoId ? "text-[#D4AF37]" : "text-white"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{p.nome}</span>
                      {p.dataAlvo && <span className="text-xs text-[#94A3B8]">Alvo: {p.dataAlvo}</span>}
                    </span>
                    <span className="text-xs text-[#94A3B8]">{p.participantes}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Nova promocao */}
        <button
          onClick={() => setModalNovo(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-medium text-[#1a1205] transition hover:brightness-110"
        >
          <CalendarPlus className="h-4 w-4" /> Nova promoção
        </button>

        {/* Arquivadas */}
        {arquivados.length > 0 && (
          <button
            onClick={() => setModalArquivadas(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
          >
            <Archive className="h-4 w-4" /> Arquivadas ({arquivados.length})
          </button>
        )}

        <div className="flex-1" />

        {/* Arquivar periodo atual */}
        <button
          onClick={() => arquivar(periodoId)}
          disabled={acaoPeriodo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-60"
        >
          {acaoPeriodo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
          Arquivar período
        </button>
      </div>

      {/* Cabecalho do periodo */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#0F1B2D] p-4 text-white">
        <ClipboardCheck className="h-6 w-6 text-[#D4AF37]" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{periodoNome}</p>
          {periodoData && <p className="text-xs text-[#94A3B8]">Alvo: {periodoData}</p>}
        </div>
        <button
          onClick={adicionarTodos}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-medium text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
        >
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar todo o efetivo
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card Icone={Users} valor={participantes.length} rotulo="Total no processo" cor="text-[#D4AF37]" />
        <Card Icone={CheckCircle2} valor={resumo.completos} rotulo="Completos" cor="text-emerald-400" />
        <Card Icone={Clock} valor={resumo.parciais} rotulo="Parciais" cor="text-amber-400" />
        <Card Icone={AlertTriangle} valor={resumo.naoIniciaram} rotulo="Não iniciaram" cor="text-red-400" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, matrícula, posto..."
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white placeholder-[#94A3B8] outline-none focus:border-[#D4AF37]/50"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        >
          <option value="">Todos os status</option>
          <option value="Completo">Completos</option>
          <option value="Parcial">Parciais</option>
          <option value="Não iniciou">Não iniciaram</option>
        </select>
        {(busca || filtroStatus) && (
          <button
            onClick={() => { setBusca(""); setFiltroStatus(""); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
          >
            <FilterX className="h-4 w-4" /> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#0F1B2D]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-[#94A3B8]">
              <th className="px-4 py-3 font-semibold">Grad.</th>
              <th className="px-4 py-3 font-semibold">Nome de Guerra</th>
              <th className="px-4 py-3 font-semibold">Matrícula</th>
              <th className="px-4 py-3 font-semibold">Certidões</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtrados.map((p) => {
              const st = statusDe(p.enviadas, total);
              return (
                <tr key={p.efetivoId} className="hover:bg-white/5">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#94A3B8]">
                    {p.postoGrad ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-white">
                      {p.nomeGuerra || p.nome || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#94A3B8]">
                    {p.matricula ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-white">{p.enviadas}</span>
                    <span className="text-[#94A3B8]">/{total}</span>
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-2.5 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#1a1205]"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF unificado
                      </a>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">aguardando</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#94A3B8]">
                  Nenhum policial no processo ainda. Use 'Adicionar todo o efetivo' ou aguarde os envios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nova Promocao */}
      {modalNovo && (
        <ModalNovaPromocao
          onFechar={() => setModalNovo(false)}
          onCriado={() => { setModalNovo(false); router.refresh(); }}
        />
      )}

      {/* Modal Arquivadas */}
      {modalArquivadas && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalArquivadas(false)}>
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0F1B2D] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Archive className="h-5 w-5 text-[#D4AF37]" /> Promoções arquivadas
              </h3>
              <button onClick={() => setModalArquivadas(false)} className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {arquivados.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#0b1626] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-white">{p.nome}</p>
                    <p className="text-xs text-[#94A3B8]">
                      {p.dataAlvo ? `Alvo: ${p.dataAlvo} · ` : ""}{p.participantes} participantes
                    </p>
                  </div>
                  <button
                    onClick={() => reativar(p.id)}
                    disabled={acaoPeriodo}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-2.5 py-1.5 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#1a1205] disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reativar
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#94A3B8]">
              Reativar torna esta a promoção ativa e arquiva a atual. Nenhum dado é perdido.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Modal de criacao ---------- */
function ModalNovaPromocao({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [nome, setNome] = useState("");
  const [dataAlvo, setDataAlvo] = useState("");
  const [adicionarEfetivo, setAdicionarEfetivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nome.trim()) { setErro("Informe um nome para a promoção."); return; }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/promocoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), dataAlvo: dataAlvo || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j.erro || "Falha ao criar promoção.");
        setSalvando(false);
        return;
      }
      // o novo periodo ja fica ativo (o POST faz updateMany ativo:false + cria ativo:true)
      if (adicionarEfetivo) {
        await fetch("/api/promocoes/participantes", { method: "POST" }).catch(() => {});
      }
      onCriado();
    } catch {
      setErro("Erro de conexão.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CalendarPlus className="h-5 w-5 text-[#D4AF37]" /> Nova promoção
          </h3>
          <button onClick={onFechar} className="text-[#94A3B8] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Nome da promoção</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: promoção dezembro 2026"
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white placeholder-[#94A3B8] outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Data-alvo (opcional)</label>
            <input
              type="date"
              value={dataAlvo}
              onChange={(e) => setDataAlvo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-[#0b1626] p-3">
            <input
              type="checkbox"
              checked={adicionarEfetivo}
              onChange={(e) => setAdicionarEfetivo(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
            />
            <span className="text-sm text-white">
              Adicionar todo o efetivo agora
              <span className="mt-0.5 block text-xs text-[#94A3B8]">
                Inclui todos os militares como participantes. Desmarque para começar vazia e adicionar depois.
              </span>
            </span>
          </label>

          {erro && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{erro}</p>
          )}

          <p className="text-xs text-[#94A3B8]">
            A nova promoção passa a ser a ativa. A promoção atual é arquivada automaticamente (dados preservados).
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onFechar}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-medium text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Criar promoção
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
