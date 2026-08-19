"use client";

import { useMemo, useState } from "react";
import {
  FileSpreadsheet, FileText, Printer, FileType2, Search, X, Check,
  ChevronDown, Loader2, Users, RotateCcw,
} from "lucide-react";
import { classificarPatente } from "@/lib/patentes";
import {
  CAMPOS, GRUPOS, MODELOS, campoPorChave, valorDoCampo,
  type MilitarRelatorio, type Modelo,
} from "@/lib/relatorioCampos";

type OpcaoUnidade = { id: string; rotulo: string; nivel: number };

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

export default function RelatoriosClient({
  militares, unidades, situacoes, postos,
}: {
  militares: MilitarRelatorio[];
  unidades: OpcaoUnidade[];
  situacoes: string[];
  postos: string[];
}) {
  // ---- o que sai no papel ----
  const [colunas, setColunas] = useState<string[]>(MODELOS[0].campos);
  const [ordem, setOrdem] = useState<"antiguidade" | "alfabetica" | "lotacao">("antiguidade");
  const [titulo, setTitulo] = useState("Lista telefônica");
  const [modeloAtivo, setModeloAtivo] = useState<string>(MODELOS[0].id);

  // ---- filtros ----
  const [unidade, setUnidade] = useState("");
  const [situacao, setSituacao] = useState("");
  const [posto, setPosto] = useState("");
  const [sexo, setSexo] = useState("");
  const [mes, setMes] = useState("");
  const [busca, setBusca] = useState("");
  const [soComTelefone, setSoComTelefone] = useState(true);
  const [soComEmail, setSoComEmail] = useState(false);

  const [gruposAbertos, setGruposAbertos] = useState<string[]>(["Identificação", "Contato"]);
  const [gerandoWord, setGerandoWord] = useState(false);

  function aplicarModelo(m: Modelo) {
    setModeloAtivo(m.id);
    setColunas(m.campos);
    setTitulo(m.nome);
    if (m.ordem) setOrdem(m.ordem);
    setSoComTelefone(!!m.filtros?.somenteComTelefone);
    setSoComEmail(!!m.filtros?.somenteComEmail);
  }

  function alternarColuna(chave: string) {
    setModeloAtivo("");
    setColunas((c) => (c.includes(chave) ? c.filter((x) => x !== chave) : [...c, chave]));
  }

  function limparFiltros() {
    setUnidade(""); setSituacao(""); setPosto(""); setSexo(""); setMes("");
    setBusca(""); setSoComTelefone(false); setSoComEmail(false);
  }

  /* As colunas saem sempre na ordem do catálogo, não na ordem em que foram
     clicadas — relatório é documento, a ordem das colunas não pode depender
     de por onde a pessoa começou. */
  const colunasOrdenadas = useMemo(
    () => CAMPOS.filter((c) => colunas.includes(String(c.chave))),
    [colunas]
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const alvo = unidades.find((u) => u.id === unidade);
    return militares.filter((m) => {
      if (alvo && m.unidade !== alvo.rotulo && m.subunidade !== alvo.rotulo) return false;
      if (situacao && m.situacao !== situacao) return false;
      if (posto && (m.postoGrad || "").trim() !== posto) return false;
      if (sexo && !(m.sexo || "").toUpperCase().startsWith(sexo)) return false;
      if (mes && m.mesNasc !== Number(mes)) return false;
      if (soComTelefone && !(m.telefone || "").trim()) return false;
      if (soComEmail && !(m.email || "").trim()) return false;
      if (t) {
        const campo = `${m.nome || ""} ${m.nomeGuerra || ""} ${m.matricula || ""} ${m.lotacao || ""}`.toLowerCase();
        if (!campo.includes(t)) return false;
      }
      return true;
    });
  }, [militares, unidades, unidade, situacao, posto, sexo, mes, busca, soComTelefone, soComEmail]);

  const ordenados = useMemo(() => {
    const lista = [...filtrados];
    const porNome = (a: MilitarRelatorio, b: MilitarRelatorio) =>
      (a.nomeGuerra || a.nome || "").localeCompare(b.nomeGuerra || b.nome || "", "pt-BR");
    if (ordem === "alfabetica") return lista.sort(porNome);
    const porPatente = (a: MilitarRelatorio, b: MilitarRelatorio) => {
      const d = classificarPatente(a.postoGrad || "").ordem - classificarPatente(b.postoGrad || "").ordem;
      return d !== 0 ? d : porNome(a, b);
    };
    if (ordem === "lotacao") {
      return lista.sort((a, b) => {
        const u = (a.unidade || "zzz").localeCompare(b.unidade || "zzz", "pt-BR");
        if (u !== 0) return u;
        const s = (a.subunidade || "").localeCompare(b.subunidade || "", "pt-BR");
        return s !== 0 ? s : porPatente(a, b);
      });
    }
    return lista.sort(porPatente);
  }, [filtrados, ordem]);

  // ---- o que descreve o recorte, no cabeçalho do documento ----
  const legenda = useMemo(() => {
    const p: string[] = [];
    const alvo = unidades.find((u) => u.id === unidade);
    if (alvo) p.push(alvo.rotulo);
    if (situacao) p.push(`situação: ${situacao}`);
    if (posto) p.push(posto);
    if (sexo) p.push(sexo === "M" ? "masculino" : "feminino");
    if (mes) p.push(`aniversariantes de ${MESES[Number(mes) - 1]}`);
    if (soComTelefone) p.push("com telefone");
    if (soComEmail) p.push("com e-mail");
    if (busca.trim()) p.push(`contendo "${busca.trim()}"`);
    return p.length ? p.join(" · ") : "todo o efetivo";
  }, [unidades, unidade, situacao, posto, sexo, mes, soComTelefone, soComEmail, busca]);

  const cabecalhos = colunasOrdenadas.map((c) => c.rotulo);
  const dados = ordenados.map((m) => colunasOrdenadas.map((c) => valorDoCampo(m, String(c.chave))));
  const nomeArquivo = titulo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "relatorio";

  // ---------- exportações ----------
  function baixar(conteudo: BlobPart, ext: string, mime: string) {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${nomeArquivo}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  function csv() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    // o \ufeff é o que faz o Excel abrir os acentos certos
    const txt = "\ufeff" + [cabecalhos.map(esc).join(";"), ...dados.map((l) => l.map(esc).join(";"))].join("\r\n");
    baixar(txt, "csv", "text/csv;charset=utf-8");
  }

  function excel() {
    const esc = (v: string) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const th = cabecalhos.map((c) => `<th style="background:#D4AF37;color:#1a1205">${esc(c)}</th>`).join("");
    const trs = dados.map((l) => `<tr>${l.map((c) => `<td style="mso-number-format:'\\@'">${esc(c)}</td>`).join("")}</tr>`).join("");
    const html =
      `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>` +
      `<table border="1"><caption style="font-weight:bold">${esc(titulo)} — ${esc(legenda)}</caption>` +
      `<thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    baixar("\ufeff" + html, "xls", "application/vnd.ms-excel");
  }

  async function word() {
    setGerandoWord(true);
    try {
      const r = await fetch("/api/relatorios/docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, legenda, colunas: cabecalhos, linhas: dados,
          larguras: colunasOrdenadas.map((c) => c.largura || 12) }),
      });
      if (!r.ok) { alert("Não foi possível gerar o Word."); return; }
      baixar(await r.blob(), "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch { alert("Erro de conexão ao gerar o Word."); }
    finally { setGerandoWord(false); }
  }

  const nada = colunasOrdenadas.length === 0;

  return (
    <div>
      {/* ---------- topo ---------- */}
      <div className="no-print mb-5">
        <h1 className="text-2xl font-bold text-white">Central de Relatórios</h1>
        <p className="text-sm text-[#94A3B8]">
          Escolha o que mostrar, filtre quem entra e exporte em Excel, PDF ou Word.
        </p>
      </div>

      {/* ---------- modelos prontos ---------- */}
      <section className="no-print ui-card mb-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-white">Modelos prontos</h2>
        <p className="mb-3 text-[12px] text-[#94A3B8]">
          Clique num modelo para montar tudo de uma vez. Depois dá para ajustar colunas e filtros à vontade.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODELOS.map((m) => (
            <button key={m.id} onClick={() => aplicarModelo(m)}
              className={`rounded-lg border p-3 text-left transition ${
                modeloAtivo === m.id
                  ? "border-[#D4AF37] bg-[#D4AF37]/10"
                  : "border-white/10 bg-white/5 hover:border-[#D4AF37]/40"
              }`}>
              <span className="block text-sm font-semibold text-white">{m.nome}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#94A3B8]">{m.descricao}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="no-print grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------- filtros ---------- */}
        <section className="ui-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Quem entra</h2>
            <button onClick={limparFiltros}
              className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8] transition hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" /> limpar
            </button>
          </div>

          <div className="mb-3 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, matrícula ou lotação..."
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Unidade">
              <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={estiloSelect}>
                <option value="">Todo o batalhão</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{"\u00A0".repeat((u.nivel - 1) * 3)}{u.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Situação hoje">
              <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={estiloSelect}>
                <option value="">Qualquer situação</option>
                {situacoes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Posto / graduação">
              <select value={posto} onChange={(e) => setPosto(e.target.value)} className={estiloSelect}>
                <option value="">Todos</option>
                {postos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Sexo">
              <select value={sexo} onChange={(e) => setSexo(e.target.value)} className={estiloSelect}>
                <option value="">Todos</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </Campo>
            <Campo rotulo="Aniversariantes do mês">
              <select value={mes} onChange={(e) => setMes(e.target.value)} className={estiloSelect}>
                <option value="">Qualquer mês</option>
                {MESES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Ordenar por">
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className={estiloSelect}>
                <option value="antiguidade">Antiguidade (posto)</option>
                <option value="alfabetica">Ordem alfabética</option>
                <option value="lotacao">Unidade e pelotão</option>
              </select>
            </Campo>
          </div>

          <div className="mt-3 flex flex-wrap gap-4">
            <Marcador ligado={soComTelefone} onClick={() => setSoComTelefone((v) => !v)}>
              Só quem tem telefone
            </Marcador>
            <Marcador ligado={soComEmail} onClick={() => setSoComEmail((v) => !v)}>
              Só quem tem e-mail
            </Marcador>
          </div>
        </section>

        {/* ---------- colunas ---------- */}
        <section className="ui-card p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-white">O que mostrar</h2>
          <p className="mb-3 text-[12px] text-[#94A3B8]">{colunasOrdenadas.length} coluna(s)</p>
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {GRUPOS.map((g) => {
              const doGrupo = CAMPOS.filter((c) => c.grupo === g);
              const aberto = gruposAbertos.includes(g);
              const marcados = doGrupo.filter((c) => colunas.includes(String(c.chave))).length;
              return (
                <div key={g} className="rounded-lg border border-white/10">
                  <button
                    onClick={() => setGruposAbertos((s) => s.includes(g) ? s.filter((x) => x !== g) : [...s, g])}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-white/5">
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#94A3B8] transition ${aberto ? "rotate-180" : ""}`} />
                    {g}
                    {marcados > 0 && (
                      <span className="ml-auto rounded-full bg-[#D4AF37]/20 px-1.5 py-0.5 text-[10px] text-[#D4AF37]">{marcados}</span>
                    )}
                  </button>
                  {aberto && (
                    <div className="border-t border-white/5 px-2 py-1.5">
                      {doGrupo.map((c) => {
                        const on = colunas.includes(String(c.chave));
                        return (
                          <button key={String(c.chave)} onClick={() => alternarColuna(String(c.chave))}
                            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] text-[#cdd9ea] hover:bg-white/5">
                            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                              on ? "border-[#D4AF37] bg-[#D4AF37] text-[#1a1205]" : "border-white/20"
                            }`}>
                              {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                            </span>
                            {c.rotulo}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ---------- barra de ações ---------- */}
      <div className="no-print mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
        <span className="inline-flex items-center gap-2 text-sm text-white">
          <Users className="h-4 w-4 text-[#D4AF37]" />
          <b>{ordenados.length}</b> militar(es)
        </span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          title="Título que sai no documento"
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} disabled={nada} className={btn}>
            <Printer className="h-4 w-4" /> PDF / Imprimir
          </button>
          <button onClick={excel} disabled={nada} className={btn}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button onClick={csv} disabled={nada} className={btn}>
            <FileText className="h-4 w-4" /> CSV
          </button>
          <button onClick={word} disabled={nada || gerandoWord} className={btnOuro}>
            {gerandoWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType2 className="h-4 w-4" />} Word
          </button>
        </div>
      </div>

      {nada && (
        <p className="no-print mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <X className="h-4 w-4 shrink-0" /> Escolha ao menos uma coluna em “O que mostrar”.
        </p>
      )}

      {/* ---------- prévia / folha impressa ---------- */}
      <div className="mt-4 folha-relatorio">
        <div className="cabecalho-print">
          <p className="org">POLÍCIA MILITAR DO MARANHÃO · 18º BATALHÃO DE POLÍCIA MILITAR</p>
          <h2>{titulo}</h2>
          <p className="recorte">{legenda} — {ordenados.length} militar(es)</p>
        </div>

        <div className="rolagem">
          <table className="tabela-relatorio">
            <thead>
              <tr>
                <th className="col-ord">#</th>
                {colunasOrdenadas.map((c) => <th key={String(c.chave)}>{c.rotulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {ordenados.map((m, i) => (
                <tr key={m.id}>
                  <td className="col-ord">{i + 1}</td>
                  {colunasOrdenadas.map((c) => (
                    <td key={String(c.chave)}>{valorDoCampo(m, String(c.chave)) || "—"}</td>
                  ))}
                </tr>
              ))}
              {ordenados.length === 0 && (
                <tr><td colSpan={colunasOrdenadas.length + 1} className="vazio">
                  Nenhum militar com esses filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{ESTILO}</style>
    </div>
  );
}

/* ---------- pecinhas ---------- */
const estiloSelect =
  "w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50";
const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white transition hover:bg-white/5 disabled:opacity-40";
const btnOuro =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{rotulo}</label>
      {children}
    </div>
  );
}

function Marcador({ ligado, onClick, children }: { ligado: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 text-[12px] text-[#cdd9ea] hover:text-white">
      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
        ligado ? "border-[#D4AF37] bg-[#D4AF37] text-[#1a1205]" : "border-white/20"
      }`}>
        {ligado && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

/* A prévia É a folha impressa: o mesmo bloco vira o PDF quando se manda
   imprimir, então o que está na tela é o que sai no papel. Na tela ele fica
   escuro, como o resto do sistema; na impressão vira folha branca. */
const ESTILO = `
.folha-relatorio { border: 1px solid rgba(148,163,184,.12); border-radius: 16px; background: #0F1B2D; padding: 20px; }
.folha-relatorio .cabecalho-print { text-align: center; margin-bottom: 14px; }
.folha-relatorio .org { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #94A3B8; }
.folha-relatorio h2 { margin: 6px 0 2px; font-size: 18px; font-weight: 700; color: #fff; }
.folha-relatorio .recorte { margin: 0; font-size: 12px; color: #94A3B8; }
.folha-relatorio .rolagem { overflow-x: auto; }
.tabela-relatorio { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tabela-relatorio th, .tabela-relatorio td {
  border: 1px solid rgba(148,163,184,.18); padding: 5px 8px; text-align: left;
  color: #E8EEF6; vertical-align: top;
}
.tabela-relatorio thead th { background: rgba(212,175,55,.14); color: #D4AF37; font-weight: 700; white-space: nowrap; }
.tabela-relatorio .col-ord { width: 34px; text-align: center; color: #94A3B8; font-variant-numeric: tabular-nums; }
.tabela-relatorio .vazio { text-align: center; color: #94A3B8; padding: 24px; }

@media print {
  @page { size: A4 portrait; margin: 10mm; }
  body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .folha-relatorio, .folha-relatorio * { visibility: visible !important; }
  .folha-relatorio {
    position: absolute; left: 0; top: 0; width: 100%;
    border: none !important; border-radius: 0 !important; background: #fff !important; padding: 0 !important;
  }
  .folha-relatorio .org, .folha-relatorio .recorte { color: #444 !important; }
  .folha-relatorio h2 { color: #000 !important; }
  .folha-relatorio .rolagem { overflow: visible !important; }
  .tabela-relatorio { font-size: 9.5pt; }
  .tabela-relatorio th, .tabela-relatorio td { border-color: #000 !important; color: #000 !important; padding: 3px 5px; }
  .tabela-relatorio thead th { background: #eee !important; color: #000 !important; }
  /* o cabeçalho se repete em toda página, senão da 2ª em diante ninguém sabe
     que coluna é qual */
  .tabela-relatorio thead { display: table-header-group; }
  .tabela-relatorio tr { page-break-inside: avoid; }
  .no-print { display: none !important; }
}
`;
