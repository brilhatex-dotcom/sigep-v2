"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Download, Loader2, RotateCcw, ChevronDown, ChevronUp, Search, AlertTriangle, CheckCircle2, Upload, ListOrdered } from "lucide-react";
import { avisar } from "@/components/Avisos";

/* =========================================================================
   PLANILHA PADRÃO — a tela do P/1 (Portaria nº 168/2026-CPPPM)

   A planilha se monta sozinha a partir da ficha, do histórico, das certidões
   e das promoções lançadas. O que sobra para o P/1 são as células que
   dependem do julgamento dele — ficha conceito, elogios, situação jurídica
   quando há alteração — e as correções.

   Por isso a tela abre mostrando O QUE FALTA, e não a tabela crua: cada linha
   diz as pendências dela em português ("falta 2 certidões", "ficha
   conceito"), e o filtro "só com pendência" é o jeito de chegar a zero antes
   de 06/11.

   Cor das células:
     · normal  -> calculada pelo sistema (passe o mouse para ver de onde veio);
     · dourada -> o P/1 escreveu por cima (o ↺ devolve ao cálculo);
     · azul    -> veio de uma planilha anterior importada — conferir;
     · cinza   -> identidade (graduação, nome, matrícula, ID) — corrige-se na
                  ficha, não aqui.
   ========================================================================= */

type Coluna = { chave: string; titulo: string; identidade?: boolean };
type Celula = { valor: string; origem: string; manual: boolean };
type Linha = { efetivoId: string; rotulo: string; celulas: Record<string, Celula>; pendencias: string[]; dentroDoLimite: boolean };
type Resposta = {
  periodo: { id: string; nome: string };
  colunas: Coluna[];
  linhas: Linha[];
  limiteDefinido: boolean;
  resumo: { total: number; prontas: number; pendentes: number; efetivo: number };
};
type ResumoImportacao = {
  arquivo: string; aba: string; linhas: number; casadas: number; porComo: Record<string, number>;
  naoEncontrados: { linha: number; grad: string; nome: string }[];
  ficha: Record<string, number>; referencias: number;
  porNome: { linha: number; planilha: string; sistema: string }[];
  fichasAtualizadas?: number;
};

const GRADS = ["1SGT", "2SGT", "3SGT", "CB", "SD"];

// Larguras em px para a tela (o XLSX usa as larguras do modelo).
const LARGURA: Record<string, number> = {
  grad: 56, num: 64, nome: 200, mat: 80, id: 80, instrucao: 150, incl: 90, qpmp: 60, comport: 110,
  sitJuridica: 150, certidoes: 220, sitAdm: 170, cursos: 170, promCabo: 170, prom3: 170, prom2: 170,
  prom1: 170, cefc: 90, cefs: 90, cap: 90, eap: 70, elogios: 80, medalhas: 150, conceito: 90,
};

export default function PlanilhaPadraoPainel() {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [soPendentes, setSoPendentes] = useState(true);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<{ efetivoId: string; chave: string; valor: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [verFora, setVerFora] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/promocoes/planilha", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível montar a planilha."); return; }
      setDados(d);
    } catch { setErro("Sem conexão com o servidor."); }
    finally { setCarregando(false); }
  }, []);

  // Só monta quando o P/1 abre: são duzentas linhas e cinco fontes de dados.
  useEffect(() => { if (aberto && !dados && !carregando) carregar(); }, [aberto, dados, carregando, carregar]);

  const linhas = useMemo(() => {
    if (!dados) return [];
    const t = busca.trim().toLowerCase();
    return dados.linhas.filter((l) => {
      if (!verFora && !l.dentroDoLimite) return false;
      if (soPendentes && l.pendencias.length === 0) return false;
      if (!t) return true;
      return `${l.rotulo} ${l.celulas.nome?.valor} ${l.celulas.mat?.valor}`.toLowerCase().includes(t);
    });
  }, [dados, busca, soPendentes, verFora]);

  const gravar = async (efetivoId: string, chave: string, valor: string | null) => {
    setGravando(true);
    try {
      const r = await fetch("/api/promocoes/planilha", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId, chave, valor }),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível gravar.", "erro"); return; }
      setEditando(null);
      /* Recarrega a planilha inteira, e não só a célula: mexer na situação
         jurídica ou na ficha conceito muda as PENDÊNCIAS da linha, e o
         resumo lá em cima tem de acompanhar. */
      await carregar();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setGravando(false); }
  };

  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await fetch("/api/promocoes/planilha/xlsx");
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        avisar(d?.error || "Não foi possível gerar a planilha.", "erro");
        return;
      }
      const blob = await r.blob();
      const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "Planilha_Padrao_18BPM.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setBaixando(false); }
  };

  /* ---- preencher em lote: só as células EM BRANCO da coluna ----
     Na planilha de agosto/2026 a Unidade escreveu "MB" na ficha conceito de
     todos e "S/A" onde não havia elogio. Isso não se deduz do sistema — é
     decisão do P/1 —, mas também não precisa ser digitado 200 vezes. */
  const [lote, setLote] = useState({ chave: "conceito", valor: "MB" });
  const [aplicando, setAplicando] = useState(false);
  const emBranco = useMemo(
    () => (dados ? dados.linhas.filter((l) => l.dentroDoLimite && !l.celulas[lote.chave]?.valor).length : 0),
    [dados, lote.chave],
  );
  const aplicarLote = async () => {
    const titulo = dados?.colunas.find((c) => c.chave === lote.chave)?.titulo || lote.chave;
    if (!lote.valor.trim() || !emBranco) return;
    if (!confirm(`Escrever "${lote.valor.trim()}" em "${titulo}" dos ${emBranco} militar(es) que estão em branco nessa coluna?\n\nQuem já tem valor não é alterado.`)) return;
    setAplicando(true);
    try {
      const r = await fetch("/api/promocoes/planilha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: lote.chave, valor: lote.valor.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível gravar.", "erro"); return; }
      avisar(`${d.preenchidos} célula(s) preenchida(s).`, "sucesso");
      await carregar();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setAplicando(false); }
  };

  /* ---- Limite Quantitativo: quem entra na planilha ----
     A CPPPM publica quantos de cada graduação concorrem; entram os mais
     antigos. "Os N mais antigos" resolve a graduação inteira de uma vez, e a
     caixinha de cada linha acerta um caso ou outro (ex.: impedido). */
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [limiteAberto, setLimiteAberto] = useState(false);
  const porGrad = useMemo(() => {
    const out: Record<string, { total: number; dentro: number }> = {};
    for (const g of GRADS) out[g] = { total: 0, dentro: 0 };
    for (const l of dados?.linhas || []) {
      const g = l.celulas.grad.valor;
      if (!out[g]) continue;
      out[g].total++;
      if (l.dentroDoLimite) out[g].dentro++;
    }
    return out;
  }, [dados]);
  const limite = async (corpo: object) => {
    setGravando(true);
    try {
      const r = await fetch("/api/promocoes/planilha/limite", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível gravar o limite.", "erro"); return; }
      await carregar();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setGravando(false); }
  };

  /* ---- importar a planilha de um ciclo anterior ----
     Primeiro confere (nada é gravado), mostra o resultado, e só grava
     quando o P/1 manda. */
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [importacao, setImportacao] = useState<ResumoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const importar = async (f: File, aplicar: boolean) => {
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      fd.append("aplicar", aplicar ? "1" : "0");
      const r = await fetch("/api/promocoes/planilha/importar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível ler a planilha.", "erro"); return; }
      setArquivo(f);
      setImportacao(d.resumo);
      if (aplicar) {
        avisar(`Planilha importada: ${d.resumo.casadas} militar(es), ${d.resumo.fichasAtualizadas || 0} ficha(s) completada(s).`, "sucesso");
        setArquivo(null); setImportacao(null);
        await carregar();
      }
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setImportando(false); }
  };

  const r = dados?.resumo;
  const posicao = useMemo(() => {
    // número da linha NA PLANILHA (só conta quem está dentro do limite)
    const m = new Map<string, number>();
    let i = 0;
    for (const l of dados?.linhas || []) if (l.dentroDoLimite) m.set(l.efetivoId, ++i);
    return m;
  }, [dados]);

  return (
    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#0F1B2D] text-white">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <FileSpreadsheet className="h-6 w-6 shrink-0 text-[#D4AF37]" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Planilha Padrão — Portaria nº 168/2026-CPPPM</p>
          <p className="text-xs text-[#94A3B8]">
            Quem está no Limite Quantitativo, de Soldado a 1º Sargento, em ordem de antiguidade. Monta-se sozinha da ficha, do histórico e das certidões.
            Entrega à CPPPM até <b className="text-[#D4AF37]">06/11/2026</b>.
          </p>
        </div>
        {r && (
          <span className={`hidden rounded-full px-2.5 py-1 text-xs sm:inline ${r.pendentes ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
            {r.pendentes ? `${r.pendentes} com pendência` : "tudo pronto"}
          </span>
        )}
        {aberto ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
      </button>

      {aberto && (
        <div className="border-t border-white/10 p-4">
          {carregando && !dados && (
            <p className="flex items-center gap-2 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Montando a planilha…</p>
          )}
          {erro && <p className="text-sm text-red-300">{erro}</p>}

          {dados && r && (
            <>
              {/* ---- resumo e ações ---- */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-xs">
                  <b>{r.total}</b> militares{dados.limiteDefinido ? <span className="text-[#94A3B8]"> no limite (de {r.efetivo})</span> : null}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> <b>{r.prontas}</b> prontos
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> <b>{r.pendentes}</b> com pendência
                </span>
                <button onClick={baixar} disabled={baixando}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">
                  {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Baixar XLSX
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou matrícula…"
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white placeholder-[#94A3B8] outline-none focus:border-[#D4AF37]/50" />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#cbd5e1]">
                  <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
                  Só quem tem pendência
                </label>
                {dados.limiteDefinido && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#cbd5e1]">
                    <input type="checkbox" checked={verFora} onChange={(e) => setVerFora(e.target.checked)} />
                    Mostrar quem está fora do limite
                  </label>
                )}
              </div>

              {/* ---- Limite Quantitativo ---- */}
              <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${dados.limiteDefinido ? "border-white/10 bg-[#0b1626]" : "border-amber-400/30 bg-amber-500/10"}`}>
                <button onClick={() => setLimiteAberto((v) => !v)} className="flex w-full items-center gap-2 text-left">
                  <ListOrdered className="h-4 w-4 text-[#D4AF37]" />
                  <span className="font-semibold text-[#D4AF37]">Limite Quantitativo</span>
                  <span className="text-[#cbd5e1]">
                    {dados.limiteDefinido
                      ? GRADS.filter((g) => porGrad[g].total).map((g) => `${g} ${porGrad[g].dentro}/${porGrad[g].total}`).join(" · ")
                      : `ainda não definido — a planilha está com todo o efetivo (${r.efetivo}). Defina quantos de cada graduação entram.`}
                  </span>
                  {limiteAberto ? <ChevronUp className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
                </button>
                {limiteAberto && (
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2 text-[#cbd5e1]">
                    <p className="text-[#94A3B8]">
                      Digite quantos de cada graduação estão no limite publicado pela CPPPM: entram os mais antigos, na ordem da planilha.
                      Para acertar um militar só, marque ou desmarque a caixinha ao lado do número dele (ligue &quot;Mostrar quem está fora&quot;).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {GRADS.filter((g) => porGrad[g].total).map((g) => (
                        <div key={g} className="flex items-center gap-1.5 rounded border border-white/10 bg-[#0F1B2D] px-2 py-1">
                          <b className="w-9">{g}</b>
                          <input type="number" min={0} max={porGrad[g].total} placeholder={String(porGrad[g].dentro)}
                            value={qtd[g] ?? ""} onChange={(e) => setQtd({ ...qtd, [g]: e.target.value })}
                            className="w-14 rounded border border-white/10 bg-[#0b1626] px-1.5 py-0.5 text-white outline-none" />
                          <span className="text-[#6f82a0]">de {porGrad[g].total}</span>
                          <button disabled={gravando || qtd[g] === undefined || qtd[g] === ""}
                            onClick={async () => { await limite({ grad: g, quantidade: Number(qtd[g]) }); setQtd({ ...qtd, [g]: "" }); }}
                            className="rounded bg-[#D4AF37]/15 px-2 py-0.5 font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/25 disabled:opacity-40">
                            ok
                          </button>
                        </div>
                      ))}
                    </div>
                    {dados.limiteDefinido && (
                      <button disabled={gravando}
                        onClick={() => { if (confirm("Apagar o limite? A planilha volta a ter todo o efetivo.")) limite({ limpar: true }); }}
                        className="text-[11px] text-red-300 underline-offset-2 hover:underline">
                        apagar o limite
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ---- importar planilha anterior ---- */}
              <div className="mb-3 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-xs text-[#cbd5e1]">
                <div className="flex flex-wrap items-center gap-2">
                  <Upload className="h-4 w-4 text-[#D4AF37]" />
                  <span className="font-semibold text-[#D4AF37]">Aproveitar uma planilha já feita</span>
                  <span className="text-[#94A3B8]">(ex.: a de agosto) — completa as fichas vazias e pré-preenche o que o sistema não sabe.</span>
                  <label className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded bg-[#D4AF37]/15 px-2.5 py-1 font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/25 ${importando ? "pointer-events-none opacity-50" : ""}`}>
                    {importando && !importacao ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Escolher .xlsx
                    <input type="file" accept=".xlsx" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importar(f, false); }} />
                  </label>
                </div>
                {importacao && arquivo && (
                  <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                    <p>
                      <b>{importacao.arquivo}</b> (aba &quot;{importacao.aba}&quot;): <b>{importacao.casadas}</b> de {importacao.linhas} militares encontrados no sistema
                      {Object.keys(importacao.porComo).length > 0 && (
                        <span className="text-[#94A3B8]"> — por {Object.entries(importacao.porComo).map(([k, n]) => `${k}: ${n}`).join(", ")}</span>
                      )}.
                    </p>
                    <p>
                      Fichas que serão completadas (só campos vazios):{" "}
                      {Object.keys(importacao.ficha).length
                        ? Object.entries(importacao.ficha).map(([k, n]) => `${k}: ${n}`).join(", ")
                        : <span className="text-[#94A3B8]">nenhuma — as fichas já têm esses dados</span>}.
                      {" "}Dados de referência para a planilha: <b>{importacao.referencias}</b> militar(es).
                    </p>
                    <p className="text-[#94A3B8]">
                      Certidões, situação jurídica e situação administrativa NÃO são importadas: valem só para o ciclo delas.
                      O que vier da planilha aparece em <span className="text-sky-300">azul</span>, para conferir; o histórico e a ficha sempre vencem.
                    </p>
                    {importacao.porNome.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-amber-300">{importacao.porNome.length} encontrado(s) só pelo nome — confira</summary>
                        <ul className="mt-1 list-disc pl-5">
                          {importacao.porNome.map((x) => <li key={x.linha}>linha {x.linha}: {x.planilha} → {x.sistema}</li>)}
                        </ul>
                      </details>
                    )}
                    {importacao.naoEncontrados.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-amber-300">{importacao.naoEncontrados.length} não encontrado(s) no sistema — ficam de fora</summary>
                        <ul className="mt-1 list-disc pl-5">
                          {importacao.naoEncontrados.map((x) => <li key={x.linha}>linha {x.linha}: {x.grad} {x.nome}</li>)}
                        </ul>
                      </details>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button disabled={importando || !importacao.casadas} onClick={() => importar(arquivo, true)}
                        className="inline-flex items-center gap-1 rounded bg-[#D4AF37] px-3 py-1 font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-50">
                        {importando && <Loader2 className="h-3 w-3 animate-spin" />}
                        Gravar
                      </button>
                      <button disabled={importando} onClick={() => { setImportacao(null); setArquivo(null); }}
                        className="rounded border border-white/15 px-3 py-1 text-[#cbd5e1] hover:bg-white/5">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-xs text-[#cbd5e1]">
                <span className="font-semibold text-[#D4AF37]">Preencher os em branco:</span>
                <select value={lote.chave} onChange={(e) => setLote({ ...lote, chave: e.target.value })}
                  className="rounded border border-white/10 bg-[#0F1B2D] px-2 py-1 text-xs text-white outline-none">
                  {dados.colunas.filter((c) => !c.identidade).map((c) => (
                    <option key={c.chave} value={c.chave}>{c.titulo.trim()}</option>
                  ))}
                </select>
                <span>com</span>
                <input value={lote.valor} onChange={(e) => setLote({ ...lote, valor: e.target.value })} list="planilha-lote-sugestoes"
                  className="w-28 rounded border border-white/10 bg-[#0F1B2D] px-2 py-1 text-xs text-white outline-none focus:border-[#D4AF37]/50" />
                <datalist id="planilha-lote-sugestoes">
                  <option value="MB" /><option value="B" /><option value="E" /><option value="S/A" /><option value="0" />
                </datalist>
                <button onClick={aplicarLote} disabled={aplicando || !emBranco || !lote.valor.trim()}
                  className="inline-flex items-center gap-1 rounded bg-[#D4AF37]/15 px-2.5 py-1 font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/25 disabled:opacity-40">
                  {aplicando && <Loader2 className="h-3 w-3 animate-spin" />}
                  Aplicar a {emBranco} em branco
                </button>
                <span className="text-[#6f82a0]">Não mexe em quem já tem valor.</span>
              </div>

              <p className="mb-2 text-[11px] text-[#6f82a0]">
                Clique numa célula para preencher ou corrigir. <span className="text-[#D4AF37]">Dourado</span> = escrito pelo P/1
                (o ↺ devolve ao cálculo). <span className="text-sky-300">Azul</span> = veio da planilha anterior, confira.
                Cinza = vem da ficha — corrija na ficha. Passe o mouse para ver a origem de cada dado.
              </p>

              {/* ---- a tabela ---- */}
              <div className="max-h-[65vh] overflow-auto rounded-lg border border-white/10">
                <table className="border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[#13223a]">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[34px] border-b border-r border-white/10 bg-[#13223a] px-2 py-2 text-left">#</th>
                      <th className="min-w-[200px] border-b border-r border-white/10 px-2 py-2 text-left">Pendências</th>
                      {dados.colunas.map((c) => (
                        <th key={c.chave} style={{ minWidth: LARGURA[c.chave] || 90 }}
                          className="border-b border-r border-white/10 px-2 py-2 text-left font-semibold text-[#cbd5e1]">
                          {c.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.efetivoId} className={l.dentroDoLimite ? "odd:bg-white/[0.02]" : "opacity-45"}>
                        <td className="sticky left-0 z-10 border-b border-r border-white/5 bg-[#0F1B2D] px-2 py-1.5 text-[#6f82a0]">
                          <span className="flex items-center gap-1">
                            {dados.limiteDefinido && (
                              <input type="checkbox" checked={l.dentroDoLimite} disabled={gravando}
                                title={l.dentroDoLimite ? "No Limite Quantitativo — desmarque para tirar" : "Fora do limite — marque para incluir"}
                                onChange={(e) => limite({ efetivoId: l.efetivoId, dentro: e.target.checked })} />
                            )}
                            {posicao.get(l.efetivoId) ?? "—"}
                          </span>
                        </td>
                        <td className="border-b border-r border-white/5 px-2 py-1.5">
                          {l.pendencias.length === 0
                            ? <span className="text-emerald-300">pronto</span>
                            : <span className="flex flex-wrap gap-1">{l.pendencias.map((p) => (
                                <span key={p} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] text-amber-200">{p}</span>
                              ))}</span>}
                        </td>
                        {dados.colunas.map((c) => {
                          const cel = l.celulas[c.chave];
                          const ed = editando && editando.efetivoId === l.efetivoId && editando.chave === c.chave;
                          return (
                            <td key={c.chave}
                              title={c.identidade ? "Vem da ficha — corrija na ficha do militar" : cel.manual ? "Escrito pelo P/1"
                                : cel.origem === "planilha anterior" ? "Veio da planilha anterior — confira (clique para corrigir)" : `Calculado: ${cel.origem}`}
                              className={
                                "group border-b border-r border-white/5 px-2 py-1.5 align-top " +
                                (c.identidade ? "text-[#94A3B8]" : cel.manual ? "bg-[#D4AF37]/10 text-[#f3df9d]"
                                  : cel.origem === "planilha anterior" ? "bg-sky-500/10 text-sky-200" : "text-white") +
                                (!c.identidade && !ed ? " cursor-pointer hover:bg-white/5" : "")
                              }
                              onClick={() => { if (!c.identidade && !ed) setEditando({ efetivoId: l.efetivoId, chave: c.chave, valor: cel.valor }); }}
                            >
                              {ed ? (
                                <textarea
                                  autoFocus
                                  rows={2}
                                  value={editando!.valor}
                                  disabled={gravando}
                                  onChange={(e) => setEditando({ ...editando!, valor: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditando(null);
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); gravar(l.efetivoId, c.chave, editando!.valor); }
                                  }}
                                  onBlur={() => { if (editando && editando.valor !== cel.valor) gravar(l.efetivoId, c.chave, editando.valor); else setEditando(null); }}
                                  className="w-full rounded border border-[#D4AF37]/50 bg-[#0a1626] p-1 text-xs text-white outline-none"
                                />
                              ) : (
                                <span className="flex items-start gap-1">
                                  <span className="whitespace-pre-wrap">{cel.valor || <span className="text-[#3d4f6b]">—</span>}</span>
                                  {cel.manual && (
                                    <button title="Voltar ao cálculo automático"
                                      onClick={(e) => { e.stopPropagation(); gravar(l.efetivoId, c.chave, null); }}
                                      className="ml-auto shrink-0 text-[#D4AF37] opacity-60 hover:opacity-100">
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {linhas.length === 0 && (
                      <tr><td colSpan={dados.colunas.length + 2} className="px-3 py-6 text-center text-sm text-emerald-300">
                        {soPendentes ? "Nenhuma pendência — a planilha está pronta para baixar." : "Nenhum militar encontrado."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
