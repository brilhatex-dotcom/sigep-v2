"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Palmtree,
  Plane,
  CalendarDays,
  Users,
  X,
  FileText,
  Pencil,
  Loader2,
  Calendar,
} from "lucide-react";
import MemorandoFerias, { DadosMemorando } from "@/components/MemorandoFerias";

export type MembroEquipe = {
  efetivoId: string;
  ordem: number;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  quadro: string | null;
  ehOficial: boolean;
};

export type EquipeView = {
  numeroEquipe: string;
  periodos: {
    rotulo: string;
    inicioBR: string;
    fimBR: string;
    apres: string | null;
  }[];
  status: { chave: string; rotulo: string; detalhe: string; cor: string };
  emFeriasHoje: boolean;
  noMes: boolean;
  membros: MembroEquipe[];
};

type Filtro = "todos" | "oficiais" | "pracas";

// Converte "dd/mm/aaaa" ou "—" para "aaaa-mm-dd" (input date)
function brParaISO(br: string): string {
  if (!br || br === "—") return "";
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Converte "aaaa-mm-dd" para "dd/mm/aaaa"
function isoParaBR(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Calcula data de apresentação (dia seguinte ao fim)
function calcApres(fim: string): string {
  if (!fim) return "";
  const d = new Date(fim + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

type FormDatas = {
  p1Inicio: string; p1Fim: string; p1Apres: string;
  p2Inicio: string; p2Fim: string; p2Apres: string;
  usarP2: boolean;
};

export default function PlanoFerias({
  anos,
  anoSelecionado,
  equipes,
  totalMilitares,
  totalOficiais,
  totalPracas,
  isAdmin,
  onTrocarAno,
}: {
  anos: string[];
  anoSelecionado: string;
  equipes: EquipeView[];
  totalMilitares: number;
  totalOficiais: number;
  totalPracas: number;
  isAdmin: boolean;
  onTrocarAno: (ano: string) => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<EquipeView | null>(null);
  const [permuta, setPermuta] = useState<MembroEquipe | null>(null);
  const [novaEquipe, setNovaEquipe] = useState("");
  const [salvandoPermuta, setSalvandoPermuta] = useState(false);
  const [memorando, setMemorando] = useState<DadosMemorando | null>(null);

  // --- edição de datas ---
  const [editando, setEditando] = useState<EquipeView | null>(null);
  const [form, setForm] = useState<FormDatas>({
    p1Inicio: "", p1Fim: "", p1Apres: "",
    p2Inicio: "", p2Fim: "", p2Apres: "",
    usarP2: false,
  });
  const [salvandoDatas, setSalvandoDatas] = useState(false);
  const [erroDatas, setErroDatas] = useState<string | null>(null);

  function abrirEditar(e: EquipeView) {
    const p1 = e.periodos[0];
    const p2 = e.periodos[1];
    setForm({
      p1Inicio: brParaISO(p1?.inicioBR ?? ""),
      p1Fim:    brParaISO(p1?.fimBR ?? ""),
      p1Apres:  brParaISO(p1?.apres ?? ""),
      p2Inicio: brParaISO(p2?.inicioBR ?? ""),
      p2Fim:    brParaISO(p2?.fimBR ?? ""),
      p2Apres:  brParaISO(p2?.apres ?? ""),
      usarP2:   !!p2,
    });
    setErroDatas(null);
    setEditando(e);
  }

  function setF(campo: keyof FormDatas, val: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [campo]: val };
      // auto-preenche apresentação quando o fim muda
      if (campo === "p1Fim" && typeof val === "string") {
        next.p1Apres = calcApres(val);
      }
      if (campo === "p2Fim" && typeof val === "string") {
        next.p2Apres = calcApres(val);
      }
      return next;
    });
  }

  async function salvarDatas() {
    if (!editando) return;
    setErroDatas(null);
    setSalvandoDatas(true);
    try {
      const body: Record<string, string> = {
        numeroEquipe: editando.numeroEquipe,
        anoGozo: anoSelecionado,
        p1Inicio: form.p1Inicio,
        p1Fim: form.p1Fim,
        p1Apres: form.p1Apres,
      };
      if (form.usarP2 && form.p2Inicio && form.p2Fim) {
        body.p2Inicio = form.p2Inicio;
        body.p2Fim = form.p2Fim;
        body.p2Apres = form.p2Apres;
      }
      const res = await fetch("/api/ferias/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErroDatas(d.erro || "Falha ao salvar."); return; }
      setEditando(null);
      router.refresh();
    } catch {
      setErroDatas("Erro de conexão.");
    } finally {
      setSalvandoDatas(false);
    }
  }

  async function confirmarPermuta() {
    if (!permuta || !novaEquipe) return;
    setSalvandoPermuta(true);
    try {
      const res = await fetch("/api/ferias/permuta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          efetivoId: permuta.efetivoId,
          anoGozo: anoSelecionado,
          novaEquipe,
        }),
      });
      setSalvandoPermuta(false);
      if (res.ok) {
        setPermuta(null);
        setNovaEquipe("");
        setAberta(null);
        router.refresh();
      }
    } catch {
      setSalvandoPermuta(false);
    }
  }

  function abrirMemorando(m: MembroEquipe, e: EquipeView, ordemMembro: number) {
    const p = e.periodos[0];
    setMemorando({
      numero: String(ordemMembro).padStart(3, "0"),
      postoGrad: m.postoGrad ?? "",
      numeroBarra: m.numeroBarra ?? "",
      nome: m.nome ?? "",
      quadro: m.quadro ?? "",
      ehOficial: m.ehOficial,
      inicioBR: p?.inicioBR ?? "",
      apresentacaoBR: p?.apres ?? p?.fimBR ?? "",
      diasFerias: 35,
    });
  }

  function filtrarMembros(membros: MembroEquipe[]) {
    if (filtro === "oficiais") return membros.filter((m) => m.ehOficial);
    if (filtro === "pracas") return membros.filter((m) => !m.ehOficial);
    return membros;
  }

  const cartoes = useMemo(() => {
    const comMilitares = equipes.filter((e) => e.membros.length > 0).length;
    const emFeriasHoje = equipes
      .filter((e) => e.emFeriasHoje)
      .reduce((acc, e) => acc + e.membros.length, 0);
    const equipesEmFerias = equipes.filter((e) => e.emFeriasHoje).map((e) => e.numeroEquipe);
    const equipesMes = equipes.filter((e) => e.noMes).length;
    return { comMilitares, emFeriasHoje, equipesEmFerias, equipesMes };
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

  const InputData = ({
    label, value, onChange, required,
  }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-[#94A3B8]">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
        {value && <span className="ml-1 text-[#D4AF37]">({isoParaBR(value)})</span>}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[#94A3B8]">Ano de gozo</label>
        <select
          value={anoSelecionado}
          onChange={(e) => onTrocarAno(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm font-medium text-white outline-none focus:border-[#D4AF37]/50"
        >
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
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
          <Plane className="mb-1 h-5 w-5 text-amber-400" />
          <p className="text-2xl font-bold text-white">{cartoes.emFeriasHoje}</p>
          <p className="text-xs text-[#94A3B8]">
            Em férias hoje
            {cartoes.equipesEmFerias.length > 0 && ` · Equipe(s) ${cartoes.equipesEmFerias.join(", ")}`}
          </p>
        </div>
        <div className="ui-card p-4">
          <CalendarDays className="mb-1 h-5 w-5 text-emerald-400" />
          <p className="text-2xl font-bold text-white">{cartoes.equipesMes}</p>
          <p className="text-xs text-[#94A3B8]">Equipes do mês</p>
        </div>
        <div className="ui-card p-4">
          <Palmtree className="mb-1 h-5 w-5 text-[#D4AF37]" />
          <p className="text-2xl font-bold text-white">{totalMilitares}</p>
          <p className="text-xs text-[#94A3B8]">Total no plano</p>
        </div>
      </div>

      {/* cartões das equipes */}
      <div className="space-y-3">
        {equipes.map((e) => {
          const membrosFiltrados = filtrarMembros(e.membros);
          return (
            <div key={e.numeroEquipe} className="ui-card p-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                  e.status.chave === "em_ferias" ? "bg-[#D4AF37] text-[#1a1205]" : "bg-white/10 text-white"
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
                  {e.periodos.map((p, idx) => (
                    <p key={idx} className="text-xs text-[#94A3B8]">
                      {e.periodos.length > 1
                        ? <span className="font-semibold text-white/80">{p.rotulo}: </span>
                        : <span className="font-semibold text-white/80">Período: </span>}
                      {p.inicioBR} → {p.fimBR}
                      {p.apres && p.apres.trim() && ` · Apres.: ${p.apres}`}
                    </p>
                  ))}
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
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#D4AF37]" />
                <h3 className="font-bold text-white">Editar datas — Equipe {editando.numeroEquipe}</h3>
              </div>
              <button onClick={() => setEditando(null)} className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Período 1 */}
              <div>
                <p className="mb-3 text-sm font-semibold text-white">1º Período</p>
                <div className="grid grid-cols-3 gap-3">
                  <InputData label="Início" value={form.p1Inicio} onChange={(v) => setF("p1Inicio", v)} required />
                  <InputData label="Fim" value={form.p1Fim} onChange={(v) => setF("p1Fim", v)} required />
                  <InputData label="Apresentação" value={form.p1Apres} onChange={(v) => setF("p1Apres", v)} required />
                </div>
              </div>

              {/* Toggle período 2 */}
              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#94A3B8]">
                  <input
                    type="checkbox"
                    checked={form.usarP2}
                    onChange={(e) => setF("usarP2", e.target.checked)}
                    className="h-4 w-4 accent-[#D4AF37]"
                  />
                  Usar 2º período (sustação / São João / etc.)
                </label>
              </div>

              {/* Período 2 */}
              {form.usarP2 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-white">2º Período</p>
                  <div className="grid grid-cols-3 gap-3">
                    <InputData label="Início" value={form.p2Inicio} onChange={(v) => setF("p2Inicio", v)} />
                    <InputData label="Fim" value={form.p2Fim} onChange={(v) => setF("p2Fim", v)} />
                    <InputData label="Apresentação" value={form.p2Apres} onChange={(v) => setF("p2Apres", v)} />
                  </div>
                </div>
              )}

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
                  disabled={!form.p1Inicio || !form.p1Fim || !form.p1Apres || salvandoDatas}
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

      {/* modal de detalhes */}
      {aberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
          <div className="mt-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Palmtree className="h-5 w-5 text-[#D4AF37]" />
                <h3 className="font-bold">
                  EQUIPE {aberta.numeroEquipe} · {filtrarMembros(aberta.membros).length} militares
                </h3>
              </div>
              <button onClick={() => setAberta(null)} aria-label="Fechar" className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 rounded-lg bg-white/5 p-3">
                {aberta.periodos.map((p, i) => (
                  <p key={i} className="text-sm text-white">
                    <span className="font-semibold">
                      {aberta.periodos.length > 1 ? p.rotulo : "Período"}:
                    </span>{" "}
                    {p.inicioBR} → {p.fimBR}
                    {p.apres && p.apres.trim() && (
                      <span className="text-[#94A3B8]"> · Apres.: {p.apres}</span>
                    )}
                  </p>
                ))}
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
                      <tr key={m.efetivoId} className="hover:bg-white/5">
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
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => abrirMemorando(m, aberta, i + 1)}
                                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#94A3B8] hover:border-white/30 hover:text-white"
                              >
                                <FileText className="h-3.5 w-3.5" /> Memorando
                              </button>
                              <button
                                onClick={() => { setPermuta(m); setNovaEquipe(""); }}
                                className="inline-flex items-center gap-1 rounded border border-[#D4AF37]/30 px-2 py-1 text-xs text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#1a1205]"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Editar
                              </button>
                            </div>
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

      {/* modal de permuta */}
      {permuta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1B2D] shadow-xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-5 py-4 text-white">
              <h3 className="font-bold">Editar Férias do Militar</h3>
              <button onClick={() => setPermuta(null)} aria-label="Fechar" className="text-[#94A3B8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4 rounded-lg bg-white/5 p-3 text-sm">
                <p className="font-semibold text-white">{permuta.nome}</p>
                <p className="text-[#94A3B8]">Matrícula {permuta.matricula ?? "—"}</p>
              </div>
              <label className="mb-1 block text-sm font-medium text-white">Trocar para a equipe</label>
              <select
                value={novaEquipe}
                onChange={(e) => setNovaEquipe(e.target.value)}
                className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
              >
                <option value="">Selecione a nova equipe</option>
                {equipes.map((eq) => (
                  <option key={eq.numeroEquipe} value={eq.numeroEquipe}>
                    Equipe {eq.numeroEquipe}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPermuta(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarPermuta}
                  disabled={!novaEquipe || salvandoPermuta}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60"
                >
                  {salvandoPermuta && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar alteração
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* memorando */}
      {memorando && (
        <MemorandoFerias
          dados={memorando}
          ano={anoSelecionado}
          onFechar={() => setMemorando(null)}
        />
      )}
    </div>
  );
}
