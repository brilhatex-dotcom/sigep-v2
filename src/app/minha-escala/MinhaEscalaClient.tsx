"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Download, Loader2, RotateCcw } from "lucide-react";
import FolhaEscalaView from "@/components/FolhaEscalaView";

/* =========================================================================
   Escala de Serviço — área do policial.

   Abre já mostrando a escala MAIS RECENTE publicada, aberta na tela: sem
   baixar nada, sem PDF, legível no celular. Um seletor de data (com setas
   e um calendário) troca o dia. PDF e Word continuam disponíveis para
   quem precisa do arquivo.
   ========================================================================= */

type Meta = {
  id: string; dataEscala: string; tipo: string;
  publicadoEm: string; publicadoPor: string; versao?: number; vigente?: boolean;
};

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function rotuloDia(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  if (iso === hojeISO()) return "Hoje";
  if (iso === somaDias(hojeISO(), -1)) return "Ontem";
  if (iso === somaDias(hojeISO(), 1)) return "Amanhã";
  return `${m[3]}/${m[2]}`;
}

export default function MinhaEscalaClient() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [dia, setDia] = useState<string>("");
  const [pub, setPub] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [buscandoFolha, setBuscandoFolha] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const cache = useRef<Record<string, any>>({});

  /* ---------- lista do que está publicado ---------- */
  const puxarLista = useCallback(async () => {
    try {
      const r = await fetch("/api/publicacoes");
      const d = await r.json();
      const lista: Meta[] = Array.isArray(d?.publicacoes) ? d.publicacoes : [];
      // só as que valem (a última versão de cada dia)
      const vigentes = lista.filter((p) => p.vigente !== false);
      vigentes.sort((a, b) => b.dataEscala.localeCompare(a.dataEscala));
      setMetas(vigentes);
      if (!dia && vigentes.length) {
        // abre no dia de hoje se existir; senão, na mais recente
        const hoje = vigentes.find((p) => p.dataEscala === hojeISO());
        setDia(hoje ? hoje.dataEscala : vigentes[0].dataEscala);
      }
    } catch {}
    finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { puxarLista(); }, [puxarLista]);

  /* ---------- carrega a folha do dia escolhido ---------- */
  const metaDoDia = useMemo(() => metas.find((p) => p.dataEscala === dia) || null, [metas, dia]);

  useEffect(() => {
    if (!metaDoDia) { setPub(null); return; }
    if (cache.current[metaDoDia.id]) { setPub(cache.current[metaDoDia.id]); return; }
    let vivo = true;
    setBuscandoFolha(true);
    (async () => {
      try {
        const r = await fetch("/api/publicacoes?id=" + encodeURIComponent(metaDoDia.id));
        const d = await r.json();
        if (vivo && r.ok && d?.publicacao) {
          cache.current[metaDoDia.id] = d.publicacao;
          setPub(d.publicacao);
        }
      } catch {}
      finally { if (vivo) setBuscandoFolha(false); }
    })();
    return () => { vivo = false; };
  }, [metaDoDia]);

  /* ---------- navegação entre os dias publicados ---------- */
  const indice = useMemo(() => metas.findIndex((p) => p.dataEscala === dia), [metas, dia]);
  const anterior = indice >= 0 && indice < metas.length - 1 ? metas[indice + 1] : null; // lista é do mais novo p/ o mais velho
  const proximo = indice > 0 ? metas[indice - 1] : null;
  const diasPublicados = useMemo(() => new Set(metas.map((p) => p.dataEscala)), [metas]);

  async function baixar(fmt: "pdf" | "docx") {
    if (!pub) return;
    setBaixando(fmt);
    try {
      const r = await fetch(`/api/escala/${fmt}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escala: pub.escala, brasoes: pub.brasoes, chefe: pub.chefe }),
      });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `escala-${pub.dataEscala}.${fmt}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { alert("Não foi possível baixar o arquivo."); }
    finally { setBaixando(null); }
  }

  /* ================= tela ================= */
  if (carregando) {
    return <p className="py-10 text-center text-sm text-[#94A3B8]">Carregando…</p>;
  }
  if (metas.length === 0) {
    return (
      <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-8 text-center">
        <CalendarDays className="mx-auto mb-2 h-8 w-8 text-[#5b6b85]" />
        <p className="text-sm text-[#94A3B8]">Nenhuma escala publicada ainda.</p>
        <p className="mt-1 text-xs text-[#5b6b85]">Assim que o P/1 publicar, ela aparece aqui automaticamente.</p>
      </div>
    );
  }

  return (
    <>
      {/* seletor de dia */}
      <div className="mb-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => anterior && setDia(anterior.dataEscala)}
            disabled={!anterior}
            title="Dia publicado anterior"
            className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            <input
              type="date"
              value={dia}
              onChange={(ev) => setDia(ev.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]"
            />
          </label>

          <button
            onClick={() => proximo && setDia(proximo.dataEscala)}
            disabled={!proximo}
            title="Próximo dia publicado"
            className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* atalhos para os dias publicados mais recentes */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {metas.slice(0, 12).map((p) => (
            <button
              key={p.id}
              onClick={() => setDia(p.dataEscala)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                p.dataEscala === dia
                  ? "bg-[#D4AF37] text-[#1a1205]"
                  : "bg-white/5 text-[#94A3B8] hover:bg-white/10 hover:text-white"
              }`}
            >
              {rotuloDia(p.dataEscala)}
            </button>
          ))}
        </div>
      </div>

      {/* a folha */}
      {buscandoFolha ? (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#D4AF37]" />
          <p className="mt-2 text-sm text-[#94A3B8]">Abrindo a escala…</p>
        </div>
      ) : !metaDoDia ? (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-8 text-center">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-[#5b6b85]" />
          <p className="text-sm text-white">Não há escala publicada para este dia.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Use as setas ou os atalhos acima para ir a um dia publicado.
          </p>
          {metas[0] && (
            <button
              onClick={() => setDia(metas[0].dataEscala)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ver a mais recente
            </button>
          )}
        </div>
      ) : pub ? (
        <>
          <FolhaEscalaView
            escala={pub.escala}
            brasoes={pub.brasoes}
            chefe={pub.chefe}
            publicadoEm={pub.publicadoEm}
            publicadoPor={pub.publicadoPor}
          />

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => baixar("pdf")} disabled={baixando !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-50"
            >
              {baixando === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Baixar PDF
            </button>
            <button
              onClick={() => baixar("docx")} disabled={baixando !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-50"
            >
              {baixando === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar Word
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#5b6b85]">
            {metas.length} escala{metas.length > 1 ? "s" : ""} publicada{metas.length > 1 ? "s" : ""} no arquivo.
            Use o calendário para consultar dias anteriores.
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-8 text-center text-sm text-[#94A3B8]">
          Não foi possível abrir esta escala.
        </div>
      )}
    </>
  );
}
