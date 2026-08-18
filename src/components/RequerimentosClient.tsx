"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Clock, CheckCircle2, XCircle, FileEdit, X, Search, ArrowDownUp,
  Settings, Trash2, Loader2, Check, Users,
} from "lucide-react";
import {
  MODALIDADES_COMUM,
  MODALIDADES_CURSOS,
  MODALIDADES_MATERIAL,
  modeloDaModalidade,
} from "@/lib/requerimentos";

type ModalidadeCustom = { id: string; nome: string; amparo: string };
type Edital = { sigla: string; nomeCompleto: string; numero: string; data: string };
type Editais = Record<string, Edital>;

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
  // Sem esta aba, o que o P/1 cria em lote como rascunho some da tela dele —
  // a aba inicial e "Pendentes", que so lista os enviados.
  { id: "rascunho", rotulo: "Rascunhos", status: ["rascunho"] },
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
  // o mesmo seletor de modalidade serve aos dois caminhos; `lote` diz qual
  const [lote, setLote] = useState(false);

  function abrirEscolha(emLote: boolean) {
    setLote(emLote);
    setEscolhendo(true);
  }

  // ---- modalidades personalizadas (cadastradas pelo admin na hora) ----
  const [custom, setCustom] = useState<ModalidadeCustom[]>([]);
  const [novaModalidade, setNovaModalidade] = useState(false);
  const [nomeNovaMod, setNomeNovaMod] = useState("");
  const [amparoNovaMod, setAmparoNovaMod] = useState("");
  const [salvandoMod, setSalvandoMod] = useState(false);
  const [msgMod, setMsgMod] = useState("");

  // ---- edital atual de cada curso (CAS/CFS/CFC) ----
  const [editais, setEditais] = useState<Editais | null>(null);
  const [editandoCurso, setEditandoCurso] = useState<string | null>(null);
  const [formEdital, setFormEdital] = useState<Edital>({ sigla: "", nomeCompleto: "", numero: "", data: "" });
  const [salvandoEdital, setSalvandoEdital] = useState(false);

  useEffect(() => {
    if (!escolhendo) return;
    fetch("/api/requerimentos/modalidades").then((r) => (r.ok ? r.json() : null))
      .then((d) => setCustom(Array.isArray(d?.modalidades) ? d.modalidades : [])).catch(() => {});
    fetch("/api/requerimentos/editais").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.editais) setEditais(d.editais); }).catch(() => {});
  }, [escolhendo]);

  async function salvarNovaModalidade() {
    const nome = nomeNovaMod.trim();
    if (!nome) return;
    setSalvandoMod(true); setMsgMod("");
    try {
      const r = await fetch("/api/requerimentos/modalidades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, amparo: amparoNovaMod.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgMod(d?.error || "Falha ao salvar."); return; }
      setCustom((l) => [...l, d.modalidade]);
      setNomeNovaMod(""); setAmparoNovaMod(""); setNovaModalidade(false);
    } catch { setMsgMod("Falha ao salvar."); }
    finally { setSalvandoMod(false); }
  }

  async function removerModalidade(id: string) {
    if (!confirm("Remover esta modalidade personalizada?")) return;
    try {
      const r = await fetch(`/api/requerimentos/modalidades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setCustom((l) => l.filter((m) => m.id !== id));
    } catch { alert("Falha ao remover."); }
  }

  function abrirEdicaoEdital(curso: string) {
    setEditandoCurso(curso);
    setFormEdital(editais?.[curso] || { sigla: curso, nomeCompleto: "", numero: "", data: "" });
  }

  async function salvarEdital() {
    if (!editandoCurso) return;
    setSalvandoEdital(true);
    try {
      const r = await fetch("/api/requerimentos/editais", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalidade: editandoCurso, ...formEdital }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d?.error || "Falha ao salvar o edital."); return; }
      setEditais(d.editais);
      setEditandoCurso(null);
    } catch { alert("Falha ao salvar o edital."); }
    finally { setSalvandoEdital(false); }
  }

  const abas = ehAdmin ? ABAS_ADMIN : ABAS_POLICIAL;
  const [aba, setAba] = useState<string>(abas[0].id);
  const [busca, setBusca] = useState("");
  const [filtroModalidade, setFiltroModalidade] = useState("");
  const [maisAntigos, setMaisAntigos] = useState<boolean>(ehAdmin); // admin: fila justa (antigos 1o)

  function novo(modalidade: string) {
    const modelo = modeloDaModalidade(modalidade);
    const q = new URLSearchParams({ modalidade, modelo });
    // Em lote, o requerimento e dos militares escolhidos no buscador, nao de
    // quem esta na tela — por isso a modalidade e a mesma, so muda o destino.
    if (lote) q.set("lote", "1");
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
        <div className="flex flex-wrap items-center gap-2">
          {temFicha && (
            <button
              onClick={() => abrirEscolha(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Novo requerimento
            </button>
          )}
          {ehAdmin && (
            <button
              onClick={() => abrirEscolha(true)}
              title="O mesmo requerimento para vários militares de uma vez, escolhidos no buscador"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 px-4 py-2 text-sm font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/10"
            >
              <Users className="h-4 w-4" /> Em lote (vários PMs)
            </button>
          )}
        </div>
      </div>

      {!temFicha && ehAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Seu usuário não está vinculado a uma ficha de efetivo, então não dá para criar
          requerimentos <b>próprios</b>. Pelo botão “Em lote” você continua criando para outros
          militares normalmente.
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
              <div>
                <h2 className="text-lg font-bold text-white">Escolha a modalidade</h2>
                {lote && (
                  <p className="text-xs text-[#94A3B8]">
                    Em lote — no passo seguinte você escolhe os militares no buscador.
                  </p>
                )}
              </div>
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
            <div className="mb-5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {MODALIDADES_CURSOS.filter((m) => m !== "OUTROS").map((m) => (
                <div key={m} className="flex items-stretch gap-1">
                  <button
                    onClick={() => novo(m)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-[#E8EEF6] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
                  >
                    {m}
                    {editais?.[m]?.numero && (
                      <span className="mt-0.5 block truncate text-[10px] text-[#94A3B8]">edital {editais[m].numero}</span>
                    )}
                  </button>
                  {ehAdmin && (
                    <button onClick={() => abrirEdicaoEdital(m)} title={`Editar edital do ${m}`}
                      className="rounded-lg border border-white/10 px-2 text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-[#D4AF37]">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* modalidades personalizadas: cadastradas pelo admin, caem no
                quadrinho OUTROS do formulario impresso */}
            {(custom.length > 0 || ehAdmin) && (
              <>
                <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                  Personalizadas
                  {ehAdmin && !novaModalidade && (
                    <button onClick={() => setNovaModalidade(true)} className="inline-flex items-center gap-1 normal-case text-[#94A3B8] hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> nova modalidade
                    </button>
                  )}
                </p>
                {custom.length > 0 && (
                  <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {custom.map((m) => (
                      <div key={m.id} className="flex items-stretch gap-1">
                        <button onClick={() => novo(m.nome)}
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-[#E8EEF6] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10">
                          {m.nome}
                        </button>
                        {ehAdmin && (
                          <button onClick={() => removerModalidade(m.id)} title="remover"
                            className="rounded-lg border border-white/10 px-2 text-[#94A3B8] transition hover:border-red-500/40 hover:text-red-300">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {novaModalidade && (
                  <div className="mb-3 rounded-lg border border-[#D4AF37]/30 bg-[#0b1626] p-3">
                    <p className="mb-2 text-[11px] text-[#94A3B8]">
                      Sem quadrinho próprio no papel — sai marcada em “OUTROS”, com este nome entre parênteses.
                    </p>
                    <input value={nomeNovaMod} onChange={(e) => setNomeNovaMod(e.target.value)}
                      placeholder="Nome da modalidade (ex: ALTERAÇÃO DE NOME DE GUERRA)"
                      className="mb-2 w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                    <textarea value={amparoNovaMod} onChange={(e) => setAmparoNovaMod(e.target.value)} rows={2}
                      placeholder="Amparo legal padrão (opcional — o requerente pode ajustar depois)"
                      className="mb-2 w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                    <div className="flex items-center gap-2">
                      <button onClick={salvarNovaModalidade} disabled={salvandoMod || !nomeNovaMod.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
                        {salvandoMod ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
                      </button>
                      <button onClick={() => { setNovaModalidade(false); setNomeNovaMod(""); setAmparoNovaMod(""); }}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] hover:text-white">
                        Cancelar
                      </button>
                      {msgMod && <span className="text-xs text-red-300">{msgMod}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* editor do edital de um curso (CAS/CFS/CFC) */}
      {editandoCurso && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="ui-card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edital do {editandoCurso}</h2>
              <button onClick={() => setEditandoCurso(null)} className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/5 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-[#94A3B8]">
              Atualize aqui sempre que sair um edital novo. Todo requerimento criado a partir de agora já
              nasce com este texto — os já enviados não mudam.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sigla (aparece como “OUTROS (INSCRIÇÃO NO ... PM)”)</label>
                <input value={formEdital.sigla} onChange={(e) => setFormEdital((f) => ({ ...f, sigla: e.target.value }))}
                  placeholder="Ex: CEFS"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Nome completo do curso</label>
                <input value={formEdital.nomeCompleto} onChange={(e) => setFormEdital((f) => ({ ...f, nomeCompleto: e.target.value }))}
                  placeholder="Ex: CURSO ESPECIAL DE FORMAÇÃO DE SARGENTOS (CEFS)"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Nº do edital</label>
                  <input value={formEdital.numero} onChange={(e) => setFormEdital((f) => ({ ...f, numero: e.target.value }))}
                    placeholder="Ex: 002/2025-DE"
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Data do edital</label>
                  <input value={formEdital.data} onChange={(e) => setFormEdital((f) => ({ ...f, data: e.target.value }))}
                    placeholder="Ex: 04/04/2025"
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={salvarEdital} disabled={salvandoEdital}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
                {salvandoEdital ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar edital
              </button>
              <button onClick={() => setEditandoCurso(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
