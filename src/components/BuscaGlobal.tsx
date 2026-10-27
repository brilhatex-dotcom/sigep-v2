"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, Loader2, X, Users, ScrollText, Library, LayoutGrid, ArrowRight } from "lucide-react";
import { normalizarBusca } from "@/lib/documentosOficiais";

/* =========================================================================
   BUSCA GLOBAL (topo da tela)

   Antes: Enter levava à lista de efetivo filtrada. Agora acha, enquanto se
   digita, em quatro lugares:
     · Telas do menu de quem está logado ("férias", "escala"...) — aqui mesmo;
     · Militares (admin), Requerimentos e Documentos Oficiais — /api/busca.
   Setas escolhem, Enter abre, Esc fecha. No celular é o ícone da lupa, que
   abre a busca na tela inteira.
   ========================================================================= */

export type TelaBusca = { rotulo: string; href: string };
type Resultado = { titulo: string; sub: string; href: string };
type Grupo = { id: string; titulo: string; Icone: typeof Users; itens: Resultado[] };

export default function BuscaGlobal({ telas = [], admin = false }: { telas?: TelaBusca[]; admin?: boolean }) {
  const [celular, setCelular] = useState(false);
  return (
    <>
      <div className="relative hidden flex-1 md:block md:max-w-xs">
        <CaixaDeBusca telas={telas} admin={admin} />
      </div>
      <button onClick={() => setCelular(true)} aria-label="Buscar"
        className="rounded-lg p-1.5 text-[#cbd5e1] hover:bg-white/5 md:hidden">
        <Search className="h-5 w-5" />
      </button>
      {celular && createPortal(
        <div className="fixed inset-0 z-[110] bg-[#0b1626]/95 p-3 backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 flex-1"><CaixaDeBusca telas={telas} admin={admin} tela onIr={() => setCelular(false)} /></div>
            <button onClick={() => setCelular(false)} aria-label="Fechar" className="rounded-lg p-2 text-[#cbd5e1] hover:bg-white/5">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function CaixaDeBusca({
  telas, admin, tela = false, onIr,
}: { telas: TelaBusca[]; admin: boolean; tela?: boolean; onIr?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(tela);
  const [carregando, setCarregando] = useState(false);
  const [remoto, setRemoto] = useState<{ militares: Resultado[]; requerimentos: Resultado[]; documentos: Resultado[] } | null>(null);
  const [sel, setSel] = useState(0);
  const caixa = useRef<HTMLDivElement | null>(null);
  const termo = q.trim();

  // militares, requerimentos e documentos: no servidor, com um respiro
  useEffect(() => {
    if (termo.length < 2) { setRemoto(null); return; }
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`, { cache: "no-store" });
        const d = await r.json();
        if (vivo && r.ok) setRemoto(d);
      } catch { /* sem rede: fica o que já tinha */ }
      finally { if (vivo) setCarregando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo]);

  // fecha ao clicar fora (na barra do topo)
  useEffect(() => {
    if (tela) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [tela]);

  const grupos = useMemo<Grupo[]>(() => {
    if (termo.length < 2) return [];
    const n = normalizarBusca(termo);
    const telasAchadas = telas
      .filter((t) => normalizarBusca(t.rotulo).includes(n))
      .slice(0, 4)
      .map((t) => ({ titulo: t.rotulo, sub: "Abrir a tela", href: t.href }));
    return [
      { id: "telas", titulo: "Telas", Icone: LayoutGrid, itens: telasAchadas },
      { id: "militares", titulo: "Militares", Icone: Users, itens: remoto?.militares || [] },
      { id: "requerimentos", titulo: "Requerimentos", Icone: ScrollText, itens: remoto?.requerimentos || [] },
      { id: "documentos", titulo: "Documentos oficiais", Icone: Library, itens: remoto?.documentos || [] },
    ].filter((g) => g.itens.length);
  }, [termo, telas, remoto]);

  // "ver todos": a lista completa nas telas próprias
  const atalhos = useMemo<Resultado[]>(() => {
    if (termo.length < 2) return [];
    return [
      ...(admin ? [{ titulo: `Ver todos os militares com “${termo}”`, sub: "", href: `/efetivo?q=${encodeURIComponent(termo)}` }] : []),
      { titulo: `Buscar “${termo}” nos documentos oficiais`, sub: "", href: `/documentos?q=${encodeURIComponent(termo)}` },
    ];
  }, [termo, admin]);

  const lista = useMemo(() => [...grupos.flatMap((g) => g.itens), ...atalhos], [grupos, atalhos]);
  useEffect(() => { setSel(0); }, [termo, remoto]);

  const ir = (href: string) => {
    setAberto(false);
    setQ("");
    onIr?.();
    router.push(href);
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setAberto(false); onIr?.(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && lista[sel]) { e.preventDefault(); ir(lista[sel].href); }
  };

  let indice = -1;
  const linha = (r: Resultado, destaque = false) => {
    indice++;
    const i = indice;
    return (
      <button key={`${r.href}-${i}`} onMouseEnter={() => setSel(i)} onClick={() => ir(r.href)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${sel === i ? "bg-[#D4AF37]/15" : "hover:bg-white/5"}`}>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${destaque ? "text-[#D4AF37]" : "font-medium text-white"}`}>{r.titulo}</span>
          {r.sub && <span className="block truncate text-[11px] text-[#94A3B8]">{r.sub}</span>}
        </span>
        {sel === i && <ArrowRight className="h-4 w-4 shrink-0 text-[#D4AF37]" />}
      </button>
    );
  };

  const mostrar = aberto && termo.length >= 2;

  return (
    <div ref={caixa} className="relative">
      {/* a lupa e o "carregando" ficam presos à caixa de texto, não à lista */}
      <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
      <input
        value={q}
        autoFocus={tela}
        onChange={(e) => { setQ(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onKeyDown={tecla}
        placeholder={admin ? "Buscar militar, requerimento, BG…" : "Buscar tela, requerimento, BG…"}
        className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-8 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#D4AF37]/50"
      />
      {carregando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#94A3B8]" />}
      </div>

      {mostrar && (
        <div className={`${tela ? "mt-3 max-h-[calc(100dvh-5rem)]" : "absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-[min(30rem,90vw)] shadow-2xl"} overflow-auto rounded-xl border border-white/10 bg-[#0F1B2D] p-2`}>
          {grupos.map((g) => (
            <div key={g.id} className="mb-1">
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[#6f82a0]">
                <g.Icone className="h-3.5 w-3.5" /> {g.titulo}
              </p>
              {g.itens.map((r) => linha(r))}
            </div>
          ))}
          {!grupos.length && !carregando && (
            <p className="px-3 py-3 text-sm text-[#94A3B8]">Nada encontrado para “{termo}”.</p>
          )}
          <div className="mt-1 border-t border-white/5 pt-1">
            {atalhos.map((r) => linha(r, true))}
          </div>
        </div>
      )}
    </div>
  );
}
