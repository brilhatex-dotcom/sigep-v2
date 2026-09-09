"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Save, FileDown, FileType2, Loader2, Check, Sparkles, ArrowLeft, Clock, Upload, X } from "lucide-react";
import {
  SECOES, CAMPOS_PESSOAIS, CAMPOS_FUNCIONAIS, rotulosFormacao,
  VAZIO, type DadosHistorico,
} from "@/lib/historicoPolicial";
import { importarHistorico, juntar, type Importacao } from "@/lib/historicoImportar";
import { lerTextoDoArquivo } from "@/lib/lerArquivoTexto";
import { classificarPatente } from "@/lib/patentes";

/* HISTÓRICO POLICIAL MILITAR — tela de alimentação.

   O histórico é um documento de boletim: cada seção é texto transcrito
   ("BG nº 134 de 22/07/2022, publicou que foi promovido…"). Então a tela é
   uma caixa de texto por seção, e não um formulário de campos — é o que
   deixa o P/1 escrever exatamente o que o papel precisa.

   O que o SIGEP já sabe entra de dois jeitos:
   - Dados pessoais e funcionais: preenchidos da ficha, editáveis por cima.
   - Promoções, férias, licença-prêmio e JMS: viram SUGESTÕES, que o P/1
     acrescenta com um clique e completa com o número do boletim. */

type Militar = { id: string; postoGrad?: string | null; nome?: string | null; nomeGuerra?: string | null; matricula?: string | null };
type Sugestao = { chave: string; rotulo: string; linhas: string[] };
type Resumo = { efetivoId: string; nome: string; postoGrad: string; atualizadoEm: string; atualizadoPor: string };

const nomeDe = (m: Militar) => [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ");
const brDataHora = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function HistoricoClient() {
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Militar | null>(null);

  const [dados, setDados] = useState<DadosHistorico>(VAZIO);
  const [ficha, setFicha] = useState<Record<string, string>>({});
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [comecados, setComecados] = useState<Resumo[]>([]);
  const [atualizado, setAtualizado] = useState<{ em: string; por: string } | null>(null);

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState<"docx" | "pdf" | null>(null);
  const [msg, setMsg] = useState("");
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as Militar[])).catch(() => {});
  }, []);

  const carregarLista = useCallback(() => {
    fetch("/api/historico").then((r) => (r.ok ? r.json() : null))
      .then((d) => setComecados(Array.isArray(d?.itens) ? d.itens : [])).catch(() => {});
  }, []);
  useEffect(() => { carregarLista(); }, [carregarLista]);

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return efetivo.filter((m) =>
      (nomeDe(m) + " " + (m.nome || "") + " " + (m.matricula || "")).toLowerCase().includes(t)
    ).slice(0, 8);
  }, [busca, efetivo]);

  const abrir = async (m: Militar) => {
    setSel(m); setBusca(""); setMsg(""); setSujo(false); setCarregando(true);
    try {
      const r = await fetch(`/api/historico?id=${encodeURIComponent(m.id)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Falha ao carregar."); return; }
      setDados(d.dados || VAZIO);
      setFicha(d.ficha || {});
      setSugestoes(Array.isArray(d.sugestoes) ? d.sugestoes : []);
      setAtualizado(d.atualizadoEm ? { em: d.atualizadoEm, por: d.atualizadoPor || "" } : null);
    } catch { setMsg("Falha ao carregar."); }
    finally { setCarregando(false); }
  };

  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    setSel(null); setDados(VAZIO); setFicha({}); setSugestoes([]); setMsg(""); setSujo(false);
  };

  const mudarCampo = (chave: string, v: string) => {
    setDados((d) => ({ ...d, campos: { ...d.campos, [chave]: v } }));
    setSujo(true); setMsg("");
  };
  const mudarSecao = (chave: string, v: string) => {
    setDados((d) => ({ ...d, secoes: { ...d.secoes, [chave]: v } }));
    setSujo(true); setMsg("");
  };
  /* A sugestão é ACRESCENTADA ao fim do que já existe — nunca substitui o que
     o P/1 escreveu. */
  const acrescentar = (chave: string, linhas: string[]) => {
    setDados((d) => {
      const atual = (d.secoes[chave] || "").replace(/\s+$/, "");
      const novas = linhas.filter((l) => !atual.includes(l.split(",")[0]));
      if (!novas.length) return d;
      return { ...d, secoes: { ...d.secoes, [chave]: [atual, ...novas].filter(Boolean).join("\n") } };
    });
    setSujo(true); setMsg("");
  };

  /* ---------------------------------------------------- importar arquivo */
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<Importacao | null>(null);
  const [substituir, setSubstituir] = useState(false);

  /* O arquivo é lido AQUI, no navegador, e só o resultado entra no formulário
     — nada sobe para o servidor. Um histórico traz dados pessoais e punições
     de um policial; quanto menos ele viajar, melhor. */
  const escolherArquivo = async (arquivo: File | null | undefined) => {
    if (!arquivo) return;
    setLendo(true); setMsg(""); setPrevia(null);
    try {
      const texto = await lerTextoDoArquivo(arquivo);
      const lido = importarHistorico(texto);
      if (lido.achadas.length === 0) {
        setMsg("Não reconheci nenhuma seção neste arquivo. Ele é mesmo um Histórico Policial Militar no modelo do 18º BPM?");
        return;
      }
      setPrevia(lido);
      setSubstituir(false);
    } catch (e: any) {
      setMsg(e?.message || "Não consegui ler este arquivo.");
    } finally { setLendo(false); }
  };

  const aplicarImportacao = () => {
    if (!previa) return;
    setDados((d) => juntar(d, previa.dados, substituir));
    setPrevia(null);
    setSujo(true);
    setMsg("✅ Arquivo importado. Confira as seções e clique em Salvar.");
  };

  const salvar = async () => {
    if (!sel) return;
    setSalvando(true); setMsg("");
    try {
      const r = await fetch(`/api/historico?id=${encodeURIComponent(sel.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Falha ao salvar."); return; }
      setMsg("✅ Histórico salvo.");
      setSujo(false);
      carregarLista();
    } catch { setMsg("Falha ao salvar."); }
    finally { setSalvando(false); }
  };

  /* Gerar lê o que está SALVO — então salva antes, para o arquivo nunca sair
     diferente do que está na tela. */
  const gerar = async (fmt: "docx" | "pdf") => {
    if (!sel) return;
    setBaixando(fmt); setMsg("");
    try {
      if (sujo) {
        await fetch(`/api/historico?id=${encodeURIComponent(sel.id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dados }),
        });
        setSujo(false);
      }
      const r = await fetch(`/api/historico/exportar?id=${encodeURIComponent(sel.id)}&fmt=${fmt}`);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historico-${(sel.nomeGuerra || sel.nome || "militar").replace(/\W+/g, "_")}.${fmt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      carregarLista();
    } catch { setMsg("Não foi possível gerar o arquivo."); }
    finally { setBaixando(null); }
  };

  /* ------------------------------------------------------------ busca */
  if (!sel) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
          <label className="mb-1 block text-xs text-[#94A3B8]">Militar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar militar por nome ou matrícula..."
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
          </div>
          {busca.trim() !== "" && (
            <div className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0b1626]">
              {resultados.length === 0 ? <div className="px-3 py-2 text-xs text-[#94A3B8]">Nenhum militar.</div> :
                resultados.map((m) => (
                  <button key={m.id} onClick={() => abrir(m)}
                    className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                    {nomeDe(m)} {m.matricula && <span className="text-xs text-[#94A3B8]">mat {m.matricula}</span>}
                  </button>
                ))}
            </div>
          )}
          <p className="mt-2 text-xs text-[#94A3B8]">
            Os dados pessoais e funcionais saem da ficha. As promoções, férias, licença-prêmio e JMS que já estão
            no SIGEP aparecem como sugestão, para você completar com o número do boletim.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Clock className="h-4 w-4 text-[#D4AF37]" /> Históricos já começados
          </h2>
          {comecados.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">Nenhum ainda. Busque um militar acima para começar.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {comecados.map((h) => (
                <li key={h.efetivoId}>
                  <button onClick={() => abrir({ id: h.efetivoId, nome: h.nome, postoGrad: h.postoGrad })}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left text-sm hover:bg-white/[0.03]">
                    <span className="font-medium text-white">{[h.postoGrad, h.nome].filter(Boolean).join(" ") || h.efetivoId}</span>
                    <span className="ml-auto text-xs text-[#7e8b99]">
                      atualizado em {brDataHora(h.atualizadoEm)}{h.atualizadoPor ? ` por ${h.atualizadoPor}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ edição */
  const posto = ficha.postoGrad || sel.postoGrad || "";
  const oficial = classificarPatente(posto).ordem <= 7;
  const formacao = rotulosFormacao(posto);
  const sugestaoDe = (chave: string) => sugestoes.find((s) => s.chave === chave);

  /* FUNÇÕES que devolvem JSX, não componentes.

     Como componentes declarados aqui dentro, cada tecla digitada criaria um
     tipo novo, o React remontaria a caixa e o cursor sairia do campo a cada
     letra. Chamadas como função, o JSX entra direto na árvore e o campo fica
     onde está. */
  const sugerir = (chave: string) => {
    const s = sugestaoDe(chave);
    if (!s) return null;
    return (
      <button onClick={() => acrescentar(chave, s.linhas)}
        title={`Acrescenta ${s.linhas.length} linha(s) do que o SIGEP já sabe. Você completa o boletim.`}
        className="inline-flex items-center gap-1 rounded border border-[#D4AF37]/40 px-2 py-0.5 text-[11px] text-[#D4AF37] transition hover:bg-[#D4AF37]/10">
        <Sparkles className="h-3 w-3" /> {s.rotulo} ({s.linhas.length})
      </button>
    );
  };

  const caixa = (chave: string, rotulo: string, dica?: string, linhas = 4) => (
    <div key={chave} className="mb-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-[#cbd5e1]">{rotulo}</label>
        {sugerir(chave)}
      </div>
      <textarea
        value={dados.secoes[chave] || ""}
        onChange={(e) => mudarSecao(chave, e.target.value)}
        rows={linhas}
        placeholder={dica}
        className="w-full resize-y rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-[#D4AF37]/50"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* barra de comando */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0F1B2D] p-3">
        <button onClick={fechar} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-[#94A3B8] transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Trocar militar
        </button>
        <span className="text-sm font-semibold text-white">{[posto, ficha.nome || sel.nome].filter(Boolean).join(" ")}</span>
        {atualizado && (
          <span className="text-xs text-[#7e8b99]">salvo em {brDataHora(atualizado.em)}{atualizado.por ? ` por ${atualizado.por}` : ""}</span>
        )}
        <span className="ml-auto" />
        {sujo && <span className="text-xs text-amber-300">alterações não salvas</span>}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5">
          {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar arquivo
          <input type="file" accept=".docx,.doc,.pdf,.txt" className="hidden" disabled={lendo}
            onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
        <button onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
        <button onClick={() => gerar("docx")} disabled={baixando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
          {baixando === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType2 className="h-4 w-4" />} Word
        </button>
        <button onClick={() => gerar("pdf")} disabled={baixando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
          {baixando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.startsWith("✅") ? "text-emerald-300" : "text-red-300"}`}>{msg}</p>}

      {/* Conferência antes de aplicar: o arquivo nunca entra sozinho. */}
      {previa && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setPrevia(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0F1B2D]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Upload className="h-4 w-4 text-[#D4AF37]" />
              <h3 className="text-sm font-semibold text-white">O que o arquivo trouxe</h3>
              <button onClick={() => setPrevia(null)} className="ml-auto rounded p-1 text-[#94A3B8] hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              <p className="mb-3 text-xs text-[#94A3B8]">
                {previa.achadas.length} seç{previa.achadas.length === 1 ? "ão reconhecida" : "ões reconhecidas"} ·{" "}
                {Object.keys(previa.dados.campos).length} campo(s) de identificação.
              </p>
              <ul className="mb-4 grid gap-1 sm:grid-cols-2">
                {previa.achadas.map((a) => (
                  <li key={a.secao} className="flex items-center gap-2 text-xs text-white">
                    <span className="w-10 shrink-0 text-right font-semibold text-[#D4AF37]">{a.secao}</span>
                    <span className="truncate">{a.titulo}</span>
                    <span className="ml-auto shrink-0 text-[#7e8b99]">{a.tamanho} linha(s)</span>
                  </li>
                ))}
              </ul>

              {previa.ignoradas.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-300">
                    {previa.ignoradas.length} linha(s) que não entraram em nenhuma seção
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-[#cbd5e1]">
                    {previa.ignoradas.slice(0, 8).map((l, i) => <li key={i} className="truncate">{l}</li>)}
                  </ul>
                  <p className="mt-1 text-[11px] text-[#7e8b99]">Confira se falta algo e lance à mão depois de importar.</p>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-[#cbd5e1]">
                <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5" />
                <span>
                  Substituir o que já está preenchido.
                  <span className="block text-[11px] text-[#7e8b99]">
                    Desmarcado, o arquivo só preenche o que estiver em branco — não apaga nada que você já escreveu.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button onClick={() => setPrevia(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] hover:text-white">Cancelar</button>
              <button onClick={aplicarImportacao} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] hover:brightness-110">
                <Check className="h-4 w-4" /> Trazer para o formulário
              </button>
            </div>
          </div>
        </div>
      )}
      {carregando && <p className="flex items-center gap-2 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}

      {!carregando && (
        <>
          {/* I e II: campos. O que a ficha responde vem preenchido. */}
          {[
            { num: "I", titulo: "DADOS PESSOAIS", campos: CAMPOS_PESSOAIS },
            { num: "II", titulo: "DADOS FUNCIONAIS", campos: CAMPOS_FUNCIONAIS },
          ].map((bloco) => (
            <section key={bloco.num} className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
              <h2 className="mb-3 rounded bg-white/10 px-3 py-1.5 text-center text-sm font-bold text-white">
                {bloco.num} – {bloco.titulo}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {bloco.campos.filter((c) => !(c.seOficial && !oficial) && !(c.sePraca && oficial)).map((c) => (
                  <div key={c.chave}>
                    <label className="mb-1 block text-xs text-[#94A3B8]">
                      {c.rotulo}
                      {c.daFicha && ficha[c.chave] && <span className="ml-1 text-[10px] text-[#D4AF37]">da ficha</span>}
                    </label>
                    <input
                      value={dados.campos[c.chave] ?? ""}
                      onChange={(e) => mudarCampo(c.chave, e.target.value)}
                      placeholder={ficha[c.chave] ? ficha[c.chave].replace(/\n/g, " · ") : "—"}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none placeholder:text-[#5c6b80] focus:border-[#D4AF37]/50"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#7e8b99]">
                O texto em cinza é o que sai da ficha. Escreva por cima só se quiser mudar naquele histórico.
              </p>
            </section>
          ))}

          {/* III em diante: texto por seção. */}
          {SECOES.filter((s) => s.num !== "I" && s.num !== "II").map((sec) => (
            <section key={sec.num} className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
              <h2 className="mb-3 rounded bg-white/10 px-3 py-1.5 text-center text-sm font-bold text-white">
                {sec.num} – {sec.titulo}
              </h2>
              {sec.itens ? sec.itens.map((it, i) => caixa(
                `${sec.num}.${it.chave}`,
                `${"abcdefghij"[i]}) ${sec.num === "III" && i < 3 ? formacao[i] : it.rotulo}`,
                it.padrao,
                it.chave === "outros" || it.chave === "ferias" ? 5 : 3,
              )) : caixa(sec.num, "Conteúdo", "Sem alterações.", sec.num === "XIV" || sec.num === "XV" ? 8 : 4)}
            </section>
          ))}

          {/* rodapé do documento */}
          <section className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Rodapé do documento</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[#94A3B8]">Data do documento</label>
                <input type="date" value={dados.dataDoc || ""} onChange={(e) => setDados((d) => { setSujo(true); return { ...d, dataDoc: e.target.value }; })}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                <p className="mt-1 text-xs text-[#7e8b99]">Em branco = a data em que o histórico for gerado.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#94A3B8]">Quem assina</label>
                <input value={dados.chefe || ""} onChange={(e) => setDados((d) => { setSujo(true); return { ...d, chefe: e.target.value }; })}
                  placeholder="Chefe do P/1 configurado na Escala"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white outline-none placeholder:text-[#5c6b80] focus:border-[#D4AF37]/50" />
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 pb-6">
            <button onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar histórico
            </button>
          </div>
        </>
      )}
    </div>
  );
}
