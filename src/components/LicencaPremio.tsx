"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Users,
  X,
  Loader2,
  Calendar,
  CalendarDays,
  UserPlus,
  Trash2,
} from "lucide-react";

export type MembroEquipeLicenca = {
  membroId: string;
  efetivoId: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  quadro: string | null;
  ehOficial: boolean;
};

export type EquipeLicencaView = {
  numeroEquipe: string;
  inicioBR: string;
  fimBR: string;
  status: { chave: string; rotulo: string; detalhe: string; cor: string };
  emLicencaHoje: boolean;
  noMes: boolean;
  membros: MembroEquipeLicenca[];
};

// militar do efetivo, para o autocomplete de "Adicionar militar"
type Militar = {
  id: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
};

type Filtro = "todos" | "oficiais" | "pracas";

function brParaISO(br: string): string {
  if (!br || br === "—") return "";
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function isoParaBR(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
// soma meses a uma data ISO (aaaa-mm-dd) — regra oficial da Licença-Prêmio
// e "3 (tres) meses", nao 90 dias corridos.
function somarMesesISO(iso: string, meses: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1 + meses, +m[3]);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function nomeMilitar(m: Militar): string {
  const posto = (m.postoGrad || "").trim();
  const barra = (m.numeroBarra || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", guerra].filter(Boolean).join(" ").trim();
}

export default function LicencaPremio({
  anos,
  anoSelecionado,
  equipes,
  totalMilitares,
  totalOficiais,
  totalPracas,
  idsJaAlocados,
  isAdmin,
  onTrocarAno,
  onAtualizar,
}: {
  anos: string[];
  anoSelecionado: string;
  equipes: EquipeLicencaView[];
  totalMilitares: number;
  totalOficiais: number;
  totalPracas: number;
  idsJaAlocados: string[];
  isAdmin: boolean;
  onTrocarAno: (ano: string) => void;
  onAtualizar: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<EquipeLicencaView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ---- edicao de datas ----
  const [editando, setEditando] = useState<EquipeLicencaView | null>(null);
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");
  const [fimEditadoManual, setFimEditadoManual] = useState(false);
  const [salvandoDatas, setSalvandoDatas] = useState(false);
  const [erroDatas, setErroDatas] = useState<string | null>(null);

  // ---- adicionar militar ----
  const [modalAdicionar, setModalAdicionar] = useState<EquipeLicencaView | null>(null);
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/efetivo")
      .then((r) => r.json())
      .then((d) => setEfetivo(d.efetivo || []))
      .catch(() => {});
  }, [isAdmin]);

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  // Mantem o modal "Ver detalhes" sincronizado com dados novos (apos
  // adicionar/remover militar, o router.refresh() traz um `equipes` novo,
  // mas o `aberta` ficaria "congelado" com a foto antiga sem isto).
  useEffect(() => {
    if (!aberta) return;
    const atualizada = equipes.find((e) => e.numeroEquipe === aberta.numeroEquipe);
    if (atualizada) setAberta(atualizada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipes]);

  function abrirEditar(e: EquipeLicencaView) {
    setFInicio(brParaISO(e.inicioBR));
    setFFim(brParaISO(e.fimBR));
    setFimEditadoManual(false);
    setErroDatas(null);
    setEditando(e);
  }

  function mudarInicio(v: string) {
    setFInicio(v);
    // recalcula o fim automaticamente, a menos que o usuario ja tenha
    // editado o fim manualmente nesta sessao do modal.
    if (!fimEditadoManual && v) {
      setFFim(somarMesesISO(v, 3));
    }
  }
  function mudarFim(v: string) {
    setFFim(v);
    setFimEditadoManual(true);
  }

  async function salvarDatas() {
    if (!editando) return;
    setErroDatas(null);
    setSalvandoDatas(true);
    try {
      const res = await fetch("/api/licenca-premio/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroEquipe: editando.numeroEquipe,
          anoGozo: anoSelecionado,
          periodoInicio: fInicio,
          periodoFim: fFim,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErroDatas(d.erro || "Falha ao salvar."); return; }
      setEditando(null);
      onAtualizar();
    } catch {
      setErroDatas("Erro de conexão.");
    } finally {
      setSalvandoDatas(false);
    }
  }

  async function removerMembro(membroId: string) {
    if (!confirm("Remover este militar da equipe de Licença-Prêmio?")) return;
    try {
      const res = await fetch("/api/licenca-premio/membros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membroId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { aviso(d.erro || "Falha ao remover."); return; }
      aviso("Militar removido.");
      onAtualizar();
    } catch {
      aviso("Erro de conexão.");
    }
  }

  async function adicionarMilitar(m: Militar) {
    if (!modalAdicionar) return;
    setAdicionando(true);
    try {
      const res = await fetch("/api/licenca-premio/membros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          efetivoId: m.id,
          numeroEquipe: modalAdicionar.numeroEquipe,
          anoGozo: anoSelecionado,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { aviso(d.erro || "Falha ao adicionar."); return; }
      aviso("Militar adicionado.");
      setModalAdicionar(null);
      setBusca("");
      onAtualizar();
    } catch {
      aviso("Erro de conexão.");
    } finally {
      setAdicionando(false);
    }
  }

  function filtrarMembros(membros: MembroEquipeLicenca[]) {
    if (filtro === "oficiais") return membros.filter((m) => m.ehOficial);
    if (filtro === "pracas") return membros.filter((m) => !m.ehOficial);
    return membros;
  }

  const jaAlocadosSet = useMemo(() => new Set(idsJaAlocados), [idsJaAlocados]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return efetivo
      .filter((m) => !jaAlocadosSet.has(m.id))
      .filter((m) => {
        const alvo = `${m.nome} ${m.nomeGuerra} ${m.matricula} ${m.numeroBarra} ${m.postoGrad}`.toLowerCase();
        return alvo.includes(q);
      })
      .slice(0, 8);
  }, [busca, efetivo, jaAlocadosSet]);

  const cartoes = useMemo(() => {
    const comMilitares = equipes.filter((e) => e.membros.length > 0).length;
    const emLicencaHoje = equipes
      .filter((e) => e.emLicencaHoje)
      .reduce((acc, e) => acc + e.membros.length, 0);
    const equipesEmLicenca = equipes.filter((e) => e.emLicencaHoje).map((e) => e.numeroEquipe);
    const equipesMes = equipes.filter((e) => e.noMes).length;
    return { comMilitares, emLicencaHoje, equipesEmLicenca, equipesMes };
  }, [equipes]);

  const Aba = ({ id, rotulo, qtd }: { id: Filtro; rotulo: string; qtd: number }) => (
    <button
      onClick={() => setFiltro(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        filtro === id
          ? "bg-[#D4AF37] text-[#1a1205]"
          : "bg-[#0F1B2D] text-[#94A3B8] ring-1 ring-white/10 hover:text-white"
      }`}
    >
      {rotulo}
      <span className={`rounded-full px-1.5 text-xs ${filtro === id ? "bg-black/15" : "bg-white/10 text-[#94A3B8]"}`}>
        {qtd}
      </span>
    </button>
  );

  function imprimir() {
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const blocos = equipes.map((e) => {
      const linhas = e.membros.map((m, i) =>
        `<tr>${[i + 1, m.postoGrad, m.numeroBarra, m.nome, m.nomeGuerra, m.matricula].map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`
      ).join("");
      const periodo = e.inicioBR && e.fimBR ? `${e.inicioBR} a ${e.fimBR}` : "sem datas";
      return `
        <h2>EQUIPE ${esc(e.numeroEquipe)} <span class="per">Período (3 meses): ${esc(periodo)}${e.status?.rotulo ? " · " + esc(e.status.rotulo) : ""}</span> <span class="qtd">${e.membros.length} militar(es)</span></h2>
        ${e.membros.length
          ? `<table><thead><tr><th>#</th><th>Posto/Grad</th><th>Nº/Barra</th><th>Nome</th><th>Nome de Guerra</th><th>Matrícula</th></tr></thead><tbody>${linhas}</tbody></table>`
          : `<p class="vazio">Sem militares nesta equipe.</p>`}`;
    }).join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Plano de Licença-Prêmio ${esc(anoSelecionado)} - 18 BPM</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0b1f3a;padding:20px;}
        .cab{text-align:center;border-bottom:2px solid #0b1f3a;padding-bottom:8px;margin-bottom:14px;}
        .cab h1{font-size:15px;margin:0;text-transform:uppercase;} .cab p{font-size:10px;margin:1px 0;color:#333;}
        .sub{font-size:11px;color:#555;margin:0 0 14px;}
        h2{font-size:12px;background:#0b1f3a;color:#fff;padding:5px 8px;margin:14px 0 0;border-radius:3px 3px 0 0;}
        h2 .per{font-weight:normal;font-size:10px;opacity:.9;} h2 .qtd{float:right;font-weight:normal;font-size:10px;opacity:.85;}
        table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:8px;} th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;} th{background:#e9edf3;}
        tr:nth-child(even) td{background:#f6f8fb;} .vazio{font-size:10px;color:#888;padding:6px;}
        h2,table{break-inside:avoid;}
        @media print{ @page{ size:portrait; margin:12mm; } }
      </style></head><body>
      <div class="cab"><h1>18º Batalhão de Polícia Militar</h1><p>Estado do Maranhão · SSP · PMMA · CPA I/2</p><p>Presidente Dutra - MA</p></div>
      <p class="sub"><strong>Plano de Licença-Prêmio ${esc(anoSelecionado)}</strong> — emitido em ${dataStr} · ${totalMilitares} militares</p>
      ${blocos}
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div className="space-y-5">
      {/* toast fixo — sempre visivel, mesmo com modal aberto por cima */}
      {msg && (
        <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-lg border border-emerald-800 bg-emerald-950 px-4 py-2 text-sm text-emerald-300 shadow-xl">
          {msg}
        </div>
      )}

      {/* topo */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[#94A3B8]">Ano</label>
        <select
          value={anoSelecionado}
          onChange={(e) => onTrocarAno(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm font-medium text-white outline-none focus:border-[#D4AF37]/50"
        >
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={imprimir}
          title="Imprimir o plano de Licença-Prêmio (equipes, períodos e militares)"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-medium text-[#1a1205] transition hover:brightness-110"
        >
          🖨 Imprimir / PDF
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Aba id="todos" rotulo="Todos" qtd={totalMilitares} />
          <Aba id="oficiais" rotulo="Oficiais" qtd={totalOficiais} />
          <Aba id="pracas" rotulo="Praças" qtd={totalPracas} />
        </div>
      </div>

      {/* cartões de resumo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="ui-card p-4">
          <Users className="mb-1 h-5 w-5 text-[#D4AF37]" />
          <p className="text-2xl font-bold text-white">{cartoes.comMilitares}</p>
          <p className="text-xs text-[#94A3B8]">Equipes com militares</p>
        </div>
        <div className="ui-card p-4">
          <Award className="mb-1 h-5 w-5 text-amber-400" />
          <p className="text-2xl font-bold text-white">{cartoes.emLicencaHoje}</p>
          <p className="text-xs text-[#94A3B8]">
            Em licença hoje
            {cartoes.equipesEmLicenca.length > 0 && ` · Equipe(s) ${cartoes.equipesEmLicenca.join(", ")}`}
          </p>
        </div>
        <div className="ui-card p-4">
          <CalendarDays className="mb-1 h-5 w-5 text-emerald-400" />
          <p className="text-2xl font-bold text-white">{cartoes.equipesMes}</p>
          <p className="text-xs text-[#94A3B8]">Equipes do mês</p>
        </div>
        <div className="ui-card p-4">
          <Award className="mb-1 h-5 w-5 text-[#D4AF37]" />
          <p className="text-2xl font-bold text-white">{totalMilitares}</p>
          <p className="text-xs text-[#94A3B8]">Total no plano</p>
        </div>
      </div>

      {/* cartões das 4 equipes */}
      <div className="space-y-3">
        {equipes.map((e) => {
          const membrosFiltrados = filtrarMembros(e.membros);
          return (
            <div key={e.numeroEquipe} className="ui-card p-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                  e.status.chave === "em_licenca" ? "bg-[#D4AF37] text-[#1a1205]" : "bg-white/10 text-white"
                }`}>
                  {e.numeroEquipe}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-bold text-white">EQUIPE {e.numeroEquipe}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.status.cor}`}>
                      {e.status.rotulo}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    <span className="font-semibold text-white/80">Período (3 meses): </span>
                    {e.inicioBR} → {e.fimBR}
                  </p>
                  {e.status.detalhe && (
                    <p className="mt-0.5 text-xs text-[#94A3B8]/70">{e.status.detalhe}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-2xl font-bold text-white">{membrosFiltrados.length}</p>
                  <p className="text-[11px] text-[#94A3B8]">militares</p>
                  <div className="mt-1 flex gap-1.5">
                    {isAdmin && (
                      <button
                        onClick={() => abrirEditar(e)}
                        title="Editar datas"
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 px-2.5 py-1 text-xs text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#1a1205]"
                      >
                        <Calendar className="h-3.5 w-3.5" /> Datas
                      </button>
                    )}
                    <button
                      onClick={() => setAberta(e)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
                    >
                      Ver detalhes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== MODAL EDITAR DATAS ===== */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#D4AF37]" />
                <h3 className="font-bold text-white">Editar datas — Equipe {editando.numeroEquipe}</h3>
              </div>
              <button onClick={() => setEditando(null)} className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">
                  Início <span className="text-red-400">*</span>
                  {fInicio && <span className="ml-1 text-[#D4AF37]">({isoParaBR(fInicio)})</span>}
                </label>
                <input
                  type="date"
                  value={fInicio}
                  onChange={(e) => mudarInicio(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">
                  Fim (calculado automaticamente: início + 3 meses — pode editar)
                  {fFim && <span className="ml-1 text-[#D4AF37]">({isoParaBR(fFim)})</span>}
                </label>
                <input
                  type="date"
                  value={fFim}
                  onChange={(e) => mudarFim(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                />
              </div>

              {erroDatas && (
                <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
                  {erroDatas}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setEditando(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarDatas}
                  disabled={!fInicio || !fFim || salvandoDatas}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60"
                >
                  {salvandoDatas && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar datas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL DETALHES ===== */}
      {aberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
          <div className="mt-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-[#D4AF37]" />
                <h3 className="font-bold">
                  EQUIPE {aberta.numeroEquipe} · {filtrarMembros(aberta.membros).length} militares
                </h3>
              </div>
              <button onClick={() => setAberta(null)} aria-label="Fechar" className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
                <p className="text-sm text-white">
                  <span className="font-semibold">Período:</span> {aberta.inicioBR} → {aberta.fimBR}
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setModalAdicionar(aberta)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Adicionar militar
                  </button>
                )}
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-[#0F1B2D]">
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-[#94A3B8]">
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Posto/Grad</th>
                      <th className="px-3 py-2 font-semibold">Nº/Barra</th>
                      <th className="px-3 py-2 font-semibold">Nome</th>
                      <th className="px-3 py-2 font-semibold">Matrícula</th>
                      {isAdmin && <th className="px-3 py-2 font-semibold">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtrarMembros(aberta.membros).map((m, i) => (
                      <tr key={m.membroId} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-[#94A3B8]">{i + 1}º</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.postoGrad ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.numeroBarra ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-white">{m.nome ?? "—"}</span>
                          {m.nomeGuerra && <span className="ml-1 text-xs text-[#94A3B8]">({m.nomeGuerra})</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.matricula ?? "—"}</td>
                        {isAdmin && (
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              onClick={() => removerMembro(m.membroId)}
                              className="inline-flex items-center gap-1 rounded border border-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-950/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remover
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filtrarMembros(aberta.membros).length === 0 && (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="px-3 py-8 text-center text-[#94A3B8]">
                          Nenhum militar nesta equipe com o filtro atual.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setAberta(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL ADICIONAR MILITAR ===== */}
      {modalAdicionar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4">
              <h3 className="font-bold text-white">Adicionar à Equipe {modalAdicionar.numeroEquipe}</h3>
              <button onClick={() => { setModalAdicionar(null); setBusca(""); }} className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, nome de guerra ou matrícula..."
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
              />
              {busca.trim().length >= 2 && (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
                  {filtrados.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-[#94A3B8]">
                      Nenhum militar encontrado (ou já alocado em outra equipe este ano).
                    </div>
                  ) : (
                    filtrados.map((m) => (
                      <button
                        key={m.id}
                        disabled={adicionando}
                        onClick={() => adicionarMilitar(m)}
                        className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-white/5 disabled:opacity-50"
                      >
                        <span>{nomeMilitar(m)}</span>
                        {m.matricula && <span className="text-xs text-[#94A3B8]">Mat. {m.matricula}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => { setModalAdicionar(null); setBusca(""); }}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
