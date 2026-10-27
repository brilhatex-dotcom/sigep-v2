/* eslint-disable react/no-unescaped-entities */
"use client";
import { useEffect, useMemo, useState } from "react";
import PlanilhaPadraoPainel from "@/components/PlanilhaPadraoPainel";
import CertidaoP1Painel from "@/components/CertidaoP1Painel";
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
  Trash2,
  ScanSearch,
  ExternalLink,
} from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import { sorteadaParaSite, type ItemConferido, type ResultadoConferencia } from "@/lib/conferenciaCertidoes";

export type LinhaParticipante = {
  efetivoId: string;
  postoGrad: string | null;
  nomeGuerra: string | null;
  nome: string | null;
  matricula: string | null;
  enviadas: number;
  // quantas este militar deve: 8 (praca) ou 9 (oficial, com o TRF6)
  total: number;
  pdfUnificado: string | null;
  enviadoP1Em: string | null;
  recebidoP1Em: string | null;
  /* está no Limite Quantitativo da CPPPM? "fora" = praça de graduação com
     lista carregada que NÃO aparece nela (ver situacaoNoLimite) */
  limite?: "dentro" | "fora" | "sem_lista" | "nao_se_aplica" | null;
  /* conferência automática das certidões (lib/conferenciaCertidoes.ts);
     null = ainda não conferidas. `conferenciaVelha`: houve conferência, mas
     o militar trocou certidão depois — tem de conferir de novo. */
  conferencia?: (ResultadoConferencia & { conferidoEm: string }) | null;
  conferenciaVelha?: boolean;
  // conferência no SITE do tribunal, feita pelo P/1, por item (ordem)
  autenticidade?: Record<number, Marca>;
};

type Marca = { codigo: string; resultado: "autentica" | "nao_confere"; por: string; em: string };
type MarcasPorMilitar = Record<string, Record<number, Marca>>;

// a marca só vale para o código que foi conferido (trocou a certidão, não vale)
const marcaDe = (m: Record<number, Marca> | undefined, i: ItemConferido) => {
  const x = m?.[i.ordem];
  return x && x.codigo === (i.codigo || "") ? x : undefined;
};
/* Precisa conferir no site: a amostra sorteada (1 em cada 4) e TODA certidão
   com sinal de adulteração ou de clone. */
const precisaSite = (periodoId: string, efetivoId: string, i: ItemConferido) =>
  i.achou && (!!i.suspeita || sorteadaParaSite(periodoId, efetivoId, i.ordem));

function situacaoSite(periodoId: string, p: LinhaParticipante, marcas: MarcasPorMilitar) {
  const c = p.conferencia;
  let faltam = 0, conferidas = 0, naoConfere = 0;
  for (const i of c?.itens || []) {
    const m = marcaDe(marcas[p.efetivoId], i);
    if (m) { conferidas++; if (m.resultado === "nao_confere") naoConfere++; }
    else if (precisaSite(periodoId, p.efetivoId, i)) faltam++;
  }
  return { faltam, conferidas, naoConfere };
}

const quemE = (p: LinhaParticipante) => [p.postoGrad, p.nomeGuerra || p.nome].filter(Boolean).join(" ");
const pontosDe = (c: ResultadoConferencia) =>
  c.gerais.length + c.itens.reduce((n, i) => n + i.alertas.length, 0);

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
  participantes,
  periodos,
}: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmandoP1, setConfirmandoP1] = useState<string | null>(null);
  // conferência automática: andamento do lote e o militar aberto no detalhe
  const [conferindo, setConferindo] = useState<{ feitos: number; total: number } | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaParticipante | null>(null);
  // o que o P/1 marcou no site do tribunal (atualiza na hora, sem recarregar)
  const [marcas, setMarcas] = useState<MarcasPorMilitar>(() =>
    Object.fromEntries(participantes.map((p) => [p.efetivoId, p.autenticidade || {}])));
  useEffect(() => {
    setMarcas(Object.fromEntries(participantes.map((p) => [p.efetivoId, p.autenticidade || {}])));
  }, [participantes]);

  async function marcarSite(efetivoId: string, i: ItemConferido, resultado: Marca["resultado"] | null) {
    try {
      const r = await fetch("/api/promocoes/conferencia/autenticidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId, ordem: i.ordem, codigo: i.codigo || "", resultado }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(j?.error || "Não foi possível gravar.", "erro"); return; }
      setMarcas((o) => {
        const doMilitar = { ...(o[efetivoId] || {}) };
        if (j.marca) doMilitar[i.ordem] = j.marca; else delete doMilitar[i.ordem];
        return { ...o, [efetivoId]: doMilitar };
      });
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
  }

  /* Um militar por chamada, para mostrar o andamento e não estourar o tempo
     da função com a lista inteira. */
  async function conferir(lista: LinhaParticipante[]) {
    if (!lista.length || conferindo) return;
    setConferindo({ feitos: 0, total: lista.length });
    let falhas = 0;
    let ultima: LinhaParticipante | null = null;
    for (let i = 0; i < lista.length; i++) {
      /* Certidão que chegou como foto/print é lida da imagem, que demora: o
         servidor lê o que dá em cada chamada e guarda; aqui se chama de novo
         até terminar (com limite, para não ficar preso num arquivo ruim). */
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        try {
          const r = await fetch("/api/promocoes/conferencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ efetivoId: lista[i].efetivoId }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { falhas++; break; }
          ultima = { ...lista[i], conferencia: { ...j.conferencia.resultado, conferidoEm: j.conferencia.conferidoEm }, conferenciaVelha: false };
          if (!j.conferencia.resultado?.incompleto) break;
        } catch { falhas++; break; }
      }
      setConferindo({ feitos: i + 1, total: lista.length });
    }
    setConferindo(null);
    // conferiu um só (pelo detalhe): o detalhe já mostra o resultado novo
    if (lista.length === 1 && ultima) setDetalhe(ultima);
    if (falhas) avisar(`${falhas} militar(es) não puderam ser conferidos agora. Tente de novo.`, "erro");
    router.refresh();
  }

  async function confirmarRecebimento(efetivoId: string) {
    setConfirmandoP1(efetivoId);
    try {
      await fetch("/api/promocoes/status-p1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "receber", efetivoId, periodoId }),
      });
      router.refresh();
    } finally {
      setConfirmandoP1(null);
    }
  }

  /* Destrava o lote de um militar (ele enviou algo errado e precisa trocar).
     Volta o status para "nao enviado", liberando upload e a geracao do PDF. */
  async function reabrir(efetivoId: string, quem: string) {
    if (!await confirmar(
      `Reabrir as certidões de ${quem || "este militar"}?\n\n` +
      "Ele volta a poder trocar arquivos e gerar o PDF unificado de novo, " +
      "e precisará enviar ao P/1 outra vez."
    )) return;
    setConfirmandoP1(efetivoId);
    try {
      const r = await fetch("/api/promocoes/status-p1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reabrir", efetivoId, periodoId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        avisar(j?.error || "Falha ao reabrir.");
        return;
      }
      router.refresh();
    } finally {
      setConfirmandoP1(null);
    }
  }

  /* Tira o militar do período (envio de TESTE ou feito por engano): apaga as
     certidões, o PDF unificado e o enviado/recebido do P/1. A ficha dele não
     é tocada; se precisar concorrer, envia de novo. */
  async function excluirParticipante(efetivoId: string, quem: string, enviadas: number) {
    if (!await confirmar(
      `Excluir ${quem || "este militar"} das promoções deste período?\n\n` +
      `${enviadas ? `As ${enviadas} certidão(ões) enviada(s) e o PDF unificado serão apagados. ` : ""}` +
      "Use para envio de teste ou feito por engano. Se ele precisar concorrer, terá de enviar de novo.",
      { rotuloOk: "Excluir", perigo: true },
    )) return;
    setConfirmandoP1(efetivoId);
    try {
      const r = await fetch("/api/promocoes/participantes/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(j?.error || "Falha ao excluir.", "erro"); return; }
      avisar(`${quem || "Militar"} excluído das promoções deste período.`, "sucesso");
      router.refresh();
    } finally {
      setConfirmandoP1(null);
    }
  }

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
      if (p.enviadas >= p.total) completos++;
      else if (p.enviadas > 0) parciais++;
      else naoIniciaram++;
    });
    return { completos, parciais, naoIniciaram };
  }, [participantes]);

  /* Na lista só aparece quem tem PELO MENOS 1 certidão no sistema: quem
     ainda não mandou nada (ou mandou e excluiu todas) some daqui — fica
     contado no card "Não iniciaram". Mas o P/1 precisa poder VER e EXCLUIR
     esses também (inscrições de teste): o filtro "Não iniciaram" (ou clicar
     no card) mostra só eles. */
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return participantes.filter((p) => {
      const st = statusDe(p.enviadas, p.total).rotulo;
      if (filtroStatus === "Não iniciou") { if (p.enviadas > 0) return false; }
      else if (p.enviadas < 1) return false;
      if (filtroStatus === "Fora do Limite") { if (p.limite !== "fora") return false; }
      else if (filtroStatus === "Conferência: atenção") { if (!p.conferencia || p.conferencia.status === "ok") return false; }
      else if (filtroStatus === "Autenticidade") {
        const st = situacaoSite(periodoId, p, marcas);
        if (!st.faltam && !st.naoConfere) return false;
      }
      else if (filtroStatus && st !== filtroStatus) return false;
      if (!q) return true;
      const alvo = `${p.nome ?? ""} ${p.nomeGuerra ?? ""} ${p.matricula ?? ""} ${p.postoGrad ?? ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [participantes, busca, filtroStatus, marcas, periodoId]);

  /* Mandou certidão sem estar no Limite Quantitativo: o P/1 precisa ver de
     cara QUEM é (pedido do P/1). Só conta quem mandou ao menos uma. */
  const foraDoLimite = useMemo(
    () => participantes.filter((p) => p.limite === "fora" && p.enviadas > 0),
    [participantes],
  );

  // conferência automática: quem tem as certidões completas e o que deu
  const conf = useMemo(() => {
    const completos = participantes.filter((p) => p.enviadas >= p.total && p.enviadas > 0);
    return {
      ok: completos.filter((p) => p.conferencia?.status === "ok").length,
      atencao: completos.filter((p) => p.conferencia && p.conferencia.status !== "ok").length,
      aConferir: completos.filter((p) => !p.conferencia),
      // autenticidade no site: o que falta (amostra + suspeitas), o feito e o que não conferiu
      site: completos.reduce((t, p) => {
        const st = situacaoSite(periodoId, p, marcas);
        return { faltam: t.faltam + st.faltam, conferidas: t.conferidas + st.conferidas, naoConfere: t.naoConfere + st.naoConfere };
      }, { faltam: 0, conferidas: 0, naoConfere: 0 }),
    };
  }, [participantes, marcas, periodoId]);

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
    if (!await confirmar("Arquivar este período? Ele sai da tela principal, mas todas as certidões e dados são mantidos. Você pode reativar depois.")) return;
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

      {/* Planilha Padrao da CPPPM: fecha em 06/11, e e o que de fato sobe para
          a Comissao — as certidoes ficam arquivadas aqui (Portaria 168/2026,
          art. 4º, § 3º). Fica no alto, recolhida, para nao empurrar a lista. */}
      <PlanilhaPadraoPainel />

      {/* Declaração individual dos OFICIAIS e subtenentes (CAE): a de praça
          vai na Planilha Padrão; a de oficial sobe ao SEI num PDF único por
          policial — declaração + as certidões das regiões. */}
      <CertidaoP1Painel />

      {/* Fora do Limite Quantitativo: o alerta vem antes de tudo, com os nomes */}
      {foraDoLimite.length > 0 && (
        <div className="rounded-xl border-2 border-red-500/60 bg-red-500/10 p-4">
          <p className="flex items-center gap-2 text-base font-extrabold text-red-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
            {foraDoLimite.length === 1
              ? "1 policial mandou certidão sem estar no Limite Quantitativo"
              : `${foraDoLimite.length} policiais mandaram certidão sem estar no Limite Quantitativo`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {foraDoLimite.map((p) => (
              <li key={p.efetivoId} className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-sm font-semibold text-white">
                {[p.postoGrad, p.nomeGuerra || p.nome].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-red-100/80">
            Eles não aparecem nas listas da CPPPM carregadas em Limite Quantitativo. Confira — se não for o caso,
            avise o policial e use “Excluir” na linha dele.
          </p>
          <button onClick={() => setFiltroStatus("Fora do Limite")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
            <Search className="h-3.5 w-3.5" /> Ver só esses na lista
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card Icone={Users} valor={participantes.length} rotulo="Total no processo" cor="text-[#D4AF37]" />
        <Card Icone={CheckCircle2} valor={resumo.completos} rotulo="Completos" cor="text-emerald-400" />
        <Card Icone={Clock} valor={resumo.parciais} rotulo="Parciais" cor="text-amber-400" />
        <button type="button" onClick={() => setFiltroStatus("Não iniciou")} className="text-left"
          title="Mostrar na lista quem não iniciou (para conferir ou excluir)">
          <Card Icone={AlertTriangle} valor={resumo.naoIniciaram} rotulo="Não iniciaram" cor="text-red-400" />
        </button>
      </div>

      {/* Conferência automática das certidões */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[.06] p-4">
        <ScanSearch className="h-6 w-6 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Conferência automática das certidões</p>
          <p className="text-xs text-[#94A3B8]">
            O sistema lê cada PDF e confere se é a certidão certa, do militar (nome e CPF da ficha), NADA CONSTA e
            dentro da validade. Abra só as marcadas com ⚠. O recebimento continua sendo do senhor.
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-emerald-300">✓ {conf.ok} tudo certo</span>
            <button type="button" onClick={() => setFiltroStatus("Conferência: atenção")}
              className="text-amber-300 underline-offset-2 hover:underline">⚠ {conf.atencao} com atenção</button>
            <span className="text-[#94A3B8]">{conf.aConferir.length} a conferir</span>
          </p>
          {/* autenticidade: o código conferido no site do tribunal, por amostragem */}
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <button type="button" onClick={() => setFiltroStatus("Autenticidade")}
              className="text-sky-300 underline-offset-2 hover:underline"
              title="Amostra sorteada (1 em cada 4 certidões) e todas as que têm sinal de adulteração ou de clone">
              🔎 {conf.site.faltam} para conferir no site do tribunal
            </button>
            <span className="text-emerald-300">{conf.site.conferidas} conferidas no site</span>
            {conf.site.naoConfere > 0 && <span className="font-bold text-red-300">✗ {conf.site.naoConfere} não conferem</span>}
          </p>
        </div>
        {conferindo ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo {conferindo.feitos} de {conferindo.total}…
          </span>
        ) : conf.aConferir.length > 0 && (
          <button onClick={() => conferir(conf.aConferir)}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
            <ScanSearch className="h-4 w-4" /> Conferir agora ({conf.aConferir.length})
          </button>
        )}
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
          <option value="Fora do Limite">Fora do Limite Quantitativo</option>
          <option value="Conferência: atenção">Conferência com atenção (⚠)</option>
          <option value="Autenticidade">Autenticidade: conferir no site (🔎)</option>
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
              <th className="px-4 py-3 font-semibold">P/1</th>
              <th className="px-4 py-3 font-semibold">Conferência</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtrados.map((p) => {
              const st = statusDe(p.enviadas, p.total);
              const fora = p.limite === "fora" && p.enviadas > 0;
              return (
                <tr key={p.efetivoId} className={fora ? "bg-red-500/[.08] hover:bg-red-500/[.12]" : "hover:bg-white/5"}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#94A3B8]">
                    {p.postoGrad ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-white">
                      {p.nomeGuerra || p.nome || "—"}
                    </span>
                    {fora && (
                      <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-200"
                        title="Não aparece nas listas da CPPPM carregadas em Limite Quantitativo">
                        <AlertTriangle className="h-3 w-3" /> Fora do Limite Quantitativo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#94A3B8]">
                    {p.matricula ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-white">{p.enviadas}</span>
                    <span className="text-[#94A3B8]">/{p.total}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cor}`}>
                      {st.rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.recebidoP1Em ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Recebido
                      </span>
                    ) : p.enviadoP1Em ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/15 px-2.5 py-0.5 text-xs font-medium text-[#D4AF37]">
                        <Clock className="h-3.5 w-3.5" /> Enviado
                      </span>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <SeloConferencia p={p} onAbrir={() => setDetalhe(p)} onConferir={() => conferir([p])}
                      ocupado={!!conferindo} site={situacaoSite(periodoId, p, marcas)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
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
                      {p.enviadoP1Em && !p.recebidoP1Em && (
                        <button
                          onClick={() => confirmarRecebimento(p.efetivoId)}
                          disabled={confirmandoP1 === p.efetivoId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {confirmandoP1 === p.efetivoId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                          Confirmar recebimento
                        </button>
                      )}
                      {/* Destravar: enviado ao P/1 fecha o lote, e so o P/1
                          reabre. Sem este botao o militar que enviasse um
                          arquivo errado ficava sem saida. */}
                      {p.enviadoP1Em && (
                        <button
                          onClick={() => reabrir(p.efetivoId, p.nomeGuerra || p.nome || "")}
                          disabled={confirmandoP1 === p.efetivoId}
                          title="Destrava as certidões para o militar trocar algum arquivo"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-[#94A3B8] transition hover:bg-white/5 hover:text-white disabled:opacity-60"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                        </button>
                      )}
                      <button
                        onClick={() => excluirParticipante(p.efetivoId, p.nomeGuerra || p.nome || "", p.enviadas)}
                        disabled={confirmandoP1 === p.efetivoId}
                        title="Excluir este militar das promoções deste período (envio de teste ou por engano)"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#94A3B8]">
                  {busca || filtroStatus
                    ? "Ninguém com certidão bate com a busca."
                    : "Ninguém enviou certidão ainda. Quem mandar pelo menos uma aparece aqui."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detalhe da conferência automática */}
      {detalhe && (
        <DetalheConferencia
          p={detalhe}
          periodoId={periodoId}
          marcas={marcas[detalhe.efetivoId] || {}}
          onMarcar={(i, resultado) => marcarSite(detalhe.efetivoId, i, resultado)}
          ocupado={!!conferindo}
          onFechar={() => setDetalhe(null)}
          onConferir={() => conferir([detalhe])}
          onReceber={detalhe.enviadoP1Em && !detalhe.recebidoP1Em
            ? async () => { await confirmarRecebimento(detalhe.efetivoId); setDetalhe(null); }
            : undefined}
        />
      )}

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

/* ---------- Conferência automática: selo da linha e detalhe ---------- */
function SeloConferencia({
  p, onAbrir, onConferir, ocupado, site,
}: {
  p: LinhaParticipante; onAbrir: () => void; onConferir: () => void; ocupado: boolean;
  site: { faltam: number; conferidas: number; naoConfere: number };
}) {
  const c = p.conferencia;
  // o site do tribunal disse que não confere: isso passa na frente de tudo
  if (c && site.naoConfere > 0) {
    return (
      <button onClick={onAbrir} title="O P/1 conferiu no site do tribunal e o código não confere"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-200 hover:bg-red-500/30">
        ✗ Não confere no site
      </button>
    );
  }
  if (c) {
    const estilo = c.status === "ok"
      ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
      : c.status === "sem_texto"
        ? "bg-white/10 text-[#cbd5e1] hover:bg-white/15"
        : "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25";
    const n = pontosDe(c);
    return (
      <span className="flex flex-col items-start gap-1">
        <button onClick={onAbrir} title="Ver o que o sistema conferiu"
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${estilo}`}>
          {c.status === "ok" ? "✓ Tudo certo" : c.status === "sem_texto" ? "Sem texto — abrir" : `⚠ ${n} ${n === 1 ? "ponto" : "pontos"}`}
        </button>
        {site.faltam > 0 && (
          <button onClick={onAbrir} title="Certidões sorteadas ou suspeitas para conferir o código no site do tribunal"
            className="whitespace-nowrap text-[11px] text-sky-300 hover:underline">
            🔎 {site.faltam} no site
          </button>
        )}
      </span>
    );
  }
  if (p.enviadas < p.total) return <span className="text-xs text-[#94A3B8]">—</span>;
  return (
    <button onClick={onConferir} disabled={ocupado}
      title={p.conferenciaVelha ? "O militar trocou certidão depois da última conferência" : "Conferir as certidões deste militar"}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-sky-500/40 px-2.5 py-0.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/10 disabled:opacity-50">
      <ScanSearch className="h-3.5 w-3.5" /> {p.conferenciaVelha ? "Conferir de novo" : "Conferir"}
    </button>
  );
}

function DetalheConferencia({
  p, periodoId, marcas, onMarcar, ocupado, onFechar, onConferir, onReceber,
}: {
  p: LinhaParticipante; periodoId: string; marcas: Record<number, Marca>;
  onMarcar: (i: ItemConferido, resultado: Marca["resultado"] | null) => void;
  ocupado: boolean; onFechar: () => void; onConferir: () => void; onReceber?: () => void;
}) {
  // abre a página de autenticidade do tribunal com o código já copiado
  const verificar = async (i: ItemConferido) => {
    if (i.codigo) { try { await navigator.clipboard.writeText(i.codigo); avisar(`Código ${i.codigo} copiado: cole no site, se ele pedir.`, "sucesso"); } catch { /* sem área de transferência */ } }
    if (i.linkVerificacao) window.open(i.linkVerificacao, "_blank", "noopener,noreferrer");
  };
  const c = p.conferencia;
  if (!c) return null;
  const quando = new Date(c.conferidoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/60 p-4" onClick={onFechar}>
      <div className="mt-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0F1B2D] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <ScanSearch className="h-5 w-5 text-sky-300" /> Conferência — {quemE(p)}
            </h3>
            <p className="text-xs text-[#94A3B8]">Conferido em {quando}. Triagem automática: na dúvida, abra o PDF.</p>
          </div>
          <button onClick={onFechar} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {c.gerais.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {c.gerais.map((g) => <li key={g} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{g}</li>)}
          </ul>
        )}

        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {c.itens.map((i) => {
            const ok = i.alertas.length === 0;
            return (
              <li key={i.ordem} className="flex gap-3 px-3 py-2.5">
                {ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-white">
                    {i.rotulo}
                    {i.porImagem && (
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-[#cbd5e1]"
                        title="O arquivo é foto, print ou escaneado: o texto foi lido da imagem (não é o PDF original do tribunal)">
                        lida da imagem
                      </span>
                    )}
                  </p>
                  {i.achou && (
                    <p className="text-xs text-[#94A3B8]">
                      {[i.emissao && `emitida em ${i.emissao}`, i.validade && `válida até ${i.validade}`].filter(Boolean).join(" · ") || "datas não lidas"}
                      {i.codigo && <> · código <span className="font-mono text-[#cbd5e1]">{i.codigo}</span></>}
                    </p>
                  )}
                  {i.alertas.map((a) => <p key={a} className="text-xs font-medium text-amber-200">⚠ {a}</p>)}
                  {i.achou && (() => {
                    const m = marcaDe(marcas, i);
                    const precisa = precisaSite(periodoId, p.efetivoId, i);
                    const quando = m ? new Date(m.em).toLocaleDateString("pt-BR") : "";
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {m ? (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.resultado === "autentica" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/20 text-red-200"}`}>
                              {m.resultado === "autentica" ? "✓ autêntica no site" : "✗ NÃO CONFERE no site"} · {m.por} · {quando}
                            </span>
                            <button onClick={() => onMarcar(i, null)} className="text-[11px] text-[#94A3B8] hover:text-white hover:underline">desfazer</button>
                          </>
                        ) : (
                          <>
                            {precisa && (
                              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                                {i.suspeita ? "🔎 suspeita: conferir no site" : "🔎 sorteada para conferir no site"}
                              </span>
                            )}
                            {i.linkVerificacao && (
                              <button onClick={() => verificar(i)}
                                className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 px-2 py-0.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10">
                                <ExternalLink className="h-3 w-3" /> Verificar no site
                              </button>
                            )}
                            <button onClick={() => onMarcar(i, "autentica")}
                              className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10">
                              ✓ Autêntica
                            </button>
                            <button onClick={() => onMarcar(i, "nao_confere")}
                              className="rounded-md border border-red-500/40 px-2 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/10">
                              ✗ Não confere
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {p.pdfUnificado && (
            <a href={`/api/promocoes/download?key=${encodeURIComponent(p.pdfUnificado)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-3 py-1.5 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#1a1205]">
              <Download className="h-4 w-4" /> Abrir PDF unificado
            </a>
          )}
          <button onClick={onConferir} disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#cbd5e1] transition hover:bg-white/5 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Conferir de novo
          </button>
          <div className="flex-1" />
          {onReceber && (
            <button onClick={onReceber}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700">
              <ClipboardCheck className="h-4 w-4" /> Confirmar recebimento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
