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
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Trash2,
  Search,
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

// Campo de data — definido FORA do componente para não remontar a cada
// tecla (senão o <input type="date"> perde o foco/valor durante a digitação
// manual e "não aceita salvar").
function InputData({
  label, value, onChange, required,
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
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
  numerosMemorando,
  onTrocarAno,
  postergadosIniciais = [],
}: {
  anos: string[];
  anoSelecionado: string;
  equipes: EquipeView[];
  totalMilitares: number;
  totalOficiais: number;
  totalPracas: number;
  isAdmin: boolean;
  numerosMemorando: Record<string, number>;
  onTrocarAno: (ano: string) => void;
  postergadosIniciais?: { idPmma: string; nome: string; motivo: string; data: string; exercicio?: string }[];
}) {
  const router = useRouter();
  // Militares que ADIARAM as férias do plano: NÃO saem de férias e seguem no
  // serviço normal (some da escala como ausente). Guarda o motivo e o
  // EXERCÍCIO (ano de gozo) das férias que ficaram a gozar.
  type Adiado = { motivo: string; exercicio: string; nome: string };
  const [postergados, setPostergados] = useState<Map<string, Adiado>>(
    () => new Map(postergadosIniciais.map((p) => [p.idPmma, { motivo: p.motivo || "", exercicio: p.exercicio || "", nome: p.nome || "" }]))
  );
  const [salvandoPosterg, setSalvandoPosterg] = useState<string | null>(null);
  async function togglePostergar(m: MembroEquipe) {
    const jaTem = postergados.has(m.efetivoId);
    const quem = m.nomeGuerra || m.nome || "este militar";
    let motivo = "";
    let exercicio = anoSelecionado;
    if (!jaTem) {
      if (!window.confirm(`Marcar as férias de ${quem} como ADIADAS?\n\nEle NÃO sai de férias e volta ao serviço normal na escala.`)) return;
      // Exercício = ano de gozo das férias que ficam A GOZAR (alimenta o
      // relatório de férias vencidas). Vem do plano aberto, mas é editável.
      const ex = (window.prompt("Exercício das férias a gozar (ano):", anoSelecionado) || "").trim();
      if (!/^\d{4}$/.test(ex)) { alert("Informe o exercício com 4 dígitos (ex.: 2026)."); return; }
      exercicio = ex;
      motivo = (window.prompt("Motivo/observação do adiamento (opcional):", "") || "").trim();
    } else if (!window.confirm(`Remover a marca de ADIADO de ${quem}?\n\nEle volta a sair de férias no período da equipe.`)) {
      return;
    }
    setSalvandoPosterg(m.efetivoId);
    try {
      const r = await fetch("/api/ferias/postergados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: m.efetivoId, nome: m.nome || m.nomeGuerra || "", motivo, exercicio, postergado: !jaTem }),
      });
      if (!r.ok) { alert("Falha ao salvar."); return; }
      setPostergados((prev) => {
        const n = new Map(prev);
        if (jaTem) n.delete(m.efetivoId);
        else n.set(m.efetivoId, { motivo, exercicio, nome: m.nome || m.nomeGuerra || "" });
        return n;
      });
    } catch { alert("Falha ao salvar."); }
    finally { setSalvandoPosterg(null); }
  }
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<EquipeView | null>(null);
  const [permuta, setPermuta] = useState<MembroEquipe | null>(null);
  const [novaEquipe, setNovaEquipe] = useState("");

  // ---- composição da equipe: adicionar / remover militar ----
  // O plano do ano novo já nasce equilibrado, mas o P/1 continua dono da lista.
  const [addAberto, setAddAberto] = useState(false);
  const [addBusca, setAddBusca] = useState("");
  const [addLista, setAddLista] = useState<{ id: string; postoGrad?: string | null; numeroBarra?: string | null; nome?: string | null; nomeGuerra?: string | null; matricula?: string | null }[]>([]);
  const [addSalvando, setAddSalvando] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState("");
  const [removendo, setRemovendo] = useState<string | null>(null);

  // quem já está no plano deste ano (em qualquer equipe) — para não oferecer
  // duas vezes na busca
  const idsNoPlano = useMemo(
    () => new Set(equipes.flatMap((e) => e.membros.map((m) => m.efetivoId))),
    [equipes]
  );

  const abrirAdicionar = () => {
    setAddAberto(true); setAddBusca(""); setAddMsg("");
    if (addLista.length) return;
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setAddLista((d?.efetivo || d || []) as typeof addLista)).catch(() => {});
  };

  const resultadosAdd = useMemo(() => {
    const t = addBusca.trim().toLowerCase();
    if (!t) return [];
    return addLista
      .filter((m) => !idsNoPlano.has(m.id))
      .filter((m) => `${m.postoGrad ?? ""} ${m.nome ?? ""} ${m.nomeGuerra ?? ""} ${m.matricula ?? ""}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [addBusca, addLista, idsNoPlano]);

  async function adicionarMembro(idPmma: string) {
    if (!aberta) return;
    setAddSalvando(idPmma); setAddMsg("");
    try {
      const r = await fetch("/api/ferias/membros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma, numeroEquipe: aberta.numeroEquipe, anoGozo: anoSelecionado }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setAddMsg(d?.erro || "Falha ao adicionar."); return; }
      setAddBusca(""); setAddAberto(false); setAberta(null);
      router.refresh();
    } catch { setAddMsg("Falha ao adicionar."); }
    finally { setAddSalvando(null); }
  }

  async function removerMembro(m: MembroEquipe) {
    const nome = [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ");
    if (!confirm(`Remover ${nome} do plano de ${anoSelecionado}?\n\nEle sai desta equipe e deixa de contar como "de férias" nas demais telas.`)) return;
    setRemovendo(m.efetivoId);
    try {
      const r = await fetch(`/api/ferias/membros?idPmma=${encodeURIComponent(m.efetivoId)}&anoGozo=${encodeURIComponent(anoSelecionado)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setAberta(null);
      router.refresh();
    } catch { alert("Falha ao remover."); }
    finally { setRemovendo(null); }
  }
  const [salvandoPermuta, setSalvandoPermuta] = useState(false);
  const [memorando, setMemorando] = useState<DadosMemorando | null>(null);
  const [memInfo, setMemInfo] = useState<{ efetivoId: string } | null>(null);
  // Assinatura em lote dos memorandos da equipe (senha única). O papel define
  // quem assina: Chefe do P/1 (emissor) ou Comandante (VISTO).
  const [assinarLote, setAssinarLote] = useState(false);
  const [papelAss, setPapelAss] = useState<"chefe_p1" | "cmt">("chefe_p1");
  const [selAss, setSelAss] = useState<Set<string>>(new Set());
  const [senhaAss, setSenhaAss] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [assMsg, setAssMsg] = useState("");

  // --- edição de datas ---
  const [editando, setEditando] = useState<EquipeView | null>(null);
  const [form, setForm] = useState<FormDatas>({
    p1Inicio: "", p1Fim: "", p1Apres: "",
    p2Inicio: "", p2Fim: "", p2Apres: "",
    usarP2: false,
  });
  const [salvandoDatas, setSalvandoDatas] = useState(false);
  const [erroDatas, setErroDatas] = useState<string | null>(null);

  async function novoPlano() {
    const anosNum = anos.map(Number).filter((n) => !isNaN(n));
    const sugestao = String(Math.max(new Date().getFullYear(), ...(anosNum.length ? anosNum : [0])) + 1);
    const ano = window.prompt(
      "Criar plano de férias para qual ano?\n\n" +
      "A EQUIPE 1 repete os mesmos militares deste ano.\n" +
      "As demais equipes são REDISTRIBUÍDAS para equilibrar o efetivo: cada unidade\n" +
      "(ROTEM, Força Tática, ADM e cada destacamento) fica espalhada entre as equipes,\n" +
      "para não sair muita gente da mesma unidade de uma vez.\n\n" +
      "As datas vêm em branco, e você pode adicionar, remover ou trocar de equipe depois.",
      sugestao
    );
    if (!ano) return;
    const dest = ano.trim();
    if (!/^\d{4}$/.test(dest)) { alert("Ano inválido. Use o formato AAAA (ex: 2027)."); return; }
    try {
      const r = await fetch("/api/ferias/novo-plano", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anoDestino: dest, anoOrigem: anoSelecionado }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.erro || "Não foi possível criar o plano."); return; }
      alert(
        d.modo === "equilibrado"
          ? `Plano de ${dest} criado com ${d.membros || 0} militares.\n\n` +
            `A equipe 1 manteve os mesmos de ${anoSelecionado}; as demais foram redistribuídas ` +
            `equilibrando por unidade. Agora é só ajustar as datas de cada equipe — e, se precisar, ` +
            `adicionar, remover ou trocar alguém de equipe.`
          : `Plano de ${dest} criado! ${d.membros || 0} militares copiados do ano ${anoSelecionado}. Agora é só ajustar as datas de cada equipe.`
      );
      onTrocarAno(dest);
    } catch { alert("Falha ao criar o plano."); }
  }

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

  function abrirMemorando(m: MembroEquipe, e: EquipeView) {
    const p = e.periodos[0];
    const numeroGlobal = mapaNumeroGlobal.get(m.efetivoId) ?? 1;
    setMemInfo({ efetivoId: m.efetivoId });
    setMemorando({
      numero: String(numeroGlobal).padStart(3, "0"),
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

  function abrirAssinarLote(e: EquipeView, papel: "chefe_p1" | "cmt" = "chefe_p1") {
    setPapelAss(papel);
    setSelAss(new Set(filtrarMembros(e.membros).map((m) => m.efetivoId)));
    setSenhaAss(""); setAssMsg(""); setAssinarLote(true);
  }
  async function assinarMemorandos() {
    if (!aberta) return;
    const membros = filtrarMembros(aberta.membros).filter((m) => selAss.has(m.efetivoId));
    if (!membros.length) { setAssMsg("Selecione ao menos um militar."); return; }
    if (!senhaAss) { setAssMsg("Digite sua senha para assinar."); return; }
    setAssinando(true); setAssMsg("");
    try {
      const p = aberta.periodos[0];
      const itens = membros.map((m) => ({
        tipo: "memorando_ferias",
        ref: `${m.efetivoId}:${anoSelecionado}`,
        conteudo: `ferias|${m.efetivoId}|${anoSelecionado}|${p?.inicioBR || ""}|${p?.apres || p?.fimBR || ""}`,
        resumo: `Férias · ${m.postoGrad || ""} ${m.nomeGuerra || m.nome || ""} · ${anoSelecionado} · ${p?.inicioBR || "?"} a ${p?.fimBR || "?"}`,
      }));
      const r = await fetch("/api/assinatura-sigep", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papel: papelAss, senha: senhaAss, itens }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setAssMsg(d?.error || "Falha ao assinar."); setAssinando(false); return; }
      setAssMsg(`✅ ${d.assinaturas?.length || 0} memorando(s) assinados como ${papelAss === "cmt" ? "Comandante (VISTO)" : "Chefe do P/1"}.`);
      setSenhaAss("");
    } catch { setAssMsg("Falha ao assinar."); }
    finally { setAssinando(false); }
  }

  function filtrarMembros(membros: MembroEquipe[]) {
    if (filtro === "oficiais") return membros.filter((m) => m.ehOficial);
    if (filtro === "pracas") return membros.filter((m) => !m.ehOficial);
    return membros;
  }

  /* ---------- Relatório: férias A GOZAR / VENCIDAS ----------
     Fonte: os militares marcados como ADIADO — são os que ficaram devendo o
     período. VENCIDA = o exercício já passou (ano anterior ao corrente); do
     exercício corrente ainda dá para gozar dentro do ano. */
  const anoCorrente = String(new Date().getFullYear());
  const relatorioVencidas = useMemo(() => {
    // posto/nome vêm do plano (o militar pode estar em qualquer equipe do ano)
    const fichaDe = new Map<string, MembroEquipe>();
    for (const eq of equipes) for (const m of eq.membros) fichaDe.set(m.efetivoId, m);
    const linhas = Array.from(postergados.entries()).map(([id, ad]) => {
      const f = fichaDe.get(id);
      const exercicio = ad.exercicio || "";
      return {
        id,
        postoGrad: f?.postoGrad ?? null,
        nome: f?.nome ?? ad.nome ?? null,
        nomeGuerra: f?.nomeGuerra ?? null,
        exercicio,
        motivo: ad.motivo,
        vencida: !!exercicio && exercicio < anoCorrente,
      };
    });
    linhas.sort((a, b) =>
      Number(b.vencida) - Number(a.vencida) ||
      (a.exercicio || "").localeCompare(b.exercicio || "") ||
      (a.nome ?? "").localeCompare(b.nome ?? ""));
    return linhas;
  }, [postergados, equipes, anoCorrente]);
  const totalVencidas = relatorioVencidas.filter((l) => l.vencida).length;

  /* Exercícios presentes no relatório, do mais novo para o mais antigo. Quem
     foi marcado antes do campo existir cai em "sem exercício". */
  const exerciciosVencidas = useMemo(() => {
    const anos = new Set<string>();
    let semAno = false;
    for (const l of relatorioVencidas) {
      if (l.exercicio) anos.add(l.exercicio);
      else semAno = true;
    }
    const lista = [...anos].sort((a, b) => b.localeCompare(a));
    return { anos: lista, semAno };
  }, [relatorioVencidas]);

  // Recolhido por padrão: a lista só abre quando o usuário pede.
  const [vencidasAberto, setVencidasAberto] = useState(false);
  const [exercicioSel, setExercicioSel] = useState<string>("todos");

  const vencidasFiltradas = useMemo(() => {
    if (exercicioSel === "todos") return relatorioVencidas;
    if (exercicioSel === "sem") return relatorioVencidas.filter((l) => !l.exercicio);
    return relatorioVencidas.filter((l) => l.exercicio === exercicioSel);
  }, [relatorioVencidas, exercicioSel]);

  const rotuloExercicio =
    exercicioSel === "todos" ? "todos os exercícios"
    : exercicioSel === "sem" ? "sem exercício informado"
    : `exercício ${exercicioSel}`;

  function imprimirVencidas() {
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const linhas = vencidasFiltradas.map((l, i) => `<tr>
      <td>${i + 1}</td><td>${esc(l.postoGrad)}</td><td>${esc(l.nome)}</td>
      <td style="text-align:center">${esc(l.exercicio || "—")}</td>
      <td style="text-align:center;font-weight:700;color:${l.vencida ? "#b91c1c" : "#b45309"}">${l.vencida ? "VENCIDA" : "A GOZAR"}</td>
      <td>${esc(l.motivo)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Férias vencidas / a gozar - 18 BPM</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0b1f3a;padding:20px;}
        .cab{text-align:center;border-bottom:2px solid #0b1f3a;padding-bottom:8px;margin-bottom:14px;}
        .cab h1{font-size:15px;margin:0;text-transform:uppercase;}
        .sub{font-size:11px;color:#555;margin:0 0 14px;}
        table{width:100%;border-collapse:collapse;font-size:11px;}
        th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;}
        th{background:#0b1f3a;color:#fff;}
        .vazio{font-size:11px;color:#666;}
      </style></head><body>
      <div class="cab"><h1>Relatório de férias vencidas / a gozar</h1></div>
      <p class="sub">18º BPM · emitido em ${new Date().toLocaleDateString("pt-BR")} · ${esc(rotuloExercicio)} · ${vencidasFiltradas.length} militar(es), ${vencidasFiltradas.filter((l) => l.vencida).length} com férias vencidas.</p>
      ${vencidasFiltradas.length
        ? `<table><thead><tr><th>#</th><th>Posto/Grad</th><th>Nome</th><th>Exercício</th><th>Situação</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>`
        : `<p class="vazio">Nenhum militar com férias a gozar registradas.</p>`}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  // Numeracao GLOBAL e continua do memorando, calculada no servidor
  // (lib/numeracaoMemorandos): percorre as equipes em ordem e atribui um numero
  // sequencial a cada militar do plano inteiro, sem reiniciar quando muda de
  // equipe, INTERCALANDO as ferias avulsas na altura em que foram cadastradas.
  // As FERIAS ocupam a primeira parte da sequencia e a Licenca-Premio CONTINUA
  // logo em seguida, formando uma unica listagem corrida entre os memorandos.
  const mapaNumeroGlobal = useMemo(
    () => new Map(Object.entries(numerosMemorando)),
    [numerosMemorando]
  );

  const cartoes = useMemo(() => {
    const comMilitares = equipes.filter((e) => e.membros.length > 0).length;
    const emFeriasHoje = equipes
      .filter((e) => e.emFeriasHoje)
      .reduce((acc, e) => acc + e.membros.length, 0);
    const equipesEmFerias = equipes.filter((e) => e.emFeriasHoje).map((e) => e.numeroEquipe);
    const equipesMes = equipes.filter((e) => e.noMes).length;
    return { comMilitares, emFeriasHoje, equipesEmFerias, equipesMes };
  }, [equipes]);

  function imprimir() {
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const equipesOrdenadas = [...equipes].sort(
      (a, b) => Number(a.numeroEquipe) - Number(b.numeroEquipe)
    );
    const blocos = equipesOrdenadas.map((e) => {
      const linhas = e.membros.map((m, i) => {
        const ad = postergados.get(m.efetivoId);
        const post = ad
          ? ` <b style="color:#b45309">(ADIADO · exercício ${esc(ad.exercicio || "—")}${ad.motivo ? ": " + esc(ad.motivo) : ""})</b>`
          : "";
        const nomeCel = `<td>${esc(m.nome)}${post}</td>`;
        return `<tr><td>${i + 1}</td><td>${esc(m.postoGrad)}</td><td>${esc(m.numeroBarra)}</td>${nomeCel}<td>${esc(m.nomeGuerra)}</td><td>${esc(m.matricula)}</td></tr>`;
      }).join("");
      const periodos = e.periodos.length
        ? e.periodos.map((p) => {
            const rot = e.periodos.length > 1 ? `${esc(p.rotulo)}: ` : "";
            const apres = p.apres && p.apres.trim() ? ` · Apres.: ${esc(p.apres)}` : "";
            return `<span class="per">${rot}${esc(p.inicioBR)} a ${esc(p.fimBR)}${apres}</span>`;
          }).join(" &nbsp; ")
        : `<span class="per">sem datas</span>`;
      return `
        <h2>EQUIPE ${esc(e.numeroEquipe)} ${periodos}${e.status?.rotulo ? ` <span class="per">· ${esc(e.status.rotulo)}</span>` : ""} <span class="qtd">${e.membros.length} militar(es)</span></h2>
        ${e.membros.length
          ? `<table><thead><tr><th>#</th><th>Posto/Grad</th><th>Nº/Barra</th><th>Nome</th><th>Nome de Guerra</th><th>Matrícula</th></tr></thead><tbody>${linhas}</tbody></table>`
          : `<p class="vazio">Sem militares nesta equipe.</p>`}`;
    }).join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Plano de Férias ${esc(anoSelecionado)} - 18 BPM</title>
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
      <p class="sub"><strong>Plano de Férias ${esc(anoSelecionado)}</strong> — emitido em ${dataStr} · ${totalMilitares} militares</p>
      ${blocos}
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 300);
  }

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

  return (
    <div className="space-y-5">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[#94A3B8]">Ano de gozo</label>
        {/* seletor + novo plano abaixo */}
        <select
          value={anoSelecionado}
          onChange={(e) => onTrocarAno(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm font-medium text-white outline-none focus:border-[#D4AF37]/50"
        >
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {isAdmin && (
          <button
            onClick={novoPlano}
            title="Criar o plano de férias de um novo ano (copia as equipes e militares, com datas em branco)"
            className="rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10"
          >
            + Novo plano
          </button>
        )}
        <button
          onClick={imprimir}
          title="Imprimir o plano de Férias (equipes, períodos e militares)"
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

      {/* Relatório: férias vencidas / a gozar (militares marcados como Adiado).
          Fica RECOLHIDO — o cabeçalho é um botão que abre a lista. */}
      <div className="ui-card p-4">
        <button
          onClick={() => setVencidasAberto((v) => !v)}
          aria-expanded={vencidasAberto}
          className="flex w-full flex-wrap items-center gap-2 text-left"
        >
          {vencidasAberto
            ? <ChevronDown className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-[#D4AF37]" />}
          <Clock className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="text-base font-bold text-white">Férias vencidas / a gozar</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-[#cdd9ea]">
            {relatorioVencidas.length}
          </span>
          {totalVencidas > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold uppercase text-red-300">
              {totalVencidas} vencida{totalVencidas > 1 ? "s" : ""}
            </span>
          )}
          <span className="ml-auto text-xs font-medium text-[#D4AF37]">
            {vencidasAberto ? "ocultar lista" : "ver lista"}
          </span>
        </button>

        {vencidasAberto && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#94A3B8]">
                Militares que <b>adiaram</b> as férias — continuam no serviço e ficaram com o período a gozar.
                <b> Vencida</b> = o exercício já passou.
              </p>
              {vencidasFiltradas.length > 0 && (
                <button onClick={imprimirVencidas}
                  className="shrink-0 rounded border border-white/15 px-2.5 py-1 text-xs text-[#94A3B8] hover:border-[#D4AF37] hover:text-white">
                  🖨 Imprimir relatório
                </button>
              )}
            </div>

            {/* filtro por exercício — separa por ano conforme o sistema avança */}
            {(exerciciosVencidas.anos.length > 0 || exerciciosVencidas.semAno) && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Exercício:</span>
                {[
                  { v: "todos", r: "Todos", n: relatorioVencidas.length },
                  ...exerciciosVencidas.anos.map((a) => ({
                    v: a, r: a, n: relatorioVencidas.filter((l) => l.exercicio === a).length,
                  })),
                  ...(exerciciosVencidas.semAno
                    ? [{ v: "sem", r: "Sem exercício", n: relatorioVencidas.filter((l) => !l.exercicio).length }]
                    : []),
                ].map((op) => (
                  <button
                    key={op.v}
                    onClick={() => setExercicioSel(op.v)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      exercicioSel === op.v
                        ? "bg-[#D4AF37] text-[#1a1205]"
                        : "bg-white/5 text-[#94A3B8] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {op.r} <span className="opacity-70">({op.n})</span>
                  </button>
                ))}
              </div>
            )}

            {relatorioVencidas.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-sm text-[#94A3B8]">
                Nenhum militar com férias a gozar. Use o botão <b>Adiar</b> dentro da equipe para registrar.
              </p>
            ) : vencidasFiltradas.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-sm text-[#94A3B8]">
                Nenhum militar neste exercício.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase text-[#94A3B8]">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Militar</th>
                      <th className="px-2 py-2 font-semibold">Exercício</th>
                      <th className="px-2 py-2 font-semibold">Situação</th>
                      <th className="px-2 py-2 font-semibold">Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {vencidasFiltradas.map((l) => (
                      <tr key={l.id} className="hover:bg-white/5">
                        <td className="px-2 py-2">
                          <span className="text-[#94A3B8]">{l.postoGrad ?? ""}</span>{" "}
                          <span className="font-medium text-white">{l.nome ?? "—"}</span>
                          {l.nomeGuerra && <span className="ml-1 text-xs text-[#94A3B8]">({l.nomeGuerra})</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-bold text-[#cdd9ea]">{l.exercicio || "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <span className={
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                            (l.vencida ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300")
                          }>
                            {l.vencida ? "vencida" : "a gozar"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[#94A3B8]">{l.motivo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={abrirAdicionar}
                    title={`Adicionar um militar à equipe ${aberta.numeroEquipe} no plano de ${anoSelecionado}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20">
                    <UserPlus className="h-4 w-4" /> Adicionar
                  </button>
                )}
                {isAdmin && filtrarMembros(aberta.membros).length > 0 && (
                  <>
                    <button onClick={() => abrirAssinarLote(aberta, "chefe_p1")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-medium text-[#f3df9d] hover:bg-[#D4AF37]/20">
                      <ShieldCheck className="h-4 w-4" /> Assinar P/1
                    </button>
                    <button onClick={() => abrirAssinarLote(aberta, "cmt")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-400/20">
                      <ShieldCheck className="h-4 w-4" /> Visto Cmt
                    </button>
                  </>
                )}
                <button onClick={() => setAberta(null)} aria-label="Fechar" className="text-[#94A3B8] hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
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

              {/* busca para incluir um militar nesta equipe */}
              {isAdmin && addAberto && (
                <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-emerald-200">
                      Adicionar à equipe {aberta.numeroEquipe} · plano de {anoSelecionado}
                    </p>
                    <button onClick={() => setAddAberto(false)} className="text-xs text-[#94A3B8] hover:text-white">fechar</button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      value={addBusca}
                      onChange={(e) => setAddBusca(e.target.value)}
                      placeholder="Buscar militar por nome ou matrícula..."
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/50"
                    />
                  </div>
                  {addBusca.trim() !== "" && (
                    <div className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0b1626]">
                      {resultadosAdd.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#94A3B8]">
                          Nenhum militar disponível (quem já está no plano de {anoSelecionado} não aparece aqui).
                        </div>
                      ) : resultadosAdd.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => adicionarMembro(m.id)}
                          disabled={addSalvando === m.id}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-white/5 disabled:opacity-50"
                        >
                          <span>
                            {[m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ")}
                            {m.matricula && <span className="ml-2 text-xs text-[#94A3B8]">mat {m.matricula}</span>}
                          </span>
                          {addSalvando === m.id
                            ? <Loader2 className="h-4 w-4 animate-spin text-[#94A3B8]" />
                            : <UserPlus className="h-4 w-4 text-emerald-300" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {addMsg && <p className="mt-2 text-xs text-red-300">{addMsg}</p>}
                </div>
              )}

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
                          {postergados.has(m.efetivoId) && (
                            <span
                              title={`Férias adiadas — não sai de férias, segue no serviço normal.${postergados.get(m.efetivoId)?.exercicio ? ` Exercício ${postergados.get(m.efetivoId)!.exercicio}.` : ""}${postergados.get(m.efetivoId)?.motivo ? ` Motivo: ${postergados.get(m.efetivoId)!.motivo}` : ""}`}
                              className="ml-2 inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                            >
                              Adiado{postergados.get(m.efetivoId)?.exercicio ? ` · ${postergados.get(m.efetivoId)!.exercicio}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#94A3B8]">{m.matricula ?? "—"}</td>
                        {isAdmin && (
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => abrirMemorando(m, aberta)}
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
                              <button
                                onClick={() => togglePostergar(m)}
                                disabled={salvandoPosterg === m.efetivoId}
                                title="Adia as férias deste militar: ele NÃO sai de férias e continua no serviço normal (escala, organograma e demais telas)"
                                className={
                                  "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50 " +
                                  (postergados.has(m.efetivoId)
                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                    : "border-white/10 text-[#94A3B8] hover:border-amber-400/40 hover:text-amber-300")
                                }
                              >
                                {salvandoPosterg === m.efetivoId
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Clock className="h-3.5 w-3.5" />}
                                {postergados.has(m.efetivoId) ? "Adiado" : "Adiar"}
                              </button>
                              <button
                                onClick={() => removerMembro(m)}
                                disabled={removendo === m.efetivoId}
                                title="Tira este militar do plano deste ano (não apaga a ficha dele)"
                                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#94A3B8] hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                              >
                                {removendo === m.efetivoId
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Trash2 className="h-3.5 w-3.5" />}
                                Remover
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

      {/* Assinar memorandos da equipe em lote (Chefe do P/1) */}
      {assinarLote && aberta && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={() => !assinando && setAssinarLote(false)}>
          <div className="mt-10 w-full max-w-lg rounded-xl border border-[#D4AF37]/30 bg-[#0F1B2D] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
              <h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-[#D4AF37]" /> {papelAss === "cmt" ? "Visto do Comandante" : "Assinar memorandos (P/1)"} — Equipe {aberta.numeroEquipe}</h3>
              <button onClick={() => !assinando && setAssinarLote(false)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-[#94A3B8]">Assinatura <b>avançada SIGEP</b> (com sua senha) {papelAss === "cmt" ? "do Comandante (VISTO)" : "do Chefe do P/1"}. Marque quem assinar — todos vêm marcados. Cada memorando recebe um carimbo com QR verificável.</p>
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span>{selAss.size} de {filtrarMembros(aberta.membros).length} selecionados</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelAss(new Set(filtrarMembros(aberta.membros).map((m) => m.efetivoId)))} className="rounded border border-white/15 px-2 py-0.5 hover:bg-white/5">Todos</button>
                  <button onClick={() => setSelAss(new Set())} className="rounded border border-white/15 px-2 py-0.5 hover:bg-white/5">Nenhum</button>
                </div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-white/10">
                {filtrarMembros(aberta.membros).map((m) => (
                  <label key={m.efetivoId} className="flex cursor-pointer items-center gap-2 border-b border-white/5 px-3 py-2 text-sm text-white hover:bg-white/5">
                    <input type="checkbox" checked={selAss.has(m.efetivoId)}
                      onChange={(e) => setSelAss((s) => { const n = new Set(s); if (e.target.checked) n.add(m.efetivoId); else n.delete(m.efetivoId); return n; })} />
                    <span>{m.postoGrad} {m.numeroBarra ? `nº ${m.numeroBarra}` : ""} {m.nomeGuerra || m.nome}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#94A3B8]">Sua senha (para assinar)</label>
                <input type="password" value={senhaAss} onChange={(e) => setSenhaAss(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              {assMsg && <div className="text-xs text-emerald-300">{assMsg}</div>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAssinarLote(false)} disabled={assinando} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Fechar</button>
                <button onClick={assinarMemorandos} disabled={assinando || !senhaAss || selAss.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                  {assinando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Assinar {selAss.size > 0 ? `(${selAss.size})` : ""}
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
          tipoAssinatura="memorando_ferias"
          refAssinatura={memInfo ? `${memInfo.efetivoId}:${anoSelecionado}` : undefined}
          onFechar={() => setMemorando(null)}
        />
      )}
    </div>
  );
}
