"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload, Loader2, X, Check, AlertTriangle, ChevronDown, ChevronRight,
  FileText, Undo2, ShieldCheck, Search,
} from "lucide-react";
import type { Achado } from "@/lib/promocaoCruzar";
import { lerArquivoListao, type ProgressoLeitura } from "@/lib/ocrListao";

/* =========================================================================
   IMPORTAR O LISTÃO DE PROMOÇÕES

   A regra desta tela, e o motivo dela existir: o sistema ACHA e PREPARA, o
   P/1 CONFERE e CONFIRMA. Promoção é ato administrativo — nada é lançado sem
   alguém olhar linha por linha, ainda mais quando o texto veio de OCR de uma
   fotocópia. Por isso o que veio com dúvida chega desmarcado, e cada achado
   mostra ao lado a linha exata do papel.
   ========================================================================= */

type Resposta = {
  titulo: string;
  dataSugerida: string;
  totalNoListao: number;
  ignoradas: string[];
  achados: Achado[];
  deFora: number;
  duplicados: { efetivoId: string; nomeFicha: string; ords: (number | null)[] }[];
  naoApareceram: { id: string; nome: string; postoGrad: string; numeroBarra: string }[];
};

type Lote = {
  lote: string; referencia: string; aplicadoPor: string; aplicadoEm: string;
  quantidade: number; desfeito: boolean; militares: { nome: string; de: string; para: string }[];
};

const CORES: Record<Achado["confianca"], string> = {
  alta: "border-emerald-500/40 bg-emerald-500/5",
  media: "border-amber-500/40 bg-amber-500/5",
  baixa: "border-red-500/40 bg-red-500/5",
};
const ROTULO_CONF: Record<Achado["confianca"], string> = {
  alta: "confere",
  media: "conferir",
  baixa: "atenção",
};

function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ListaoClient({ lotesIniciais }: { lotesIniciais: Lote[] }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [andar, setAndar] = useState<ProgressoLeitura | null>(null);
  // as duas leituras do mesmo papel (ver ocrListao.ts)
  const [textos, setTextos] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [verTexto, setVerTexto] = useState(false);
  const [res, setRes] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [referencia, setReferencia] = useState("");
  const [dataPromocao, setDataPromocao] = useState(hojeISO());
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState<{ lote: string; aplicadas: any[]; recusadas: any[] } | null>(null);
  const [lotes, setLotes] = useState<Lote[]>(lotesIniciais);
  const [verFora, setVerFora] = useState(false);
  const entradaRef = useRef<HTMLInputElement | null>(null);

  /* ------------------------------------------------- 1) ler o arquivo --- */
  async function ler(f: File) {
    setArquivo(f); setErro(""); setRes(null); setFeito(null); setLendo(true); setAndar(null);
    try {
      const ts = await lerArquivoListao(f, setAndar);
      // o campo de correção mostra a leitura mais completa; as outras ficam
      // guardadas para continuarem valendo depois de uma correção à mão
      const ordenadas = ts.slice().sort((a, b) => b.length - a.length);
      setTexto(ordenadas[0] || "");
      setTextos(ordenadas.slice(1));
      await cruzar(ts);
    } catch (e: any) {
      setErro(e?.message || "Não consegui ler este arquivo. Ele é um PDF ou uma foto do listão?");
    } finally {
      setLendo(false);
    }
  }

  /* ------------------------------------- 2) cruzar com o efetivo -------- */
  async function cruzar(ts: string[]) {
    try {
      const r = await fetch("/api/promocoes/listao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textos: ts }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível ler o listão."); return; }
      setRes(d);
      setReferencia(d.titulo || "");
      // o mês vem do próprio listão; o dia continua sendo do P/1 confirmar
      if (d.dataSugerida) setDataPromocao(d.dataSugerida);
      // já vêm marcados só os de alta confiança — o resto é decisão do P/1
      setMarcados(new Set(
        (d.achados as Achado[]).filter((a) => a.confianca === "alta").map((a) => a.efetivoId)
      ));
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo.");
    }
  }

  /* ------------------------------------------- 3) lançar as promoções --- */
  async function aplicar() {
    if (!res) return;
    const itens = res.achados
      .filter((a) => marcados.has(a.efetivoId))
      .map((a) => ({
        efetivoId: a.efetivoId, postoNovo: a.postoNovo,
        ordListao: a.linha.ord, criterio: a.linha.criterio,
      }));
    if (!itens.length) { setErro("Marque pelo menos um militar."); return; }

    const resumo = itens.length === 1 ? "1 militar" : `${itens.length} militares`;
    if (!confirm(`Promover ${resumo}?\n\nAs fichas serão atualizadas na hora. Dá para desfazer depois, nesta mesma tela.`)) return;

    setAplicando(true); setErro("");
    try {
      const r = await fetch("/api/promocoes/listao/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia, dataPromocao, itens }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível lançar."); return; }
      setFeito(d);
      setRes(null);
      recarregarLotes();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setAplicando(false); }
  }

  async function recarregarLotes() {
    try {
      const r = await fetch("/api/promocoes/listao/lotes");
      const d = await r.json();
      if (Array.isArray(d?.lotes)) setLotes(d.lotes);
    } catch { /* silencioso */ }
  }

  async function desfazer(lote: string) {
    if (!confirm("Desfazer este lançamento? Todos voltam ao posto que tinham antes.")) return;
    try {
      const r = await fetch("/api/promocoes/listao/lotes?lote=" + encodeURIComponent(lote), { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível desfazer."); return; }
      const aviso = d.naoVoltaram?.length
        ? `\n\n${d.naoVoltaram.length} não voltaram:\n` + d.naoVoltaram.map((x: any) => `• ${x.nome}: ${x.motivo}`).join("\n")
        : "";
      alert(`${d.voltaram} militar(es) voltaram ao posto anterior.${aviso}`);
      recarregarLotes();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  /* --------------------------------------------- agrupamento na tela ---- */
  const grupos = useMemo(() => {
    if (!res) return [];
    const m = new Map<string, Achado[]>();
    for (const a of res.achados) {
      const k = `${a.linha.deOrdem}|${a.linha.dePosto} → ${a.linha.paraPosto}`;
      m.set(k, [...(m.get(k) || []), a]);
    }
    // do posto mais alto para o mais baixo, como manda a hierarquia
    return [...m.entries()]
      .sort((a, b) => Number(a[0].split("|")[0]) - Number(b[0].split("|")[0]))
      .map(([k, itens]) => ({
        titulo: k.split("|")[1],
        itens: itens.sort((x, y) => (x.linha.ord ?? 0) - (y.linha.ord ?? 0)),
      }));
  }, [res]);

  const totalMarcados = marcados.size;

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function marcarGrupo(itens: Achado[], ligar: boolean) {
    setMarcados((s) => {
      const n = new Set(s);
      for (const a of itens) { if (ligar) n.add(a.efetivoId); else n.delete(a.efetivoId); }
      return n;
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      {erro && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          <span>{erro}</span>
          <button onClick={() => setErro("")} className="shrink-0 text-red-300 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ---------------- escolher o arquivo ---------------- */}
      {!res && !feito && (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-5">
          <input
            ref={entradaRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); }}
          />

          {!lendo ? (
            <>
              <button
                onClick={() => entradaRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#2b3f63] px-4 py-10 text-center transition hover:border-[#D4AF37] hover:bg-white/[.02]"
              >
                <Upload className="h-8 w-8 text-[#D4AF37]" />
                <span className="text-base font-semibold text-white">Escolher o listão</span>
                <span className="max-w-md text-xs text-[#94A3B8]">
                  O PDF da relação de promovidos (mesmo escaneado) ou uma foto das páginas.
                  A leitura acontece no seu computador — o arquivo não é enviado para lugar nenhum.
                </span>
              </button>
              <p className="mt-3 text-center text-[11px] text-[#94A3B8]">
                Da primeira vez o navegador baixa o leitor de texto (uns 5 MB). Depois fica guardado.
              </p>
            </>
          ) : (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#D4AF37]" />
              <p className="mt-3 text-sm font-semibold text-white">{andar?.recado || "Abrindo…"}</p>
              {andar && andar.totalPaginas > 0 && (
                <>
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    {arquivo?.name} — {andar.totalPaginas} página(s)
                  </p>
                  <div className="mx-auto mt-3 h-1.5 w-64 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${andar.pct}%` }} />
                  </div>
                </>
              )}
              <p className="mt-3 text-[11px] text-[#94A3B8]">
                Cada página é lida duas vezes, de jeitos diferentes: o que uma leitura perde,
                a outra costuma achar. Leva alguns minutos — deixe esta aba aberta.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- resultado do lançamento ---------------- */}
      {feito && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-emerald-300">
            <ShieldCheck className="h-5 w-5" /> {feito.aplicadas.length} militar(es) promovido(s)
          </p>
          <ul className="mt-3 space-y-1 text-sm text-[#E8EEF6]">
            {feito.aplicadas.map((a: any, i: number) => (
              <li key={i}>• <b>{a.nome}</b> — {a.de} → <b className="text-[#D4AF37]">{a.para}</b></li>
            ))}
          </ul>
          {feito.recusadas?.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-amber-200">
                <AlertTriangle className="h-4 w-4" /> {feito.recusadas.length} não foram lançados
              </p>
              <ul className="space-y-0.5 text-xs text-amber-100/90">
                {feito.recusadas.map((r: any, i: number) => <li key={i}>• {r.nome || r.efetivoId}: {r.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => desfazer(feito.lote)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/10">
              <Undo2 className="h-4 w-4" /> Desfazer este lançamento
            </button>
            <button onClick={() => { setFeito(null); setArquivo(null); setTexto(""); setTextos([]); }}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#E8EEF6] transition hover:bg-white/5">
              Importar outro listão
            </button>
          </div>
        </div>
      )}

      {/* ---------------- conferência ---------------- */}
      {res && (
        <>
          <div className="mb-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
            <p className="text-sm font-bold text-white">{res.titulo || "Relação de promovidos"}</p>
            <p className="mt-1 text-xs text-[#94A3B8]">
              <b className="text-white">{res.totalNoListao}</b> promovidos no papel ·{" "}
              <b className="text-[#D4AF37]">{res.achados.length}</b> são do 18º BPM ·{" "}
              {res.deFora} de outras unidades
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                  Referência (fica no histórico)
                </span>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Ex.: Relação de promovidos agosto de 2026"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                  Data da promoção
                </span>
                <input type="date" value={dataPromocao} onChange={(e) => setDataPromocao(e.target.value)}
                  className="w-full rounded-lg border border-[#D4AF37]/50 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]" />
                <span className="mt-1 block text-[10px] leading-snug text-amber-200/90">
                  {res.dataSugerida
                    ? "Data a contar do ato, tirada do próprio listão (a CPPPM promove a contar do último dia do mês). Confira antes de lançar."
                    : "Não achei o mês no listão: informe a data a contar do ato."}{" "}
                  É ela que define a antiguidade dentro do posto.
                </span>
              </label>
            </div>

            {res.duplicados.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {res.duplicados.length} militar(es) apareceram em duas linhas do listão. Estão marcados
                em vermelho — confira qual linha vale antes de promover.
              </p>
            )}
          </div>

          {grupos.map((g) => (
            <div key={g.titulo} className="mb-4 overflow-hidden rounded-xl border border-[#1d2c44] bg-[#0F1B2D]">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-black/20 px-4 py-2.5">
                <p className="flex-1 text-sm font-bold text-[#D4AF37]">
                  {g.titulo} <span className="font-normal text-[#94A3B8]">({g.itens.length})</span>
                </p>
                <button onClick={() => marcarGrupo(g.itens, true)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-[#E8EEF6] hover:bg-white/5">
                  marcar todos
                </button>
                <button onClick={() => marcarGrupo(g.itens, false)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-[#94A3B8] hover:bg-white/5">
                  desmarcar
                </button>
              </div>

              {g.itens.map((a) => (
                <label key={a.efetivoId + ":" + a.linha.ord}
                  className={`flex cursor-pointer items-start gap-3 border-b border-l-4 border-white/5 px-4 py-3 transition hover:bg-white/[.03] ${CORES[a.confianca]}`}>
                  <input type="checkbox" checked={marcados.has(a.efetivoId)}
                    onChange={() => alternar(a.efetivoId)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#D4AF37]" />

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-white">{a.nomeFicha}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        a.confianca === "alta" ? "bg-emerald-500/20 text-emerald-300"
                        : a.confianca === "media" ? "bg-amber-500/20 text-amber-200"
                        : "bg-red-500/20 text-red-300"}`}>
                        {ROTULO_CONF[a.confianca]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm">
                      <span className="text-[#94A3B8]">{a.postoAtual || "sem posto"}</span>
                      <span className="mx-1.5 text-[#94A3B8]">→</span>
                      <b className="text-[#D4AF37]">{a.postoNovo}</b>
                      {a.lotacao && <span className="ml-2 text-[11px] text-[#94A3B8]">· {a.lotacao}</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                      {a.porque.join(" · ")}
                    </p>
                    {a.alerta && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a.alerta}
                      </p>
                    )}
                    {/* a linha do papel, para conferir de olho sem sair da tela */}
                    <p className="mt-1 truncate font-mono text-[10px] text-[#6b7f9e]" title={a.linha.bruta}>
                      nº {a.linha.ord ?? "?"} do listão: {a.linha.bruta}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ))}

          {res.achados.length === 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 text-sm text-amber-100">
              Li {res.totalNoListao} promovidos, mas nenhum é do efetivo do 18º BPM.
              Confira se o arquivo é o listão certo.
            </div>
          )}

          {/* barra fixa de ação */}
          <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#2b3f63] bg-[#0F1B2D]/95 p-3 shadow-2xl backdrop-blur">
            <p className="flex-1 text-sm text-[#E8EEF6]">
              <b className="text-[#D4AF37]">{totalMarcados}</b> marcado(s) para promover
            </p>
            <button onClick={() => { setRes(null); setArquivo(null); }}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5">
              Cancelar
            </button>
            <button onClick={aplicar} disabled={aplicando || totalMarcados === 0}
              className="flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Promover {totalMarcados > 0 ? totalMarcados : ""}
            </button>
          </div>

          {/* conferências extras, escondidas até pedir */}
          <div className="mt-4 space-y-2">
            <button onClick={() => setVerFora((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-[#1d2c44] bg-[#0F1B2D] px-4 py-2.5 text-left text-sm text-[#E8EEF6] hover:bg-white/5">
              {verFora ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Search className="h-4 w-4 text-[#94A3B8]" />
              Do batalhão que NÃO apareceram no listão ({res.naoApareceram.length})
            </button>
            {verFora && (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-[#1d2c44] bg-[#0F1B2D] p-3">
                <p className="mb-2 text-[11px] text-[#94A3B8]">
                  Estão no posto de origem de alguma seção do listão, mas não foram encontrados nele.
                  Serve só para conferir se faltou alguém — nada aqui é alterado.
                </p>
                <ul className="space-y-1 text-xs text-[#E8EEF6]">
                  {res.naoApareceram.map((m) => (
                    <li key={m.id}>• {m.postoGrad} {m.numeroBarra} {m.nome}</li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={() => setVerTexto((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-[#1d2c44] bg-[#0F1B2D] px-4 py-2.5 text-left text-sm text-[#E8EEF6] hover:bg-white/5">
              {verTexto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <FileText className="h-4 w-4 text-[#94A3B8]" />
              Ver e corrigir o texto que foi lido do papel
            </button>
            {verTexto && (
              <div className="rounded-lg border border-[#1d2c44] bg-[#0F1B2D] p-3">
                <p className="mb-2 text-[11px] text-[#94A3B8]">
                  Esta é a leitura principal. Se alguma linha saiu torta, dá para corrigir aqui e
                  mandar ler de novo — a outra leitura do arquivo continua valendo junto.
                  {res.ignoradas.length > 0 && ` ${res.ignoradas.length} linha(s) tinham número mas não deu para entender.`}
                </p>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12}
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-[#E8EEF6] outline-none focus:border-[#D4AF37]" />
                <button onClick={() => cruzar([texto, ...textos])}
                  className="mt-2 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10">
                  Ler de novo com este texto
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- lançamentos anteriores ---------------- */}
      {!res && lotes.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-[#1d2c44] bg-[#0F1B2D]">
          <p className="border-b border-white/5 px-4 py-2.5 text-sm font-bold text-white">
            Lançamentos anteriores
          </p>
          {lotes.map((l) => (
            <div key={l.lote} className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {l.referencia || "Listão sem referência"}
                  {l.desfeito && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#94A3B8]">desfeito</span>}
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  {l.quantidade} militar(es) · {new Date(l.aplicadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  {l.aplicadoPor ? ` · por ${l.aplicadoPor}` : ""}
                </p>
              </div>
              {!l.desfeito && (
                <button onClick={() => desfazer(l.lote)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10">
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
