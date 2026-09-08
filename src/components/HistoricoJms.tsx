"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Stethoscope, Loader2, Trash2, RefreshCw, Inbox } from "lucide-react";

/* Aba EMITIDOS da tela Guia JMS e Ofício: o que já foi feito, agrupado por
   mês. O mês vem fechado, mostrando só quantos foram; clicando, abre a lista
   com o nome de cada militar — é assim que o P/1 confere "o ofício do Cb
   Moura eu fiz semana passada?".

   O mês corrente já nasce aberto, que é o que quase sempre se quer ver. */

type Item = {
  id: string; tipo: "oficio" | "guia";
  idPmma: string; nome: string; postoGrad: string;
  numero: string; ano: string; dataJms: string;
  criadoEm: string; criadoPor: string;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1] || "?"} de ${chave.slice(0, 4)}`;
const brData = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const mesAtual = () => new Date().toISOString().slice(0, 7);

type Filtro = "todos" | "oficio" | "guia";

export default function HistoricoJms() {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set([mesAtual()]));
  const [apagando, setApagando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true); setErro("");
    fetch("/api/jms/emitidos")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Falha ao carregar.");
        setItens(Array.isArray(d?.itens) ? d.itens : []);
      })
      .catch((e) => setErro(e.message || "Falha ao carregar."))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const porMes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const visiveis = itens
      .filter((i) => filtro === "todos" || i.tipo === filtro)
      .filter((i) => !t || `${i.postoGrad} ${i.nome} ${i.numero}`.toLowerCase().includes(t));
    const mapa = new Map<string, Item[]>();
    for (const i of visiveis) {
      const chave = (i.criadoEm || "").slice(0, 7) || "sem-data";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(i);
    }
    return Array.from(mapa.keys()).sort((a, b) => b.localeCompare(a)).map((mes) => ({
      mes,
      itens: mapa.get(mes)!.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")),
    }));
  }, [itens, filtro, busca]);

  /* Procurar um nome não adianta se o mês dele estiver fechado: com busca
     ativa todos os meses aparecem abertos. */
  const buscando = busca.trim() !== "";
  const estaAberto = (mes: string) => buscando || abertos.has(mes);
  const alternar = (mes: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(mes)) n.delete(mes); else n.add(mes);
      return n;
    });

  const apagar = async (i: Item) => {
    if (i.tipo !== "oficio") return;
    if (!confirm(`Apagar o registro do ofício de ${i.postoGrad} ${i.nome}?\n\nO documento em si não é apagado — só sai desta lista.`)) return;
    setApagando(i.id);
    try {
      const r = await fetch(`/api/jms/emitidos?id=${encodeURIComponent(i.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItens((l) => l.filter((x) => x.id !== i.id));
    } catch { alert("Não foi possível apagar."); }
    finally { setApagando(null); }
  };

  const Chip = ({ id, rotulo }: { id: Filtro; rotulo: string }) => (
    <button
      onClick={() => setFiltro(id)}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        filtro === id ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/10 text-[#94A3B8] hover:text-white"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip id="todos" rotulo="Todos" />
        <Chip id="oficio" rotulo="Ofícios" />
        <Chip id="guia" rotulo="Guias" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar pelo nome…"
          className="ml-auto w-56 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        />
        <button onClick={carregar} title="Atualizar" className="rounded-lg border border-white/10 p-1.5 text-[#94A3B8] transition hover:text-white">
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
        </button>
      </div>

      {carregando ? (
        <p className="flex items-center gap-2 py-8 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : erro ? (
        <p className="py-8 text-sm text-red-300">{erro}</p>
      ) : porMes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-9 w-9 text-[#94A3B8]/40" />
          <p className="text-sm text-[#94A3B8]">
            {itens.length === 0 ? "Nada emitido ainda." : "Nenhum documento com esse filtro."}
          </p>
          {itens.length === 0 && (
            <p className="max-w-md text-xs text-[#7e8b99]">
              O ofício entra aqui sozinho quando você imprime ou baixa. A guia entra quando é registrada
              (o botão que consome o número).
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {porMes.map((g) => {
            const aberto = estaAberto(g.mes);
            return (
              <li key={g.mes} className="overflow-hidden rounded-lg border border-white/10">
                <button
                  onClick={() => alternar(g.mes)}
                  className="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 text-[#D4AF37] transition-transform ${aberto ? "rotate-90" : ""}`} />
                  {/* só a inicial: `capitalize` deixaria "Setembro De 2026" */}
                  <span className="text-sm font-semibold text-white first-letter:uppercase">
                    {g.mes === "sem-data" ? "Sem data" : mesPorExtenso(g.mes)}
                  </span>
                  <span className="ml-auto rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-xs font-semibold text-[#D4AF37]">
                    {g.itens.length}
                  </span>
                </button>

                {aberto && (
                  <ul className="divide-y divide-white/5">
                    {g.itens.map((i) => {
                      const Icone = i.tipo === "oficio" ? FileText : Stethoscope;
                      return (
                        <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                          <Icone className={`h-4 w-4 shrink-0 ${i.tipo === "oficio" ? "text-sky-300" : "text-emerald-300"}`} />
                          <span className="font-medium text-white">
                            {[i.postoGrad, i.nome].filter(Boolean).join(" ") || "—"}
                          </span>
                          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-[#94A3B8]">
                            {i.tipo === "oficio" ? "Ofício" : "Guia"}
                            {i.numero ? ` nº ${i.numero}${i.ano ? `/${i.ano}` : ""}` : ""}
                          </span>
                          {i.dataJms && <span className="text-xs text-[#94A3B8]">JMS em {brData(i.dataJms)}</span>}
                          <span className="ml-auto text-xs text-[#7e8b99]">
                            feito em {brData(i.criadoEm)}{i.criadoPor ? ` por ${i.criadoPor}` : ""}
                          </span>
                          {i.tipo === "oficio" && (
                            <button
                              onClick={() => apagar(i)}
                              disabled={apagando === i.id}
                              title="Apagar este registro da lista"
                              className="rounded p-1 text-[#94A3B8] transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                            >
                              {apagando === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
