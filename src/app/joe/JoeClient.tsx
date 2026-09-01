"use client";

import { useEffect, useMemo, useState } from "react";
import { joeNoPeriodo, type AutorizacaoJoe, type SaldoJoe } from "@/lib/joeSaldo";

/* =========================================================================
   SIGEP-18BPM · JOE — Jornada Operacional Extraordinaria.
   ADMIN (P1): abre JOE, aprova/recusa candidatos, e AGORA pode inscrever
   manualmente militares do 18 (autocomplete) ou de fora (dados manuais),
   ja como aprovados.
   POLICIAL: ve os JOE abertos, candidata-se e acompanha o status.
   ========================================================================= */

type Ficha = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
};
type Candidato = {
  id: string;
  efetivoId: string | null;
  status: "pendente" | "aprovado" | "recusado";
  inscritoEm: string;
  origem?: string;
  ficha: Ficha | null;
  extNome?: string | null;
  extMatricula?: string | null;
  extPostoGrad?: string | null;
  extUnidade?: string | null;
};
type Joe = {
  id: string;
  evento: string;
  local: string | null;
  data: string;
  horaInicio: string;
  horaFim: string;
  vagas: number;
  valor: number;
  observacao: string | null;
  status: "aberta" | "encerrada";
  horario?: string | null;
  comandanteOp?: string | null;
  areaAtuacao?: string | null;
  processoSei?: string | null;
  totalCandidatos: number;
  totalAprovados: number;
  vagasRestantes: number;
  minhaInscricao: { id: string; status: string } | null;
  candidatos?: Candidato[];
};

// militar do efetivo, para o autocomplete
type Militar = {
  id: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
};

function nomeCurto(f: Ficha | null, fallbackId: string): string {
  if (!f) return "ID " + fallbackId;
  const posto = (f.postoGrad || "").trim();
  const barra = (f.numeroBarra || "").trim();
  const guerra = (f.nomeGuerra || f.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", cap].filter(Boolean).join(" ").trim() || ("ID " + fallbackId);
}

// nome de um candidato (do 18 OU externo)
function nomeCandidato(c: Candidato): string {
  if (c.efetivoId) return nomeCurto(c.ficha, c.efetivoId);
  const posto = (c.extPostoGrad || "").trim();
  const nome = (c.extNome || "").trim();
  const unid = (c.extUnidade || "").trim();
  const base = [posto, nome].filter(Boolean).join(" ").trim() || "Militar externo";
  return unid ? `${base} (${unid})` : base;
}

// nome para o autocomplete
function nomeMilitar(m: Militar): string {
  const posto = (m.postoGrad || "").trim();
  const barra = (m.numeroBarra || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  const temBarra = /\d/.test(barra);
  return [posto, temBarra ? "nº " + barra : "", cap].filter(Boolean).join(" ").trim();
}

// mascara de dinheiro: guarda os centavos como digitos ("1960000" = R$ 19.600,00)
// pra nao depender de "." vs "," na hora de digitar — ambiguidade que fazia
// "19.600" (dezenove mil e seiscentos) ser lido como 19,6 por um <input type=number>.
function centavosParaReaisStr(centavos: string): string {
  const n = Number(centavos || "0") / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function reaisParaCentavosStr(valor: number): string {
  return String(Math.round((valor || 0) * 100));
}
function CampoReais({ centavos, onChange }: { centavos: string; onChange: (c: string) => void }) {
  return (
    <div className="campo-reais">
      <span className="campo-reais-pref">R$</span>
      <input
        inputMode="numeric"
        value={centavosParaReaisStr(centavos)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
      />
    </div>
  );
}

function brData(iso: string): string {
  if (!iso || iso.length < 10) return iso || "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function reais(v: number): string {
  return "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function diaSemana(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const g = new Date(y, m - 1, d).getDay();
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][g];
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// extrai ano/mes de uma data "aaaa-mm-dd"; null se invalida
function anoMes(iso: string): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return null;
  return { ano: +m[1], mes: +m[2] };
}

// ordena os cards de um mes: abertos primeiro, depois por data
function ordenarCards(joes: Joe[]): Joe[] {
  return [...joes].sort(
    (a, b) =>
      (a.status === "aberta" ? 0 : 1) - (b.status === "aberta" ? 0 : 1) ||
      a.data.localeCompare(b.data)
  );
}

export default function JoeClient({ perfil }: { perfil: string }) {
  const ehAdmin = useMemo(() => {
    const p = (perfil || "").toLowerCase();
    return p !== "" && p !== "policial";
  }, [perfil]);

  const [lista, setLista] = useState<Joe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // efetivo (para autocomplete da inscricao manual) - carregado so 1x se admin
  const [efetivo, setEfetivo] = useState<Militar[]>([]);

  // modal de inscricao manual: guarda o id do JOE alvo (ou null = fechado)
  const [modalJoe, setModalJoe] = useState<string | null>(null);
  // modal do saldo de JOE (cota autorizada por despacho do CPA/I-2)
  const [modalSaldo, setModalSaldo] = useState(false);

  // acordeao por mes/ano: guarda as chaves expandidas. Comeca com o mes atual aberto.
  const [expandido, setExpandido] = useState<Set<string>>(() => {
    const h = new Date();
    return new Set([`${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`]);
  });
  const toggle = (k: string) =>
    setExpandido((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const vazio = {
    evento: "", local: "", data: "", horaInicio: "", horaFim: "", vagas: "1", valor: "", observacao: "",
    comandanteOp: "", horario: "", areaAtuacao: "", processoSei: "",
  };
  const [form, setForm] = useState({ ...vazio });
  const [criando, setCriando] = useState(false);

  // despachos cadastrados: so pra sugerir o valor por vaga certo ao abrir um
  // JOE cuja data cai dentro do periodo de algum despacho (evita usar o valor
  // errado — ex.: 250 de um despacho antigo num JOE que devia ser 350).
  const [autorizacoesRef, setAutorizacoesRef] = useState<AutorizacaoJoe[]>([]);
  useEffect(() => {
    if (!ehAdmin) return;
    fetch("/api/joe/saldo")
      .then((r) => r.json())
      .then((d) => setAutorizacoesRef(d.autorizacoes || []))
      .catch(() => {});
  }, [ehAdmin]);
  const despachoDaData = useMemo(
    () => (form.data ? autorizacoesRef.find((a) => joeNoPeriodo({ data: form.data }, a)) : undefined),
    [form.data, autorizacoesRef]
  );
  useEffect(() => {
    if (!despachoDaData || form.valor) return;
    setForm((f) => (f.valor ? f : { ...f, valor: String(despachoDaData.valorPorVaga) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despachoDaData]);

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/joe");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      setLista(d.joe || []);
      setErro(null);
    } catch (e) {
      setErro("Falha ao carregar os JOE (" + String(e) + ").");
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  // carrega o efetivo so se for admin (para o autocomplete)
  useEffect(() => {
    if (!ehAdmin) return;
    fetch("/api/efetivo")
      .then((r) => r.json())
      .then((d) => setEfetivo(d.efetivo || []))
      .catch(() => {});
  }, [ehAdmin]);

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const criarJoe = async () => {
    if (!form.evento.trim()) return aviso("Informe o evento.");
    if (!form.data) return aviso("Informe a data.");
    setCriando(true);
    try {
      const r = await fetch("/api/joe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) return aviso(d.error || "Falha ao criar.");
      setForm({ ...vazio });
      aviso("JOE aberto.");
      carregar();
    } finally {
      setCriando(false);
    }
  };

  const acao = async (joeId: string, body: any, okMsg?: string) => {
    setOcupado(joeId);
    try {
      const r = await fetch(`/api/joe/${joeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha na operação."); return false; }
      if (okMsg) aviso(okMsg);
      await carregar();
      return true;
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async (joeId: string) => {
    if (!confirm("Excluir este JOE e todas as candidaturas? Esta ação não pode ser desfeita.")) return;
    setOcupado(joeId);
    try {
      const r = await fetch(`/api/joe/${joeId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(d.error || "Falha ao excluir."); return; }
      aviso("JOE excluído.");
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  // ids ja inscritos no JOE alvo (para o autocomplete nao oferecer repetido)
  const joeAlvo = modalJoe ? lista.find((j) => j.id === modalJoe) : null;
  const idsJaInscritos = new Set(
    (joeAlvo?.candidatos || []).map((c) => c.efetivoId).filter(Boolean) as string[]
  );

  // agrupa os JOE por ano -> mes (para o acordeao)
  const porAno = new Map<number, Map<number, Joe[]>>();
  const semData: Joe[] = [];
  for (const j of lista) {
    const am = anoMes(j.data);
    if (!am) { semData.push(j); continue; }
    if (!porAno.has(am.ano)) porAno.set(am.ano, new Map());
    const meses = porAno.get(am.ano)!;
    if (!meses.has(am.mes)) meses.set(am.mes, []);
    meses.get(am.mes)!.push(j);
  }
  const anosOrdenados = [...porAno.keys()].sort((a, b) => b - a);
  const anoAtual = new Date().getFullYear();

  // um card completo (o proprio card decide o que exibir por status/perfil)
  const renderCard = (j: Joe) => (
    <JoeCardComp
      key={j.id} j={j} ehAdmin={ehAdmin} ocupado={ocupado === j.id}
      onCandidatar={() => acao(j.id, { acao: "candidatar" }, "Candidatura enviada.")}
      onCancelar={() => acao(j.id, { acao: "cancelar" }, "Candidatura cancelada.")}
      onDecidir={(inscricaoId, decisao) => acao(j.id, { acao: "decidir", inscricaoId, decisao }, decisao === "aprovado" ? "Aprovado." : "Recusado.")}
      onEncerrar={() => acao(j.id, { acao: "encerrar" }, "JOE encerrado.")}
      onReabrir={() => acao(j.id, { acao: "reabrir" }, "JOE reaberto.")}
      onExcluir={() => excluir(j.id)}
      onAdicionar={() => setModalJoe(j.id)}
    />
  );

  // um bloco de mes: cabecalho clicavel + grade de cards quando aberto
  const renderMes = (ano: number, mes: number, joes: Joe[]) => {
    const key = mes === 0 ? `${ano}-sem` : `${ano}-${String(mes).padStart(2, "0")}`;
    const aberto = expandido.has(key);
    const nAbertos = joes.filter((j) => j.status === "aberta").length;
    const titulo = mes === 0 ? "Sem data" : `${MESES[mes - 1]} ${ano}`;
    return (
      <div className="joe-mes" key={key}>
        <button className="joe-mes-head" onClick={() => toggle(key)}>
          <span className="joe-chevron">{aberto ? "▾" : "▸"}</span>
          <span className="joe-mes-nome">{titulo}</span>
          <span className="joe-mes-meta">
            {joes.length} JOE{joes.length > 1 ? "s" : ""}
            {nAbertos > 0 ? ` · ${nAbertos} aberto${nAbertos > 1 ? "s" : ""}` : ""}
          </span>
        </button>
        {aberto && (
          <div className="joe-mes-corpo">
            <div className="joe-grid">{joes.map(renderCard)}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="joe-shell">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="joe-head">
        <div>
          <h1 className="joe-title">JOE · Jornada Operacional Extraordinária</h1>
          <p className="joe-sub">
            {ehAdmin
              ? "Abra serviços extraordinários remunerados e aprove os candidatos."
              : "Candidate-se aos serviços extraordinários remunerados disponíveis."}
          </p>
        </div>
        <div className="joe-head-acoes">
          <button className="btn saldo-btn" onClick={() => setModalSaldo(true)}>💰 Saldo JOE</button>
          <span className={"joe-perfil " + (ehAdmin ? "adm" : "pol")}>{ehAdmin ? "P1 / Admin" : "Policial"}</span>
        </div>
      </div>

      {msg && <div className="joe-toast">{msg}</div>}
      {erro && <div className="joe-banner erro">{erro}</div>}

      {ehAdmin && (
        <div className="joe-card form">
          <div className="joe-card-tit">Abrir novo JOE</div>
          <div className="joe-form-grid">
            <label className="f-evento">Evento / operação
              <input value={form.evento} placeholder="ex: Festejo de São Pedro" onChange={(e) => setForm({ ...form, evento: e.target.value })} />
            </label>
            <label>Local
              <input value={form.local} placeholder="ex: Praça da Matriz" onChange={(e) => setForm({ ...form, local: e.target.value })} />
            </label>
            <label>Data
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </label>
            <label>Vagas
              <input type="number" min={1} value={form.vagas} onChange={(e) => setForm({ ...form, vagas: e.target.value })} />
            </label>
            <label>Valor por militar (R$)
              <input type="number" min={0} step="0.01" value={form.valor} placeholder="0,00" onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              {despachoDaData && <span className="f-hint">despacho vigente: {reais(despachoDaData.valorPorVaga)} por vaga</span>}
            </label>
            <label>Comandante da operação
              <input value={form.comandanteOp} placeholder="ex: MAJOR FRANS" onChange={(e) => setForm({ ...form, comandanteOp: e.target.value })} />
            </label>
            <label>Horário (RENE)
              <input value={form.horario} placeholder="ex: 20h às 02h" onChange={(e) => setForm({ ...form, horario: e.target.value })} />
            </label>
            <label>Área de atuação
              <input value={form.areaAtuacao} placeholder="ex: Graça Aranha-MA" onChange={(e) => setForm({ ...form, areaAtuacao: e.target.value })} />
            </label>
            <label>Nº processo SEI – autorização
              <input value={form.processoSei} placeholder="ex: 2026.190.110.24899" onChange={(e) => setForm({ ...form, processoSei: e.target.value })} />
            </label>
            <label className="f-obs">Observação
              <input value={form.observacao} placeholder="detalhes, fardamento, ponto de encontro..." onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
          </div>
          <div className="joe-form-acoes">
            <button className="btn primary" disabled={criando} onClick={criarJoe}>
              {criando ? "Abrindo..." : "+ Abrir JOE"}
            </button>
          </div>
        </div>
      )}

      {carregando && <div className="joe-banner info">Carregando...</div>}

      {!carregando && lista.length === 0 && (
        <div className="joe-vazio">
          {ehAdmin ? "Nenhum JOE aberto ainda. Use o formulário acima para abrir o primeiro." : "Nenhum JOE disponível no momento."}
        </div>
      )}

      {!carregando && lista.length > 0 && (
        <div className="joe-accordion">
          {anosOrdenados.map((ano) => {
            const meses = porAno.get(ano)!;
            const mesesOrd = [...meses.keys()].sort((a, b) => b - a);
            // Ano corrente (exercicio atual): mostra os meses direto.
            if (ano === anoAtual) {
              return mesesOrd.map((mes) => renderMes(ano, mes, ordenarCards(meses.get(mes)!)));
            }
            // Exercicios passados: agrupa dentro de um ano recolhivel.
            const yKey = `y${ano}`;
            const anoAberto = expandido.has(yKey);
            const totalAno = [...meses.values()].reduce((s, a) => s + a.length, 0);
            return (
              <div className="joe-ano" key={yKey}>
                <button className="joe-ano-head" onClick={() => toggle(yKey)}>
                  <span className="joe-chevron">{anoAberto ? "▾" : "▸"}</span>
                  <span className="joe-ano-nome">Exercício {ano}</span>
                  <span className="joe-mes-meta">{totalAno} JOE{totalAno > 1 ? "s" : ""}</span>
                </button>
                {anoAberto && (
                  <div className="joe-ano-corpo">
                    {mesesOrd.map((mes) => renderMes(ano, mes, ordenarCards(meses.get(mes)!)))}
                  </div>
                )}
              </div>
            );
          })}
          {semData.length > 0 && renderMes(0, 0, ordenarCards(semData))}
        </div>
      )}

      {/* MODAL: inscricao manual pelo P1 */}
      {modalJoe && joeAlvo && (
        <ModalInscrever
          joe={joeAlvo}
          efetivo={efetivo}
          idsJaInscritos={idsJaInscritos}
          onFechar={() => setModalJoe(null)}
          onConfirmar={async (payload) => {
            // NAO fecha ao inscrever: mantem aberto para adicionar o proximo
            // militar. A modal fecha sozinha quando as vagas sao preenchidas.
            return await acao(joeAlvo.id, { acao: "inscrever_manual", ...payload }, "Militar inscrito.");
          }}
        />
      )}

      {/* MODAL: saldo da cota de JOE autorizada por despacho */}
      {modalSaldo && <ModalSaldo ehAdmin={ehAdmin} onFechar={() => setModalSaldo(false)} />}
    </div>
  );
}

/* ===================== MODAL DE SALDO DE JOE ===================== */

function ModalSaldo({ ehAdmin, onFechar }: { ehAdmin: boolean; onFechar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoJoe[]>([]);
  const [saldos, setSaldos] = useState<SaldoJoe[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const vazio = { despacho: "", processoSei: "", periodoInicio: "", periodoFim: "", quantidade: "", valorPorVaga: "" };
  const [novo, setNovo] = useState({ ...vazio });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // id da autorizacao sendo editada; null = cadastrando uma nova
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/joe/saldo");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar o saldo.");
      const lista: AutorizacaoJoe[] = d.autorizacoes || [];
      setAutorizacoes(lista);
      setSaldos(d.saldos || []);
      setSelecionadoId((atual) => (atual && lista.some((a) => a.id === atual) ? atual : (d.atualId || lista[0]?.id || null)));
      setErro(null);
    } catch (e) {
      setErro(String((e as Error).message || e));
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  const fecharForm = () => { setMostrarForm(false); setEditandoId(null); setNovo({ ...vazio }); };

  const iniciarEdicao = (a: AutorizacaoJoe) => {
    setEditandoId(a.id);
    setNovo({
      despacho: a.despacho,
      processoSei: a.processoSei,
      periodoInicio: a.periodoInicio,
      periodoFim: a.periodoFim,
      quantidade: String(a.quantidade),
      valorPorVaga: reaisParaCentavosStr(a.valorPorVaga),
    });
    setMostrarForm(true);
  };

  const salvar = async () => {
    if (!novo.despacho.trim()) return aviso("Informe o número do despacho.");
    if (!novo.periodoInicio || !novo.periodoFim) return aviso("Informe o início e o fim do período.");
    if (!novo.quantidade || Number(novo.quantidade) <= 0) return aviso("Informe a quantidade de vagas autorizadas.");
    if (!novo.valorPorVaga || Number(novo.valorPorVaga) <= 0) return aviso("Informe o valor por vaga deste despacho.");
    setSalvando(true);
    try {
      const corpo = {
        ...novo,
        quantidade: Number(novo.quantidade),
        valorPorVaga: Number(novo.valorPorVaga || "0") / 100,
        ...(editandoId ? { id: editandoId } : {}),
      };
      const r = await fetch("/api/joe/saldo", {
        method: editandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) return aviso(d.error || "Falha ao salvar o despacho.");
      aviso(editandoId ? "Despacho atualizado." : "Despacho cadastrado.");
      fecharForm();
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta autorização de JOE?")) return;
    try {
      const r = await fetch(`/api/joe/saldo?id=${id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return aviso(d.error || "Falha ao excluir.");
      aviso("Autorização excluída.");
      if (editandoId === id) fecharForm();
      await carregar();
    } catch (e) {
      aviso(String((e as Error).message || e));
    }
  };

  const saldo = saldos.find((s) => s.autorizacao.id === selecionadoId) || null;

  return (
    <div className="joe-modal-overlay" onClick={onFechar}>
      <div className="joe-modal saldo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jm-head">
          <div>
            <div className="jm-tit">Saldo JOE</div>
            <div className="jm-sub">Cota extraordinária autorizada pelo CPA/I-2 por despacho</div>
          </div>
          <button className="jm-x" onClick={onFechar}>✕</button>
        </div>

        <div className="jm-corpo">
          {msg && <div className="joe-toast">{msg}</div>}
          {erro && <div className="joe-banner erro">{erro}</div>}
          {carregando && <div className="joe-banner info">Carregando...</div>}

          {!carregando && autorizacoes.length === 0 && (
            <div className="joe-vazio">
              Nenhum despacho de JOE cadastrado ainda.{ehAdmin ? " Cadastre o primeiro logo abaixo." : ""}
            </div>
          )}

          {!carregando && saldo && (
            <>
              {autorizacoes.length > 1 && (
                <label className="jm-label">Despacho
                  <select className="jm-input" value={selecionadoId || ""} onChange={(e) => setSelecionadoId(e.target.value)}>
                    {autorizacoes.map((a) => (
                      <option key={a.id} value={a.id}>{a.despacho} · {brData(a.periodoInicio)} a {brData(a.periodoFim)}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="saldo-despacho">
                <div><b>{saldo.autorizacao.despacho}</b>{saldo.autorizacao.processoSei ? ` · Proc. SEI ${saldo.autorizacao.processoSei}` : ""}</div>
                <div className="saldo-periodo">Período: {brData(saldo.autorizacao.periodoInicio)} a {brData(saldo.autorizacao.periodoFim)} · {reais(saldo.autorizacao.valorPorVaga)} por vaga</div>
              </div>

              <div className="saldo-cards">
                <div className="saldo-card">
                  <span className="saldo-card-v">{saldo.autorizacao.quantidade}</span>
                  <span className="saldo-card-l">Autorizado</span>
                  <span className="saldo-card-sub">{reais(saldo.autorizacao.valorAutorizado)}</span>
                </div>
                <div className="saldo-card usado">
                  <span className="saldo-card-v">{saldo.quantidadeUsada}</span>
                  <span className="saldo-card-l">Comprometido</span>
                  <span className="saldo-card-sub">{reais(saldo.valorComprometido)}</span>
                </div>
                <div className="saldo-card disp">
                  <span className="saldo-card-v">{saldo.quantidadeDisponivel}</span>
                  <span className="saldo-card-l">Disponível</span>
                  <span className="saldo-card-sub">{reais(saldo.valorDisponivel)}</span>
                </div>
              </div>

              <div className="saldo-barra"><div className="saldo-barra-fill" style={{ width: `${saldo.pctUso}%` }} /></div>
              <div className="saldo-barra-legenda">{saldo.pctUso}% da cota já comprometida</div>

              <div className="joe-secao" style={{ margin: "16px 2px 8px" }}>JOE que entraram nesta conta</div>
              {saldo.eventos.length === 0 ? (
                <div className="jc-sem-cand">Nenhum JOE aprovado dentro do período deste despacho ainda.</div>
              ) : (
                <div className="jc-cand-lista">
                  {saldo.eventos.map((ev) => (
                    <div className="jc-cand" key={ev.id}>
                      <span className="jc-cand-nome">{ev.evento} · {brData(ev.data)}</span>
                      <span className="tag p1">{ev.vagas} vaga{ev.vagas > 1 ? "s" : ""} · {reais(ev.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {ehAdmin && (
            <div className="saldo-admin">
              {autorizacoes.length > 0 && (
                <div className="jc-cand-lista">
                  {autorizacoes.map((a) => (
                    <div className="jc-cand" key={a.id}>
                      <span className="jc-cand-nome">{a.despacho} · {brData(a.periodoInicio)} a {brData(a.periodoFim)}</span>
                      <span className="jc-cand-acoes">
                        <button className="mini-btn editar" onClick={() => iniciarEdicao(a)}>✎ editar</button>
                        <button className="mini-btn no" onClick={() => excluir(a.id)}>✕ excluir</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!mostrarForm ? (
                <button className="btn primary full saldo-novo-btn" onClick={() => setMostrarForm(true)}>+ Cadastrar novo despacho</button>
              ) : (
                <div className="joe-form-grid saldo-form">
                  <div className="f-evento saldo-form-tit">{editandoId ? "Editando despacho" : "Novo despacho"}</div>
                  <label className="f-evento">Nº do despacho
                    <input value={novo.despacho} placeholder="ex: Despacho nº 1198/2026 - CPAI-2/PMMA" onChange={(e) => setNovo({ ...novo, despacho: e.target.value })} />
                  </label>
                  <label>Processo SEI
                    <input value={novo.processoSei} placeholder="ex: 2026.190110.35458" onChange={(e) => setNovo({ ...novo, processoSei: e.target.value })} />
                  </label>
                  <label>Início do período
                    <input type="date" value={novo.periodoInicio} onChange={(e) => setNovo({ ...novo, periodoInicio: e.target.value })} />
                  </label>
                  <label>Fim do período
                    <input type="date" value={novo.periodoFim} onChange={(e) => setNovo({ ...novo, periodoFim: e.target.value })} />
                  </label>
                  <label>Vagas autorizadas
                    <input type="number" min={1} value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
                  </label>
                  <label>Valor por vaga <span className="saldo-form-nota">(varia por despacho: 250, 350...)</span>
                    <CampoReais centavos={novo.valorPorVaga} onChange={(c) => setNovo({ ...novo, valorPorVaga: c })} />
                  </label>
                  {!!(Number(novo.quantidade) > 0 && Number(novo.valorPorVaga) > 0) && (
                    <div className="f-obs saldo-total-calc">
                      Total autorizado: <b>{reais((Number(novo.quantidade) * Number(novo.valorPorVaga)) / 100)}</b>
                      {" "}({novo.quantidade} vaga{Number(novo.quantidade) > 1 ? "s" : ""} × {reais(Number(novo.valorPorVaga) / 100)})
                    </div>
                  )}
                  <div className="f-obs saldo-form-acoes">
                    <button className="btn" onClick={fecharForm}>Cancelar</button>
                    <button className="btn primary" disabled={salvando} onClick={salvar}>
                      {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar despacho"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== MODAL DE INSCRICAO MANUAL ===================== */

function ModalInscrever({
  joe, efetivo, idsJaInscritos, onFechar, onConfirmar,
}: {
  joe: Joe;
  efetivo: Militar[];
  idsJaInscritos: Set<string>;
  onFechar: () => void;
  onConfirmar: (payload: any) => Promise<boolean>;
}) {
  const [aba, setAba] = useState<"interno" | "externo">("interno");

  // fecha sozinha quando as vagas sao preenchidas
  useEffect(() => {
    if (joe.vagasRestantes <= 0) onFechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joe.vagasRestantes]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Militar | null>(null);

  // externo
  const [extNome, setExtNome] = useState("");
  const [extPostoGrad, setExtPostoGrad] = useState("");
  const [extMatricula, setExtMatricula] = useState("");
  const [extUnidade, setExtUnidade] = useState("");

  const [enviando, setEnviando] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return efetivo
      .filter((m) => !idsJaInscritos.has(m.id))
      .filter((m) => {
        const alvo = `${m.nome} ${m.nomeGuerra} ${m.matricula} ${m.numeroBarra} ${m.postoGrad}`.toLowerCase();
        return alvo.includes(q);
      })
      .slice(0, 8);
  }, [busca, efetivo, idsJaInscritos]);

  const confirmar = async () => {
    setEnviando(true);
    try {
      let ok = false;
      if (aba === "interno") {
        if (!selecionado) return;
        ok = await onConfirmar({ efetivoId: selecionado.id });
      } else {
        if (!extNome.trim()) return;
        ok = await onConfirmar({
          extNome: extNome.trim(),
          extPostoGrad: extPostoGrad.trim() || null,
          extMatricula: extMatricula.trim() || null,
          extUnidade: extUnidade.trim() || null,
        });
      }
      if (ok) {
        // limpa os campos para inscrever o proximo militar sem fechar a janela
        setSelecionado(null);
        setBusca("");
        setExtNome("");
        setExtPostoGrad("");
        setExtMatricula("");
        setExtUnidade("");
      }
    } finally {
      setEnviando(false);
    }
  };

  const podeConfirmar = aba === "interno" ? !!selecionado : extNome.trim().length > 0;

  return (
    <div className="joe-modal-overlay" onClick={onFechar}>
      <div className="joe-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jm-head">
          <div>
            <div className="jm-tit">Adicionar militar</div>
            <div className="jm-sub">{joe.evento} · {joe.totalAprovados}/{joe.vagas} vagas</div>
          </div>
          <button className="jm-x" onClick={onFechar}>✕</button>
        </div>

        <div className="jm-abas">
          <button className={"jm-aba " + (aba === "interno" ? "on" : "")} onClick={() => setAba("interno")}>Do 18º BPM</button>
          <button className={"jm-aba " + (aba === "externo" ? "on" : "")} onClick={() => setAba("externo")}>De fora (outra OPM)</button>
        </div>

        {aba === "interno" ? (
          <div className="jm-corpo">
            {selecionado ? (
              <div className="jm-sel">
                <span>{nomeMilitar(selecionado)}{selecionado.matricula ? ` · Mat. ${selecionado.matricula}` : ""}</span>
                <button className="mini-btn" onClick={() => { setSelecionado(null); setBusca(""); }}>trocar</button>
              </div>
            ) : (
              <>
                <input
                  className="jm-input"
                  autoFocus
                  placeholder="Buscar por nome, nome de guerra ou matrícula..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                {busca.trim().length >= 2 && (
                  <div className="jm-result">
                    {filtrados.length === 0 ? (
                      <div className="jm-vazio">Nenhum militar encontrado (ou já inscrito).</div>
                    ) : (
                      filtrados.map((m) => (
                        <button key={m.id} className="jm-opt" onClick={() => setSelecionado(m)}>
                          <span className="jm-opt-nome">{nomeMilitar(m)}</span>
                          {m.matricula && <span className="jm-opt-mat">Mat. {m.matricula}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="jm-corpo">
            <label className="jm-label">Nome completo *
              <input className="jm-input" value={extNome} placeholder="ex: João da Silva Santos" onChange={(e) => setExtNome(e.target.value)} />
            </label>
            <div className="jm-row">
              <label className="jm-label">Posto/Grad
                <input className="jm-input" value={extPostoGrad} placeholder="ex: Cb PM" onChange={(e) => setExtPostoGrad(e.target.value)} />
              </label>
              <label className="jm-label">Matrícula
                <input className="jm-input" value={extMatricula} placeholder="ex: 123456" onChange={(e) => setExtMatricula(e.target.value)} />
              </label>
            </div>
            <label className="jm-label">Unidade de origem (OPM)
              <input className="jm-input" value={extUnidade} placeholder="ex: 3º BPM" onChange={(e) => setExtUnidade(e.target.value)} />
            </label>
          </div>
        )}

        <div className="jm-rod">
          <span className="jm-nota">Será inscrito já como <b>aprovado</b>.</span>
          <div className="jm-rod-btns">
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn primary" disabled={!podeConfirmar || enviando} onClick={confirmar}>
              {enviando ? "Inscrevendo..." : "Inscrever"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== CARD ============================== */

function JoeCardComp({
  j, ehAdmin, ocupado, onCandidatar, onCancelar, onDecidir, onEncerrar, onReabrir, onExcluir, onAdicionar,
}: {
  j: Joe;
  ehAdmin: boolean;
  ocupado: boolean;
  onCandidatar: () => void;
  onCancelar: () => void;
  onDecidir: (inscricaoId: string, decisao: "aprovado" | "recusado") => void;
  onEncerrar: () => void;
  onReabrir: () => void;
  onExcluir: () => void;
  onAdicionar: () => void;
}) {
  const lotado = j.vagasRestantes <= 0;
  const minha = j.minhaInscricao;
  const totalAprov = (j.valor || 0) * j.totalAprovados;

  return (
    <div className={"joe-card item" + (j.status !== "aberta" ? " off" : "")}>
      <div className="jc-top">
        <div className="jc-evento">{j.evento}</div>
        <span className={"jc-status " + j.status}>{j.status === "aberta" ? "Aberto" : "Encerrado"}</span>
      </div>

      <div className="jc-meta">
        <span title="Data"><b>{brData(j.data)}</b> <i>{diaSemana(j.data)}</i></span>
        {j.horario && <span title="Horário">🕒 {j.horario}</span>}
        {j.local && <span title="Local">📍 {j.local}</span>}
      </div>

      <div className="jc-numeros">
        <div className="jc-num">
          <span className="jc-num-v">{reais(j.valor)}</span>
          <span className="jc-num-l">por militar</span>
        </div>
        <div className="jc-num">
          <span className="jc-num-v">{j.totalAprovados}/{j.vagas}</span>
          <span className="jc-num-l">vagas preenchidas</span>
        </div>
        <div className="jc-num">
          <span className="jc-num-v">{j.totalCandidatos}</span>
          <span className="jc-num-l">candidatos</span>
        </div>
      </div>

      {j.observacao && <div className="jc-obs">{j.observacao}</div>}

      {/* ---- POLICIAL ---- */}
      {!ehAdmin && (
        <div className="jc-acao-pol">
          {minha?.status === "aprovado" ? (
            <div className="jc-stat aprovado">✓ Você foi aprovado neste JOE</div>
          ) : minha?.status === "recusado" ? (
            <div className="jc-stat recusado">Não selecionado desta vez</div>
          ) : minha?.status === "pendente" ? (
            <>
              <div className="jc-stat pendente">⏳ Candidatura enviada, aguardando o P1</div>
              {j.status === "aberta" && (
                <button className="btn" disabled={ocupado} onClick={onCancelar}>Cancelar candidatura</button>
              )}
            </>
          ) : j.status !== "aberta" ? (
            <div className="jc-stat fechado">Encerrado</div>
          ) : lotado ? (
            <div className="jc-stat fechado">Vagas preenchidas</div>
          ) : (
            <button className="btn primary full" disabled={ocupado} onClick={onCandidatar}>
              {ocupado ? "..." : "Candidatar-se"}
            </button>
          )}
        </div>
      )}

      {/* ---- ADMIN ---- */}
      {ehAdmin && (
        <div className="jc-admin">
          <div className="jc-admin-cab">
            <span>Candidatos</span>
            {j.totalAprovados > 0 && <span className="jc-total">Total a pagar: <b>{reais(totalAprov)}</b></span>}
          </div>

          {(!j.candidatos || j.candidatos.length === 0) ? (
            <div className="jc-sem-cand">Nenhum candidato ainda.</div>
          ) : (
            <div className="jc-cand-lista">
              {j.candidatos.map((c) => (
                <div key={c.id} className={"jc-cand " + c.status}>
                  <span className="jc-cand-nome">
                    {nomeCandidato(c)}
                    {!c.efetivoId && <span className="tag ext">externo</span>}
                    {c.origem === "p1" && c.efetivoId && <span className="tag p1">P1</span>}
                  </span>
                  {c.status === "aprovado" ? (
                    <span className="jc-cand-acoes">
                      <span className="tag ok">aprovado</span>
                      <button className="mini-btn" disabled={ocupado} title="Reverter para pendente" onClick={() => onDecidir(c.id, "recusado")}>↺</button>
                    </span>
                  ) : c.status === "recusado" ? (
                    <span className="jc-cand-acoes">
                      <span className="tag no">recusado</span>
                      <button className="mini-btn ok" disabled={ocupado || lotado} title={lotado ? "Vagas cheias" : "Aprovar"} onClick={() => onDecidir(c.id, "aprovado")}>✓</button>
                    </span>
                  ) : (
                    <span className="jc-cand-acoes">
                      <button className="mini-btn ok" disabled={ocupado || lotado} title={lotado ? "Vagas cheias" : "Aprovar"} onClick={() => onDecidir(c.id, "aprovado")}>✓ aprovar</button>
                      <button className="mini-btn no" disabled={ocupado} title="Recusar" onClick={() => onDecidir(c.id, "recusado")}>✕</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="jc-admin-rod">
            {j.status === "aberta" && !lotado && (
              <button className="link-btn add" disabled={ocupado} onClick={onAdicionar}>+ Adicionar militar</button>
            )}
            {j.totalAprovados > 0 && (
              <a
                className="link-btn"
                href={`/api/joe/${j.id}/rene`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#D4AF37" }}
              >
                📄 Gerar RENE
              </a>
            )}
            {j.status === "aberta"
              ? <button className="link-btn" disabled={ocupado} onClick={onEncerrar}>Encerrar inscrições</button>
              : <button className="link-btn" disabled={ocupado} onClick={onReabrir}>Reabrir</button>}
            <button className="link-btn danger" disabled={ocupado} onClick={onExcluir}>Excluir</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== CSS ============================== */

const CSS = `
.joe-shell{ color:#E8EEF6; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; }

.joe-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.joe-title{ margin:0; font-size:20px; font-weight:700; color:#D4AF37; }
.joe-sub{ margin:3px 0 0; font-size:13px; color:#9fb0c7; }
.joe-head-acoes{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.saldo-btn{ font-weight:600; }
.joe-perfil{ font-size:12px; border-radius:999px; padding:4px 12px; white-space:nowrap; }
.joe-perfil.adm{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.joe-perfil.pol{ background:#16243a; color:#9fd9ff; border:1px solid #2b4f7a; }

.joe-toast{ background:#10301f; color:#bff0d0; border:1px solid #2e6b48; border-radius:9px; padding:9px 13px; font-size:13px; margin-bottom:12px; }
.joe-banner{ border-radius:9px; padding:10px 13px; font-size:13px; margin-bottom:12px; }
.joe-banner.erro{ background:#3a1414; color:#ffb3b3; border:1px solid #7a1f1f; }
.joe-banner.info{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }
.joe-vazio{ background:#0F1B2D; border:1px dashed #2b3f63; border-radius:12px; padding:24px; text-align:center; color:#9fb0c7; font-size:14px; }

.joe-card{ background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:14px; }
.joe-card.form{ margin-bottom:18px; }
.joe-card-tit{ color:#D4AF37; font-weight:700; font-size:14px; margin-bottom:12px; }
.joe-form-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
.joe-form-grid label{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.joe-form-grid .f-evento{ grid-column: span 2; }
.joe-form-grid .f-obs{ grid-column: 1 / -1; }
.joe-form-grid input{ background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:8px 10px; font-size:13px; }
.joe-form-grid input:focus{ outline:none; border-color:#D4AF37; }
.f-hint{ font-size:10px; color:#9fe6bd; font-weight:400; text-transform:none; }
.joe-form-acoes{ margin-top:12px; display:flex; justify-content:flex-end; }

.btn{ background:#16243a; color:#E8EEF6; border:1px solid #2b3f63; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; }
.btn:hover:not(:disabled){ border-color:#D4AF37; }
.btn:disabled{ opacity:.5; cursor:default; }
.btn.primary{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.btn.full{ width:100%; }

.joe-secao{ font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:#6f82a0; margin:18px 2px 8px; }
.joe-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:14px; }

/* ACORDEAO por mes / ano */
.joe-accordion{ display:flex; flex-direction:column; gap:10px; margin-top:8px; }
.joe-mes{ border:1px solid #1d2c44; border-radius:12px; overflow:hidden; }
.joe-mes-head, .joe-ano-head{ width:100%; display:flex; align-items:center; gap:10px; background:#0F1B2D; border:none; color:#E8EEF6; padding:12px 14px; cursor:pointer; text-align:left; }
.joe-mes-head:hover, .joe-ano-head:hover{ background:#13223a; }
.joe-chevron{ color:#6f82a0; font-size:12px; width:14px; display:inline-block; }
.joe-mes-nome{ font-weight:700; font-size:14px; color:#D4AF37; }
.joe-ano-nome{ font-weight:700; font-size:14px; color:#E8EEF6; }
.joe-mes-meta{ margin-left:auto; font-size:11.5px; color:#6f82a0; }
.joe-mes-corpo{ padding:10px 12px 12px; background:#0a1424; }
.joe-ano{ border:1px solid #26364f; border-radius:12px; overflow:hidden; }
.joe-ano-corpo{ display:flex; flex-direction:column; gap:8px; padding:8px; }
.joe-ano-corpo .joe-mes{ border-color:#1d2c44; }

.joe-card.item{ display:flex; flex-direction:column; gap:10px; }
.joe-card.item.off{ opacity:.72; }
.jc-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.jc-evento{ font-size:16px; font-weight:700; color:#E8EEF6; line-height:1.25; }
.jc-status{ font-size:11px; border-radius:999px; padding:3px 9px; white-space:nowrap; }
.jc-status.aberta{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.jc-status.encerrada{ background:#2a3550; color:#9fb0c7; border:1px solid #3d5580; }

.jc-meta{ display:flex; flex-wrap:wrap; gap:12px; font-size:13px; color:#cdd9ea; }
.jc-meta i{ color:#6f82a0; font-style:normal; font-size:11px; }
.jc-meta b{ color:#E8EEF6; }

.jc-numeros{ display:flex; gap:8px; }
.jc-num{ flex:1; background:#0a1626; border:1px solid #1d2c44; border-radius:9px; padding:8px; text-align:center; }
.jc-num-v{ display:block; font-size:15px; font-weight:700; color:#D4AF37; }
.jc-num-l{ display:block; font-size:10px; color:#6f82a0; margin-top:2px; }

.jc-obs{ font-size:12.5px; color:#9fb0c7; background:#0a1626; border-left:3px solid #2b3f63; border-radius:6px; padding:7px 10px; }

.jc-acao-pol{ display:flex; flex-direction:column; gap:8px; }
.jc-stat{ font-size:13px; border-radius:8px; padding:9px 11px; text-align:center; }
.jc-stat.aprovado{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; font-weight:600; }
.jc-stat.pendente{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.jc-stat.recusado{ background:#2a1a1a; color:#e6a3a3; border:1px solid #5b2323; }
.jc-stat.fechado{ background:#16243a; color:#9fb0c7; border:1px solid #2b3f63; }

.jc-admin{ border-top:1px solid #1d2c44; padding-top:10px; display:flex; flex-direction:column; gap:8px; }
.jc-admin-cab{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#9fb0c7; }
.jc-total b{ color:#D4AF37; }
.jc-sem-cand{ font-size:12.5px; color:#6f82a0; padding:4px 2px; }
.jc-cand-lista{ display:flex; flex-direction:column; gap:5px; }
.jc-cand{ display:flex; justify-content:space-between; align-items:center; gap:8px; background:#13223a; border:1px solid #28395a; border-radius:8px; padding:6px 10px; }
.jc-cand.aprovado{ border-color:#235b3c; background:#102a1f; }
.jc-cand.recusado{ opacity:.7; }
.jc-cand-nome{ font-size:13px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.jc-cand-acoes{ display:flex; align-items:center; gap:5px; }
.tag{ font-size:10.5px; border-radius:999px; padding:2px 8px; }
.tag.ok{ background:#10301f; color:#9fe6bd; border:1px solid #235b3c; }
.tag.no{ background:#2a1a1a; color:#e6a3a3; border:1px solid #5b2323; }
.tag.ext{ background:#2a2410; color:#f3df9d; border:1px solid #6b5320; }
.tag.p1{ background:#16243a; color:#9fd9ff; border:1px solid #2b4f7a; }
.mini-btn{ background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:6px; padding:3px 9px; font-size:11.5px; cursor:pointer; }
.mini-btn:hover:not(:disabled){ border-color:#D4AF37; }
.mini-btn:disabled{ opacity:.4; cursor:default; }
.mini-btn.ok:hover:not(:disabled){ border-color:#46c47e; color:#bff0d0; }
.mini-btn.no:hover:not(:disabled){ border-color:#e06464; color:#ffb3b3; }

.jc-admin-rod{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:2px; flex-wrap:wrap; }
.link-btn{ background:none; border:none; color:#9fb0c7; font-size:12px; cursor:pointer; padding:2px; }
.link-btn:hover:not(:disabled){ color:#D4AF37; text-decoration:underline; }
.link-btn.add{ color:#9fe6bd; font-weight:600; }
.link-btn.danger:hover:not(:disabled){ color:#ffb3b3; }
.link-btn:disabled{ opacity:.5; cursor:default; }

/* MODAL */
.joe-modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:50; padding:16px; }
.joe-modal{ background:#0F1B2D; border:1px solid #2b3f63; border-radius:14px; width:100%; max-width:480px; max-height:90vh; overflow:auto; }
.jm-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:16px 16px 12px; border-bottom:1px solid #1d2c44; }
.jm-tit{ font-size:16px; font-weight:700; color:#D4AF37; }
.jm-sub{ font-size:12px; color:#9fb0c7; margin-top:2px; }
.jm-x{ background:none; border:none; color:#9fb0c7; font-size:16px; cursor:pointer; padding:2px 6px; }
.jm-x:hover{ color:#ffb3b3; }
.jm-abas{ display:flex; gap:6px; padding:12px 16px 0; }
.jm-aba{ flex:1; background:#0a1626; color:#9fb0c7; border:1px solid #28395a; border-radius:8px; padding:8px; font-size:12.5px; cursor:pointer; }
.jm-aba.on{ background:#2a2410; color:#f3df9d; border-color:#6b5320; font-weight:600; }
.jm-corpo{ padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
.jm-input{ width:100%; background:#0a1626; color:#E8EEF6; border:1px solid #28395a; border-radius:8px; padding:9px 11px; font-size:13px; }
.jm-input:focus{ outline:none; border-color:#D4AF37; }
.jm-label{ display:flex; flex-direction:column; gap:4px; font-size:11px; color:#9fb0c7; }
.jm-row{ display:flex; gap:10px; }
.jm-row .jm-label{ flex:1; }
.jm-result{ border:1px solid #28395a; border-radius:8px; overflow:hidden; max-height:240px; overflow-y:auto; }
.jm-opt{ width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px; background:#0a1626; color:#E8EEF6; border:none; border-bottom:1px solid #1d2c44; padding:9px 11px; font-size:13px; cursor:pointer; text-align:left; }
.jm-opt:last-child{ border-bottom:none; }
.jm-opt:hover{ background:#13223a; }
.jm-opt-mat{ font-size:11px; color:#6f82a0; }
.jm-vazio{ padding:12px; font-size:12.5px; color:#6f82a0; text-align:center; }
.jm-sel{ display:flex; justify-content:space-between; align-items:center; gap:8px; background:#102a1f; border:1px solid #235b3c; border-radius:8px; padding:10px 12px; font-size:13px; color:#bff0d0; }
.jm-rod{ display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 16px 16px; border-top:1px solid #1d2c44; flex-wrap:wrap; }
.jm-nota{ font-size:11.5px; color:#9fb0c7; }
.jm-nota b{ color:#9fe6bd; }
.jm-rod-btns{ display:flex; gap:8px; }

/* SALDO JOE */
.saldo-modal{ max-width:560px; }
.saldo-despacho{ background:#0a1626; border:1px solid #1d2c44; border-radius:9px; padding:9px 12px; font-size:13px; color:#cdd9ea; }
.saldo-periodo{ font-size:12px; color:#9fb0c7; margin-top:2px; }
.saldo-cards{ display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
.saldo-card{ background:#0a1626; border:1px solid #1d2c44; border-radius:9px; padding:10px 6px; text-align:center; }
.saldo-card-v{ display:block; font-size:19px; font-weight:700; color:#D4AF37; }
.saldo-card-l{ display:block; font-size:10.5px; color:#9fb0c7; margin-top:2px; }
.saldo-card-sub{ display:block; font-size:11px; color:#6f82a0; margin-top:3px; }
.saldo-card.usado .saldo-card-v{ color:#f3df9d; }
.saldo-card.disp .saldo-card-v{ color:#9fe6bd; }
.saldo-barra{ height:8px; border-radius:999px; background:#0a1626; border:1px solid #1d2c44; overflow:hidden; margin-top:4px; }
.saldo-barra-fill{ height:100%; background:#D4AF37; border-radius:999px; }
.saldo-barra-legenda{ font-size:11px; color:#6f82a0; margin-top:4px; text-align:right; }
.saldo-admin{ border-top:1px solid #1d2c44; padding-top:12px; margin-top:4px; display:flex; flex-direction:column; gap:10px; }
.saldo-novo-btn{ font-size:14px; padding:11px 14px; }
.saldo-form{ margin-top:2px; }
.saldo-form-tit{ color:#D4AF37; font-weight:700; font-size:13px; margin-bottom:-2px; }
.saldo-form-nota{ text-transform:none; letter-spacing:0; color:#6f82a0; font-weight:400; }
.saldo-total-calc{ font-size:12.5px; color:#9fe6bd; background:#0a1626; border:1px solid #1d2c44; border-radius:8px; padding:8px 10px; }
.saldo-total-calc b{ color:#bff0d0; }
.saldo-form-acoes{ display:flex; gap:8px; justify-content:flex-end; }
.campo-reais{ display:flex; align-items:center; gap:6px; background:#0a1626; border:1px solid #28395a; border-radius:8px; padding:0 10px; }
.campo-reais-pref{ font-size:12px; color:#6f82a0; }
.campo-reais input{ background:transparent; border:none; padding:8px 0; color:#E8EEF6; font-size:13px; width:100%; }
.campo-reais input:focus{ outline:none; }
.campo-reais:focus-within{ border-color:#D4AF37; }
.mini-btn.editar:hover:not(:disabled){ border-color:#D4AF37; color:#f3df9d; }
`;
