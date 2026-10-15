"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, FileUp, Loader2, Printer, Trash2, Users } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import { lerPdfPedacos } from "@/lib/lerArquivoTexto";
import { lerLimite, type NossoNoLimite } from "@/lib/limiteQuantitativo";

/* =========================================================================
   LIMITE QUANTITATIVO — a tela do P/1.

   1. joga os PDFs (vários de uma vez);
   2. cada um é lido AQUI, no navegador (o PDF não sobe), e só as linhas vão
      para o servidor, que guarda e cruza com o efetivo;
   3. a tela mostra, por graduação, quem é do 18º BPM — na ordem do PDF, que
      é a ordem de antiguidade da CPPPM.
   ========================================================================= */

type Lista = {
  chave: string; ciclo: string; gradOrigem: string; gradDestino: string; titulo: string;
  rotuloData: string; arquivo: string; enviadoEm: string; enviadoPor: string;
  totalPdf: number; furos: { quadro: string; faltam: number[] }[]; nossos: NossoNoLimite[];
};

type Resultado = { arquivo: string; ok: boolean; texto: string };

const ORIGEM: Record<string, string> = {
  "1SGT": "1º Sargentos", "2SGT": "2º Sargentos", "3SGT": "3º Sargentos", CB: "Cabos", SD: "Soldados",
};
const COMBATENTE = /QPMP\s*[–—-]\s*0\b/;
const quandoBR = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR"); };
const capital = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export default function LimiteClient() {
  const [listas, setListas] = useState<Lista[] | null>(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState<string>("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/promocoes/limite", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível carregar."); return; }
      setListas(d.listas || []);
    } catch { setErro("Sem conexão com o servidor."); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  /* Um PDF de cada vez: lê, confere, manda as linhas. Um PDF ruim não
     derruba os outros — cada um ganha o seu recado. */
  const processar = async (arquivos: File[]) => {
    const pdfs = arquivos.filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) { avisar("Escolha arquivos PDF.", "atencao"); return; }
    const out: Resultado[] = [];
    for (const f of pdfs) {
      setLendo(f.name);
      try {
        const leitura = lerLimite(await lerPdfPedacos(await f.arrayBuffer()));
        if (!leitura.gradOrigem || !leitura.linhas.length) {
          out.push({ arquivo: f.name, ok: false, texto: "não parece um Limite Quantitativo da CPPPM (título ou tabela não encontrados). Se for PDF escaneado (foto), não tem texto para ler." });
          continue;
        }
        const r = await fetch("/api/promocoes/limite", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arquivo: f.name, leitura }),
        });
        const d = await r.json();
        if (!r.ok) { out.push({ arquivo: f.name, ok: false, texto: d?.error || "não foi possível guardar." }); continue; }
        const furo = leitura.furos.length ? " Atenção: a leitura pulou alguma linha — confira o aviso na lista." : "";
        out.push({
          arquivo: f.name, ok: true,
          texto: `${ORIGEM[d.gradOrigem] || d.gradOrigem} → ${leitura.gradDestino} (${leitura.ciclo || "ciclo ?"}): ` +
            `${d.nossos} do 18º BPM entre ${d.totalPdf} no PDF.${furo}`,
        });
      } catch {
        out.push({ arquivo: f.name, ok: false, texto: "não consegui abrir este PDF." });
      }
    }
    setLendo("");
    setResultados(out);
    await carregar();
  };

  const remover = async (l: Lista) => {
    const ok = await confirmar(`Tirar o Limite Quantitativo dos ${ORIGEM[l.gradOrigem] || l.gradOrigem} (${l.ciclo})? Dá para subir o PDF de novo depois.`,
      { rotuloOk: "Tirar", perigo: true });
    if (!ok) return;
    try {
      const r = await fetch(`/api/promocoes/limite?chave=${encodeURIComponent(l.chave)}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); avisar(d?.error || "Não foi possível tirar.", "erro"); return; }
      await carregar();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
  };

  // agrupa por ciclo (dezembro de 2026, junho de 2027...)
  const ciclos = useMemo(() => {
    const m = new Map<string, Lista[]>();
    for (const l of listas || []) m.set(l.ciclo, [...(m.get(l.ciclo) || []), l]);
    return [...m.entries()];
  }, [listas]);

  // texto pronto para o WhatsApp / ofício
  const copiar = async (ciclo: string, ls: Lista[]) => {
    const total = ls.reduce((s, l) => s + l.nossos.length, 0);
    const partes = [`*Limite Quantitativo — ${capital(ciclo)}*`, `${total} policial(is) do 18º BPM`, ""];
    for (const l of ls) {
      partes.push(`*${ORIGEM[l.gradOrigem] || l.gradOrigem} → ${l.gradDestino}* (${l.nossos.length})`);
      for (const n of ordenar(l.nossos)) {
        partes.push(`ORD ${n.ord ?? "?"}${COMBATENTE.test(n.quadro) ? "" : ` (${n.quadro})`} — ${n.nomeSistema || n.nome} — ${n.num}`);
      }
      partes.push("");
    }
    try { await navigator.clipboard.writeText(partes.join("\n").trim()); avisar("Lista copiada.", "sucesso"); }
    catch { avisar("Não consegui copiar.", "atencao"); }
  };

  return (
    <div className="space-y-5">
      {/* ---------------- onde jogar os PDFs ---------------- */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!lendo) processar(Array.from(e.dataTransfer.files)); }}
        onClick={() => !lendo && input.current?.click()}
        className={`nao-imprimir flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          arrastando ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-[#D4AF37]/40 bg-[#0F1B2D] hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/[.05]"}`}>
        {lendo ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
            <p className="text-sm text-white">Lendo <b>{lendo}</b>…</p>
          </>
        ) : (
          <>
            <FileUp className="h-9 w-9 text-[#D4AF37]" />
            <p className="text-base font-bold text-white">Jogue aqui os PDFs do Limite Quantitativo</p>
            <p className="text-xs text-[#94A3B8]">ou clique para escolher · pode mandar os cinco de uma vez (1º Sgt, 2º Sgt, 3º Sgt, Cabo e Soldado)</p>
            <p className="text-[11px] text-[#6f82a0]">O PDF é lido aqui no seu computador; só a lista vai para o sistema. Subir de novo a mesma graduação substitui a anterior.</p>
          </>
        )}
        <input ref={input} type="file" accept=".pdf,application/pdf" multiple className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; processar(fs); }} />
      </div>

      {resultados.length > 0 && (
        <div className="nao-imprimir space-y-1.5 rounded-xl border border-white/10 bg-[#0b1626] p-3">
          {resultados.map((r, i) => (
            <p key={i} className={`flex items-start gap-2 text-xs ${r.ok ? "text-emerald-200" : "text-red-200"}`}>
              {r.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
              <span><b>{r.arquivo}</b>: {r.texto}</span>
            </p>
          ))}
        </div>
      )}

      {erro && <p className="text-sm text-red-300">{erro}</p>}
      {listas === null && !erro && (
        <p className="flex items-center gap-2 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      )}
      {listas && listas.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">
          Nenhum Limite Quantitativo ainda. Jogue os PDFs acima.
        </p>
      )}

      {/* ---------------- por ciclo ---------------- */}
      {ciclos.map(([ciclo, ls]) => {
        const total = ls.reduce((s, l) => s + l.nossos.length, 0);
        return (
          <section key={ciclo} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-r from-[#D4AF37]/15 to-transparent p-4">
              <Users className="h-8 w-8 text-[#D4AF37]" />
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Promoção de {ciclo || "ciclo não identificado"}</p>
                <p className="text-xl font-extrabold text-white">{total} policial(is) do 18º BPM no Limite Quantitativo</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ls.map((l) => (
                    <span key={l.chave} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white">
                      {ORIGEM[l.gradOrigem] || l.gradOrigem}: <b>{l.nossos.length}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="nao-imprimir flex gap-2">
                <button onClick={() => copiar(ciclo, ls)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#cbd5e1] hover:border-[#D4AF37]/40 hover:text-white">
                  <Copy className="h-3.5 w-3.5" /> Copiar lista
                </button>
                <button onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#cbd5e1] hover:border-[#D4AF37]/40 hover:text-white">
                  <Printer className="h-3.5 w-3.5" /> Imprimir
                </button>
              </div>
            </div>

            {ls.map((l) => <TabelaGrad key={l.chave} l={l} remover={() => remover(l)} />)}
          </section>
        );
      })}
    </div>
  );
}

// combatente primeiro, depois os demais quadros; dentro de cada um, pelo ORD
function ordenar(xs: NossoNoLimite[]) {
  return [...xs].sort((a, b) =>
    Number(!COMBATENTE.test(a.quadro)) - Number(!COMBATENTE.test(b.quadro))
    || a.quadro.localeCompare(b.quadro) || (a.ord ?? 9999) - (b.ord ?? 9999));
}

function TabelaGrad({ l, remover }: { l: Lista; remover: () => void }) {
  const xs = ordenar(l.nossos);
  const th = "border-b border-white/10 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]";
  const td = "border-b border-white/5 px-2 py-2 align-top";
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0F1B2D]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <p className="text-base font-bold text-white">
          {ORIGEM[l.gradOrigem] || l.gradOrigem} <span className="text-[#D4AF37]">→ {l.gradDestino}</span>
        </p>
        <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-xs font-semibold text-[#f3df9d]">
          {xs.length} do 18º BPM
        </span>
        <span className="text-xs text-[#94A3B8]">entre {l.totalPdf} no Estado</span>
        <span className="nao-imprimir ml-auto flex items-center gap-2 text-[11px] text-[#6f82a0]">
          {l.arquivo} · {quandoBR(l.enviadoEm)}
          <button onClick={remover} title="Tirar este PDF" className="rounded p-1 text-red-300/70 hover:bg-red-500/10 hover:text-red-200">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {l.furos.length > 0 && (
        <p className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A leitura deste PDF pode ter pulado alguma linha ({l.furos.map((f) => `${f.quadro}${f.faltam.length ? `: ORD ${f.faltam.slice(0, 8).join(", ")}${f.faltam.length > 8 ? "…" : ""}` : ""}`).join("; ")}).
            Confira esses números no PDF.
          </span>
        </p>
      )}

      {xs.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-[#94A3B8]">Nenhum policial do 18º BPM neste limite.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>ORD</th>
                <th className={th}>Policial</th>
                <th className={th}>Nº</th>
                <th className={th}>Matr.</th>
                <th className={th}>ID</th>
                <th className={th}>{l.rotuloData || "Data"}</th>
                <th className={th}>OPM no PDF</th>
              </tr>
            </thead>
            <tbody>
              {xs.map((n, i) => (
                <tr key={i} className={n.efetivoId ? "" : "bg-amber-500/[.06]"}>
                  <td className={`${td} whitespace-nowrap font-bold text-[#D4AF37]`}>
                    {n.ord ?? "?"}
                    {!COMBATENTE.test(n.quadro) && <span className="block text-[10px] font-normal text-[#94A3B8]">{n.quadro}</span>}
                  </td>
                  <td className={td}>
                    {n.efetivoId ? (
                      <Link href={`/efetivo/${encodeURIComponent(n.efetivoId)}`} className="text-white hover:text-[#D4AF37] hover:underline">
                        <span className="text-[#94A3B8]">{n.postoGrad} </span>{n.nomeSistema || n.nome}
                      </Link>
                    ) : (
                      <>
                        <span className="text-white">{n.nome}</span>
                        <span className="mt-0.5 block text-[11px] text-amber-300">Consta como 18º BPM no PDF, mas não achei no efetivo do SIGEP.</span>
                      </>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-[#cbd5e1]`}>{n.num}</td>
                  <td className={`${td} whitespace-nowrap text-[#cbd5e1]`}>{n.matricula}</td>
                  <td className={`${td} whitespace-nowrap text-[#cbd5e1]`}>{n.id}</td>
                  <td className={`${td} whitespace-nowrap text-[#cbd5e1]`}>{n.data}</td>
                  <td className={td}>
                    {n.opmDiferente ? (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-200" title="É nosso no SIGEP, mas o PDF da CPPPM põe outra OPM">
                        {n.opm || "—"}
                      </span>
                    ) : (
                      <span className="text-[#cbd5e1]">{n.opm}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
