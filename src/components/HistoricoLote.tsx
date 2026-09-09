"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload, Loader2, Check, X, AlertTriangle, FileText, Users } from "lucide-react";
import { lerArquivoParaHistorico, type Origem } from "@/lib/importarParaHistorico";
import {
  identificacaoDoTexto, casarMilitar,
  type CandidatoMilitar, type DadosHistorico,
} from "@/lib/historicoImportar";
import { confirmar } from "@/components/Avisos";

/* IMPORTAÇÃO EM LOTE — o P/1 joga a pasta inteira de históricos e o sistema
   diz de quem é cada arquivo, pelo ID PMMA e pela matrícula.

   Nada é gravado sem passar por esta tela: cada arquivo aparece com o militar
   que ele encontrou e COMO encontrou. O que não bater fica marcado, com um
   seletor para o P/1 dizer quem é — ou deixar de fora. Adivinhar por nome
   parecido gravaria o histórico de um policial na ficha de outro. */

type Militar = CandidatoMilitar & { nomeGuerra?: string | null };

type Linha = {
  arquivo: string;
  erro?: string;
  dados?: DadosHistorico;
  secoes: number;
  ident: { idPmma: string; matricula: string; rg: string };
  militarId: string;          // vazio = não identificado / a ignorar
  por: "id" | "matricula" | "rg" | "nome" | "mao" | "";
  origem: Origem;
};

const ROTULO_POR: Record<string, string> = {
  id: "pelo ID", matricula: "pela matrícula", rg: "pelo RG", nome: "pelo nome", mao: "escolhido à mão",
};
const nomeDe = (m?: Militar | null) => (m ? [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ") : "");

export default function HistoricoLote({ aoTerminar }: { aoTerminar: () => void }) {
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [lendo, setLendo] = useState(false);
  const [andar, setAndar] = useState("");
  const [gravando, setGravando] = useState(false);
  const [substituir, setSubstituir] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as Militar[])).catch(() => {});
  }, []);

  const porId = useMemo(() => new Map(efetivo.map((m) => [m.id, m])), [efetivo]);

  const escolherArquivos = async (arquivos: FileList | null) => {
    if (!arquivos || !arquivos.length) return;
    setLendo(true); setMsg(""); setLinhas([]);
    const novas: Linha[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      const arq = arquivos[i];
      setAndar(`Lendo ${i + 1} de ${arquivos.length}: ${arq.name}`);
      try {
        const { origem, importacao: lido, texto } = await lerArquivoParaHistorico(arq);
        const ident = identificacaoDoTexto(texto, lido.dados);
        const casou = casarMilitar(ident, efetivo);
        novas.push({
          arquivo: arq.name,
          dados: lido.dados,
          secoes: lido.achadas.length,
          ident,
          militarId: casou?.militar.id || "",
          por: casou?.por || "",
          origem,
          erro: lido.achadas.length === 0 ? "Nenhuma seção reconhecida" : undefined,
        });
      } catch (e: any) {
        novas.push({ arquivo: arq.name, secoes: 0, ident: { idPmma: "", matricula: "", rg: "" }, militarId: "", por: "", origem: "historico", erro: e?.message || "Não consegui ler" });
      }
    }
    setLinhas(novas);
    setAndar("");
    setLendo(false);
  };

  const trocarMilitar = (i: number, id: string) =>
    setLinhas((l) => l.map((x, k) => (k === i ? { ...x, militarId: id, por: id ? "mao" : "" } : x)));

  const prontas = linhas.filter((l) => l.militarId && l.dados && !l.erro);
  const semDono = linhas.filter((l) => !l.militarId && !l.erro);
  const comErro = linhas.filter((l) => l.erro);

  /* Dois arquivos apontando para o mesmo militar quase sempre é engano (uma
     versão antiga e uma nova na mesma pasta). Melhor avisar do que gravar um
     por cima do outro sem o P/1 ver. */
  const repetidos = useMemo(() => {
    const conta = new Map<string, number>();
    for (const l of prontas) conta.set(l.militarId, (conta.get(l.militarId) || 0) + 1);
    return Array.from(conta.entries()).filter(([, n]) => n > 1).map(([id]) => id);
  }, [prontas]);

  const importar = async () => {
    if (!prontas.length) return;
    if (repetidos.length && !await confirmar(
      `${repetidos.length} militar(es) aparecem em mais de um arquivo. O último lido é o que vale.\n\nImportar assim mesmo?`
    )) return;
    setGravando(true); setMsg("");
    try {
      const r = await fetch("/api/historico/lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ substituir, itens: prontas.map((l) => ({ efetivoId: l.militarId, dados: l.dados })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Falha ao importar."); return; }
      setMsg(`✅ ${d.gravados} histórico(s) gravado(s).`);
      setLinhas([]);
      aoTerminar();
    } catch { setMsg("Falha ao importar."); }
    finally { setGravando(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <Users className="h-4 w-4 text-[#D4AF37]" /> Importar vários de uma vez
      </h2>
      <p className="mb-3 text-xs text-[#94A3B8]">
        Escolha os arquivos — históricos prontos (Word ou PDF) ou a Ficha Individual do SGI — e o sistema
        reconhece qual é qual e de quem é cada um, pela matrícula e pelo ID PMMA. Nada é gravado antes de
        você conferir a lista.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
          {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher arquivos
          <input type="file" multiple accept=".docx,.doc,.pdf,.txt" className="hidden" disabled={lendo}
            onChange={(e) => { escolherArquivos(e.target.files); e.currentTarget.value = ""; }} />
        </label>
        {andar && <span className="text-xs text-[#94A3B8]">{andar}</span>}
        {linhas.length > 0 && (
          <button onClick={() => setLinhas([])} className="text-xs text-[#94A3B8] underline hover:text-white">limpar</button>
        )}
      </div>

      {msg && <p className={`mt-3 text-sm ${msg.startsWith("✅") ? "text-emerald-300" : "text-red-300"}`}>{msg}</p>}

      {linhas.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <span className="text-emerald-300">{prontas.length} identificado(s)</span>
            {semDono.length > 0 && <span className="text-amber-300">{semDono.length} sem militar</span>}
            {comErro.length > 0 && <span className="text-red-300">{comErro.length} com erro</span>}
          </div>

          <ul className="mt-3 divide-y divide-white/5 rounded-lg border border-white/10">
            {linhas.map((l, i) => (
              <li key={`${l.arquivo}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                {l.erro
                  ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" />
                  : l.militarId
                    ? <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                    : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />}
                <span className="flex items-center gap-1.5 text-white">
                  <FileText className="h-3.5 w-3.5 text-[#94A3B8]" />
                  <span className="max-w-[220px] truncate" title={l.arquivo}>{l.arquivo}</span>
                </span>

                {l.erro ? (
                  <span className="text-xs text-red-300">{l.erro}</span>
                ) : (
                  <>
                    <span className={`text-xs ${l.origem === "ficha" ? "text-sky-300" : "text-[#7e8b99]"}`}>
                      {l.origem === "ficha" ? "Ficha do SGI" : "Histórico"} · {l.secoes} seções
                    </span>
                    {l.ident.matricula && <span className="text-xs text-[#7e8b99]">mat {l.ident.matricula}</span>}
                    {l.ident.idPmma && <span className="text-xs text-[#7e8b99]">ID {l.ident.idPmma}</span>}
                    <select
                      value={l.militarId}
                      onChange={(e) => trocarMilitar(i, e.target.value)}
                      className="ml-auto max-w-[280px] rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1 text-xs text-white outline-none focus:border-[#D4AF37]/50"
                    >
                      <option value="">— não importar este —</option>
                      {efetivo.map((m) => (
                        <option key={m.id} value={m.id}>
                          {nomeDe(m)}{m.matricula ? ` · mat ${m.matricula}` : ""}
                        </option>
                      ))}
                    </select>
                    {l.por && (
                      <span className={`shrink-0 text-[11px] ${l.por === "nome" ? "text-amber-300" : "text-[#7e8b99]"}`}>
                        {ROTULO_POR[l.por]}
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {repetidos.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {repetidos.length} militar(es) aparecem em mais de um arquivo — confira se não é uma versão antiga na mesma pasta.
            </p>
          )}

          <label className="mt-3 flex items-start gap-2 text-xs text-[#cbd5e1]">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5" />
            <span>
              Substituir o que já está preenchido nas fichas.
              <span className="block text-[11px] text-[#7e8b99]">
                Desmarcado, o arquivo só preenche o que estiver em branco — não apaga nada.
              </span>
            </span>
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button onClick={importar} disabled={gravando || prontas.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
              {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Importar {prontas.length} histórico(s)
            </button>
            {(semDono.length > 0 || comErro.length > 0) && (
              <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8]">
                <X className="h-3.5 w-3.5" /> {semDono.length + comErro.length} ficam de fora
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
