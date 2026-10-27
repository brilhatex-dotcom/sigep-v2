"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Search, Plus, Loader2, X, Lock, Pencil, Trash2, ExternalLink, Upload, FilterX, ScrollText,
} from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import { TIPOS_DOCUMENTO, dataBR, normalizarBusca, type DocumentoOficial } from "@/lib/documentosOficiais";

/* =========================================================================
   MURAL DE DOCUMENTOS OFICIAIS

   BG, portaria, edital, nota... num lugar só, com busca no TEXTO do PDF:
   "promoção de cabo", "Silva 2022", "portaria 168". Chega aqui também pelo
   link "BG nº 134" da ficha (?bg=134&ano=2022) e pela busca do topo.
   ========================================================================= */

type Inicial = { q: string; bg: string; ano: string; tipo: string };
type Ficha = { tipo: string; numero: string; data: string; titulo: string; orgao: string; restrito: boolean };

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 12 }, (_, i) => String(ANO_ATUAL - i));

const COR_TIPO: Record<string, string> = {
  BG: "bg-sky-500/15 text-sky-300",
  "BG Reservado": "bg-red-500/15 text-red-300",
  Portaria: "bg-violet-500/15 text-violet-300",
  Edital: "bg-emerald-500/15 text-emerald-300",
};

function tamanhoLegivel(b: number) {
  if (!b) return "";
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/* Realça as palavras buscadas no trecho (o trecho vem sem acento e em caixa
   alta, igual à busca, então a comparação é direta). */
function Realce({ texto, q }: { texto: string; q: string }) {
  const palavras = normalizarBusca(q).split(" ").filter((p) => p.length >= 2);
  if (!palavras.length) return <>{texto}</>;
  const re = new RegExp(`(${palavras.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {texto.split(re).map((pedaco, i) =>
        palavras.includes(pedaco)
          ? <mark key={i} className="rounded bg-[#D4AF37]/30 px-0.5 text-white">{pedaco}</mark>
          : <span key={i}>{pedaco}</span>)}
    </>
  );
}

export default function DocumentosClient({ admin, inicial }: { admin: boolean; inicial: Inicial }) {
  const router = useRouter();
  const [q, setQ] = useState(inicial.q);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [ano, setAno] = useState(inicial.ano);
  const [bg, setBg] = useState(inicial.bg);
  const [docs, setDocs] = useState<DocumentoOficial[] | null>(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState<{ editando?: DocumentoOficial; ficha: Ficha } | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (tipo) p.set("tipo", tipo);
    if (ano) p.set("ano", ano);
    if (bg) p.set("bg", bg);
    try {
      const r = await fetch(`/api/documentos?${p}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Falha ao buscar."); setDocs([]); return; }
      setDocs(d.documentos || []);
    } catch { setErro("Sem conexão com o servidor."); setDocs([]); }
  }, [q, tipo, ano, bg]);

  // busca enquanto digita, com um respiro
  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  const filtrando = !!(q.trim() || tipo || ano || bg);
  const limpar = () => { setQ(""); setTipo(""); setAno(""); setBg(""); router.replace("/documentos"); };

  const novaFicha = (): Ficha => ({
    tipo: "BG", numero: bg || "", data: ano ? `${ano}-01-01` : "", titulo: "", orgao: "PMMA", restrito: false,
  });

  async function excluir(d: DocumentoOficial) {
    if (!await confirmar(`Tirar do mural ${d.tipo}${d.numero ? ` nº ${d.numero}` : ""} de ${dataBR(d.data)}?\n\nO PDF é apagado junto. Não dá para desfazer.`, { rotuloOk: "Tirar do mural", perigo: true })) return;
    const r = await fetch(`/api/documentos/${d.id}`, { method: "DELETE" });
    if (!r.ok) { avisar("Não foi possível apagar.", "erro"); return; }
    avisar("Documento tirado do mural.", "sucesso");
    carregar();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <ScrollText className="h-6 w-6 text-[#D4AF37]" /> Documentos Oficiais
          </h1>
          <p className="text-sm text-[#94A3B8]">
            BGs, portarias, editais e notas num lugar só. A busca procura também dentro do texto do PDF.
          </p>
        </div>
        {admin && (
          <button onClick={() => setForm({ ficha: novaFicha() })}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
            <Plus className="h-4 w-4" /> Adicionar documento
          </button>
        )}
      </div>

      {/* filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: número, assunto ou palavras do texto (ex.: promoção cabo 2026)"
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white placeholder-[#94A3B8] outline-none focus:border-[#D4AF37]/50" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none">
          <option value="">Todos os tipos</option>
          {TIPOS_DOCUMENTO.filter((t) => admin || t !== "BG Reservado").map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none">
          <option value="">Todos os anos</option>
          {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {filtrando && (
          <button onClick={limpar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">
            <FilterX className="h-4 w-4" /> Limpar
          </button>
        )}
      </div>

      {/* veio do link "BG nº" da ficha */}
      {bg && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">
          <span>Procurando o <b>BG nº {bg}</b>{ano ? <> de <b>{ano}</b></> : null}.</span>
          {docs && docs.length === 0 && (
            <>
              <span className="text-sky-200/80">Ele ainda não está no mural.</span>
              {admin && (
                <button onClick={() => setForm({ ficha: novaFicha() })}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700">
                  <Plus className="h-3.5 w-3.5" /> Adicionar este BG
                </button>
              )}
            </>
          )}
        </div>
      )}

      {erro && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}

      {!docs ? (
        <p className="flex items-center gap-2 py-10 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : docs.length === 0 ? (
        <div className="ui-card p-10 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]/40" />
          <p className="text-sm text-[#94A3B8]">
            {filtrando ? "Nenhum documento encontrado com esses filtros." : "O mural ainda está vazio."}
            {admin && !filtrando && " Use “Adicionar documento” para pôr o primeiro BG."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="ui-card p-4">
              {/* no celular os botões descem para baixo do texto */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-[18rem]">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_TIPO[d.tipo] || "bg-white/10 text-[#cbd5e1]"}`}>{d.tipo}</span>
                    <span className="text-base font-bold text-white">
                      {d.numero ? `nº ${d.numero}` : ""}{d.numero && d.data ? " · " : ""}{dataBR(d.data)}
                    </span>
                    {d.restrito && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300" title="Só o P/1 vê">
                        <Lock className="h-3 w-3" /> restrito
                      </span>
                    )}
                  </p>
                  {d.titulo && <p className="mt-1 text-sm text-[#e2e8f0]">{d.titulo}</p>}
                  <p className="mt-0.5 text-[11px] text-[#6f82a0]">
                    {[d.orgao, tamanhoLegivel(d.tamanho), !d.temTexto && "PDF de imagem — a busca acha só pelo número e assunto"].filter(Boolean).join(" · ")}
                  </p>
                  {d.trecho && (
                    <p className="mt-2 rounded-lg bg-white/[.03] px-3 py-2 text-xs leading-relaxed text-[#94A3B8]">
                      …<Realce texto={d.trecho} q={q} />…
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={`/api/documentos/${d.id}/arquivo`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#1a1205]">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
                  </a>
                  {admin && (
                    <>
                      <button onClick={() => setForm({ editando: d, ficha: { tipo: d.tipo, numero: d.numero, data: d.data, titulo: d.titulo, orgao: d.orgao, restrito: d.restrito } })}
                        title="Corrigir" className="rounded-lg border border-white/10 p-1.5 text-[#94A3B8] hover:text-white">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => excluir(d)} title="Tirar do mural"
                        className="rounded-lg border border-white/10 p-1.5 text-[#94A3B8] hover:border-red-500/40 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <FormDocumento
          editando={form.editando}
          inicial={form.ficha}
          onFechar={() => setForm(null)}
          onSalvo={() => { setForm(null); carregar(); }}
        />
      )}
    </div>
  );
}

/* ---------- adicionar / corrigir ---------- */
function FormDocumento({
  editando, inicial, onFechar, onSalvo,
}: { editando?: DocumentoOficial; inicial: Ficha; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<Ficha>(inicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [etapa, setEtapa] = useState<"" | "enviando" | "lendo" | "gravando">("");
  const [erro, setErro] = useState("");
  const set = (k: keyof Ficha, v: string | boolean) => setF((o) => ({ ...o, [k]: v }));

  // BG reservado nasce restrito
  const mudarTipo = (t: string) => setF((o) => ({ ...o, tipo: t, restrito: t === "BG Reservado" ? true : o.restrito }));

  const rotuloEtapa = useMemo(() => ({
    enviando: "Enviando o PDF…", lendo: "Lendo o texto do PDF…", gravando: "Gravando…",
  } as Record<string, string>)[etapa] || "", [etapa]);

  async function salvar() {
    setErro("");
    if (!f.data) { setErro("Informe a data do documento."); return; }
    if (!f.numero.trim() && !f.titulo.trim()) { setErro("Informe o número ou o assunto."); return; }
    try {
      if (editando) {
        setEtapa("gravando");
        const r = await fetch(`/api/documentos/${editando.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { setErro(d?.error || "Não foi possível gravar."); return; }
        avisar("Documento corrigido.", "sucesso");
        onSalvo();
        return;
      }
      if (!arquivo) { setErro("Escolha o PDF."); return; }
      if (!/\.pdf$/i.test(arquivo.name)) { setErro("O arquivo tem de ser PDF."); return; }
      setEtapa("enviando");
      const r1 = await fetch("/api/documentos/upload", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tamanho: arquivo.size }),
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok) { setErro(d1?.error || "Não foi possível preparar o envio."); return; }
      const put = await fetch(d1.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: arquivo });
      if (!put.ok) { setErro("Falha ao enviar o PDF. Tente de novo."); return; }
      setEtapa("lendo");
      const r2 = await fetch("/api/documentos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, chave: d1.chave, nomeArquivo: arquivo.name, tamanho: arquivo.size }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { setErro(d2?.error || "Não foi possível guardar."); return; }
      avisar(d2.documento?.temTexto
        ? "Documento no mural — já dá para buscar pelo texto."
        : "Documento no mural. O PDF é imagem: a busca acha pelo número e assunto.", "sucesso");
      onSalvo();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEtapa("");
    }
  }

  const campo = "w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50";
  const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" onClick={() => !etapa && onFechar()}>
      <div className="mt-8 w-full max-w-lg rounded-xl border border-white/10 bg-[#0F1B2D] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <FileText className="h-5 w-5 text-[#D4AF37]" /> {editando ? "Corrigir documento" : "Adicionar documento"}
          </h3>
          <button onClick={onFechar} disabled={!!etapa} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          {!editando && (
            <div>
              <label className={rotulo}>Arquivo PDF *</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 bg-[#0b1626] px-3 py-3 text-sm text-[#cbd5e1] hover:border-[#D4AF37]/50">
                <Upload className="h-4 w-4 text-[#D4AF37]" />
                <span className="truncate">{arquivo ? arquivo.name : "Escolher o PDF…"}</span>
                <input type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>Tipo *</label>
              <select value={f.tipo} onChange={(e) => mudarTipo(e.target.value)} className={campo}>
                {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={rotulo}>Número</label>
              <input value={f.numero} onChange={(e) => set("numero", e.target.value)} placeholder="Ex.: 134" className={campo} />
            </div>
            <div>
              <label className={rotulo}>Data *</label>
              <input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Órgão</label>
              <input value={f.orgao} onChange={(e) => set("orgao", e.target.value)} placeholder="PMMA, 18º BPM, CPPPM…" className={campo} />
            </div>
          </div>
          <div>
            <label className={rotulo}>Assunto</label>
            <input value={f.titulo} onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: Promoções de praças — dezembro de 2026" className={campo} />
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-[#0b1626] p-3 text-sm text-white">
            <input type="checkbox" checked={f.restrito} onChange={(e) => set("restrito", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#D4AF37]" />
            <span>
              Restrito ao P/1
              <span className="block text-xs text-[#94A3B8]">Os policiais não veem nem acham na busca (ex.: BG reservado).</span>
            </span>
          </label>
          {erro && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{erro}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            {etapa && <span className="mr-auto flex items-center gap-2 text-xs text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> {rotuloEtapa}</span>}
            <button onClick={onFechar} disabled={!!etapa}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={salvar} disabled={!!etapa}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
              {etapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editando ? "Salvar" : "Pôr no mural"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
