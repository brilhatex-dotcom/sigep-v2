"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileBadge, ChevronDown, ChevronUp, Loader2, FileText, FileStack, Trash2, Paperclip,
  Users, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { BuscaMilitar } from "@/components/docs/Comum";
import { avisar, confirmar } from "@/components/Avisos";

/* =========================================================================
   CERTIDÃO DO P/1 — oficiais (Portaria nº 040/2026-GCG, Of. Circ. 003/2026-CAE)

   O P/1 põe na lista os policiais (um a um, ou "os oficiais do período") e o
   sistema faz, para CADA UM:
     · a certidão do P/1, numerada em sequência (002/2026, 003/2026...);
     · o PDF ÚNICO que vai para o SEI: a certidão + as certidões das regiões
       que o militar mandou pelo sistema (na ordem oficial) + o que o P/1
       anexar aqui na hora — já com o nome do policial no arquivo.

   A Justiça Federal muda com o posto: oficial apresenta da 1ª à 6ª Região;
   praça, da 1ª à 5ª.

   A junção acontece NO NAVEGADOR (pdf-lib): os PDFs descem direto do R2 para
   o computador do P/1. Pela Vercel não daria — ela corta resposta acima de
   ~4,5 MB, e nove certidões digitalizadas passam disso fácil.
   ========================================================================= */

type Linha = {
  efetivoId: string;
  postoGrad: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
  quadro: string;
  oficial: boolean;
  arquivo: string;
  numero: string | null;
  data: string | null;
  exigidas: { ordem: number; rotulo: string }[];
  enviadas: number[];
};
type Resposta = {
  periodo: { id: string; nome: string };
  portaria: string;
  ano: number;
  proximo: number;
  hoje: string;
  oficiaisDoPeriodo: string[];
  linhas: Linha[];
};

function salvarArquivo(dados: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(dados);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function faltamDe(l: Linha): string[] {
  return l.exigidas.filter((c) => !l.enviadas.includes(c.ordem)).map((c) => c.rotulo);
}

export default function CertidaoP1Painel() {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // ids postos na lista que ainda não têm certidão emitida
  const [pendentes, setPendentes] = useState<string[]>([]);
  // desmarcados (o padrão é todo mundo marcado)
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  // PDFs que o P/1 anexou aqui, por militar (entram no fim do arquivo único)
  const [anexos, setAnexos] = useState<Record<string, File[]>>({});
  const [data, setData] = useState("");
  const [portaria, setPortaria] = useState("");
  const [proximo, setProximo] = useState("");
  const [ocupado, setOcupado] = useState("");

  const carregar = useCallback(async (ids: string[]): Promise<Resposta | null> => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/promocoes/certidao-p1?ids=${encodeURIComponent(ids.join(","))}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao carregar."); return null; }
      setDados(d as Resposta);
      setPortaria(d.portaria);
      setProximo(String(d.proximo));
      setData((v) => v || d.hoje);
      return d as Resposta;
    } catch {
      setErro("Erro de conexão.");
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (aberto && !dados) carregar(pendentes); }, [aberto, dados, carregar, pendentes]);

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const marcadas = useMemo(() => linhas.filter((l) => !desmarcados.has(l.efetivoId)), [linhas, desmarcados]);
  const naLista = useMemo(() => new Set(linhas.map((l) => l.efetivoId)), [linhas]);

  function adicionar(ids: string[]) {
    const novos = ids.filter((id) => !naLista.has(id) && !pendentes.includes(id));
    if (!novos.length) return;
    const todos = [...pendentes, ...novos];
    setPendentes(todos);
    carregar(todos);
  }

  async function salvarConfig(patch: { portaria?: string; proximo?: number }) {
    await fetch("/api/promocoes/certidao-p1", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "config", ...patch }),
    }).catch(() => {});
  }

  async function removerLinha(l: Linha) {
    if (l.numero) {
      if (!await confirmar(
        `Tirar ${l.postoGrad} ${l.nomeGuerra || l.nome} da lista?\n\n` +
        `A certidão nº ${l.numero} deixa de existir no sistema e esse número não volta a ser usado.`
      )) return;
      await fetch("/api/promocoes/certidao-p1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "remover", efetivoId: l.efetivoId }),
      }).catch(() => {});
    }
    const resto = pendentes.filter((id) => id !== l.efetivoId);
    setPendentes(resto);
    carregar(resto);
  }

  /* Numera quem ainda não tem (na ordem de antiguidade) e devolve as linhas
     atualizadas — os downloads sempre partem daqui. */
  async function garantirEmitidas(alvo: Linha[]): Promise<Linha[]> {
    const semNumero = alvo.filter((l) => !l.numero).map((l) => l.efetivoId);
    if (!semNumero.length) return alvo;
    const r = await fetch("/api/promocoes/certidao-p1", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "emitir", efetivoIds: semNumero, data }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Falha ao numerar as certidões.");
    // quem foi numerado passa a vir do servidor; os outros da lista continuam
    const resto = pendentes.filter((id) => !semNumero.includes(id));
    setPendentes(resto);
    const novo = await carregar(resto);
    const porId = new Map((novo?.linhas ?? []).map((l) => [l.efetivoId, l]));
    return alvo.map((l) => porId.get(l.efetivoId) ?? l);
  }

  async function baixarBytes(url: string): Promise<ArrayBuffer> {
    const r = await fetch(url);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `Falha ao baixar (${r.status}).`);
    }
    return r.arrayBuffer();
  }

  // certidão do P/1 + certidões das regiões (sistema) + anexos daqui -> 1 PDF
  async function montarUnificado(l: Linha): Promise<Uint8Array> {
    const { PDFDocument } = await import("pdf-lib");
    const final = await PDFDocument.create();
    const juntar = async (buf: ArrayBuffer, origem: string) => {
      let doc;
      try { doc = await PDFDocument.load(buf, { ignoreEncryption: true }); }
      catch { throw new Error(`${origem} não é um PDF que dê para abrir.`); }
      const paginas = await final.copyPages(doc, doc.getPageIndices());
      paginas.forEach((p) => final.addPage(p));
    };

    const id = encodeURIComponent(l.efetivoId);
    await juntar(await baixarBytes(`/api/promocoes/certidao-p1/documento?efetivoId=${id}&formato=pdf`), "A certidão do P/1");

    const lista = await fetch(`/api/promocoes/certidao-p1/arquivos?efetivoId=${id}`).then((r) => r.json());
    for (const a of (lista?.arquivos ?? []) as { ordem: number; rotulo: string; url: string }[]) {
      let buf: ArrayBuffer;
      try {
        buf = await baixarBytes(a.url);           // direto do R2
      } catch {
        buf = await baixarBytes(`/api/promocoes/certidao-p1/arquivos?efetivoId=${id}&ordem=${a.ordem}`);
      }
      await juntar(buf, a.rotulo);
    }

    for (const f of anexos[l.efetivoId] ?? []) await juntar(await f.arrayBuffer(), `O anexo "${f.name}"`);
    final.setTitle(l.arquivo);
    return final.save();
  }

  // avisa antes de gerar quem ainda não tem todas as certidões no sistema
  async function conferirFaltas(alvo: Linha[]): Promise<boolean> {
    const com = alvo
      .map((l) => ({ l, faltam: faltamDe(l) }))
      .filter((x) => x.faltam.length && !(anexos[x.l.efetivoId]?.length));
    if (!com.length) return true;
    return confirmar(
      "Estes ainda não têm todas as certidões no sistema (nem anexo aqui):\n\n" +
      com.slice(0, 12).map((x) => `• ${x.l.postoGrad} ${x.l.nomeGuerra || x.l.nome}: falta ${x.faltam.length}`).join("\n") +
      (com.length > 12 ? `\n… e mais ${com.length - 12}` : "") +
      "\n\nGerar mesmo assim, só com o que já chegou?"
    );
  }

  async function gerarUnificados(alvo: Linha[]) {
    if (!alvo.length) { avisar("Marque ao menos um policial."); return; }
    if (!await conferirFaltas(alvo)) return;
    setErro("");
    try {
      setOcupado("Numerando as certidões…");
      const prontas = await garantirEmitidas(alvo);
      const arquivos: { nome: string; bytes: Uint8Array }[] = [];
      for (const [i, l] of prontas.entries()) {
        setOcupado(`Juntando ${i + 1} de ${prontas.length}: ${l.postoGrad} ${l.nomeGuerra || l.nome}…`);
        try {
          arquivos.push({ nome: `${l.arquivo}.pdf`, bytes: await montarUnificado(l) });
        } catch (e) {
          throw new Error(`${l.postoGrad} ${l.nomeGuerra || l.nome}: ${(e as Error).message}`);
        }
      }
      if (arquivos.length === 1) {
        salvarArquivo(new Blob([arquivos[0].bytes as BlobPart], { type: "application/pdf" }), arquivos[0].nome);
      } else {
        setOcupado("Fechando o .zip…");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const a of arquivos) zip.file(a.nome, a.bytes);
        salvarArquivo(await zip.generateAsync({ type: "blob" }), `Certidoes P1 - ${dados?.periodo.nome || "promocao"}.zip`);
      }
    } catch (e) {
      setErro((e as Error).message || "Falha ao gerar.");
    } finally {
      setOcupado("");
    }
  }

  async function gerarWord(alvo: Linha[]) {
    if (!alvo.length) { avisar("Marque ao menos um policial."); return; }
    setErro("");
    try {
      setOcupado("Numerando as certidões…");
      const prontas = await garantirEmitidas(alvo);
      const arquivos: { nome: string; dados: ArrayBuffer }[] = [];
      for (const [i, l] of prontas.entries()) {
        setOcupado(`Certidão ${i + 1} de ${prontas.length}…`);
        arquivos.push({
          nome: `Certidao P1 - ${l.arquivo}.docx`,
          dados: await baixarBytes(`/api/promocoes/certidao-p1/documento?efetivoId=${encodeURIComponent(l.efetivoId)}&formato=docx`),
        });
      }
      const tipo = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (arquivos.length === 1) {
        salvarArquivo(new Blob([arquivos[0].dados], { type: tipo }), arquivos[0].nome);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const a of arquivos) zip.file(a.nome, a.dados);
        salvarArquivo(await zip.generateAsync({ type: "blob" }), `Certidoes P1 (Word) - ${dados?.periodo.nome || "promocao"}.zip`);
      }
    } catch (e) {
      setErro((e as Error).message || "Falha ao gerar.");
    } finally {
      setOcupado("");
    }
  }

  const oficiaisFora = (dados?.oficiaisDoPeriodo ?? []).filter((id) => !naLista.has(id));

  return (
    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#0F1B2D] text-white">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <FileBadge className="h-6 w-6 shrink-0 text-[#D4AF37]" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Certidão do P/1 — Oficiais (Portaria nº 040/2026-GCG)</p>
          <p className="text-xs text-[#94A3B8]">
            Escolha os policiais: o sistema faz a certidão numerada de cada um e junta com as certidões das regiões
            num PDF só, já com o nome do policial. Oficial: TRF da 1ª à <b className="text-[#D4AF37]">6ª</b> Região; praça: da 1ª à 5ª.
          </p>
        </div>
        {dados && linhas.length > 0 && (
          <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-xs text-[#94A3B8] sm:inline">
            {linhas.length} na lista
          </span>
        )}
        {aberto ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-white/10 p-4">
          {carregando && !dados && (
            <p className="flex items-center gap-2 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          )}

          {dados && (
            <>
              {/* ---- texto e numeração ---- */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Portaria citada no texto</span>
                  <input value={portaria} onChange={(e) => setPortaria(e.target.value)}
                    onBlur={() => { if (portaria.trim() && portaria !== dados.portaria) salvarConfig({ portaria }); }}
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Próximo nº ({dados.ano})</span>
                  <input type="number" min={1} value={proximo} onChange={(e) => setProximo(e.target.value)}
                    onBlur={() => { const n = Number(proximo); if (Number.isInteger(n) && n > 0 && n !== dados.proximo) salvarConfig({ proximo: n }); }}
                    className="w-28 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Data das novas</span>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </label>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Quem já tem certidão fica com o número e a data dela — baixar de novo sai igual. O próximo número só
                anda quando sai uma certidão nova (ajuste se já emitiu alguma à mão).
              </p>

              {/* ---- quem entra ---- */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <BuscaMilitar sel={null} onEscolher={(m) => adicionar([m.id])} onLimpar={() => {}} rotulo="Adicionar policial" />
                <button onClick={() => adicionar(oficiaisFora)} disabled={!oficiaisFora.length || carregando}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-2 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-40">
                  <Users className="h-4 w-4" /> Oficiais do período ({oficiaisFora.length})
                </button>
              </div>

              {/* ---- lista ---- */}
              {linhas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-[#94A3B8]">
                  Ninguém na lista ainda. Busque o policial acima ou traga os oficiais do período.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                        <th className="px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-[#D4AF37]"
                            checked={marcadas.length === linhas.length}
                            onChange={(e) => setDesmarcados(e.target.checked ? new Set() : new Set(linhas.map((l) => l.efetivoId)))} />
                        </th>
                        <th className="px-3 py-2 font-semibold">Policial</th>
                        <th className="px-3 py-2 font-semibold">Certidão</th>
                        <th className="px-3 py-2 font-semibold">Regiões no sistema</th>
                        <th className="px-3 py-2 font-semibold">Anexar aqui</th>
                        <th className="px-3 py-2 font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {linhas.map((l) => {
                        const faltam = faltamDe(l);
                        const extras = anexos[l.efetivoId] ?? [];
                        return (
                          <tr key={l.efetivoId} className="align-top hover:bg-white/5">
                            <td className="px-3 py-2.5">
                              <input type="checkbox" className="h-4 w-4 accent-[#D4AF37]"
                                checked={!desmarcados.has(l.efetivoId)}
                                onChange={(e) => setDesmarcados((s) => {
                                  const n = new Set(s);
                                  if (e.target.checked) n.delete(l.efetivoId); else n.add(l.efetivoId);
                                  return n;
                                })} />
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="block font-medium text-white">{l.postoGrad} {l.nomeGuerra || l.nome}</span>
                              <span className="block text-[11px] text-[#94A3B8]">
                                {l.nome}{l.quadro ? ` · ${l.quadro}` : ""} · {l.oficial ? "oficial (1ª–6ª Região)" : "praça (1ª–5ª Região)"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {l.numero ? (
                                <span className="font-medium text-white">nº {l.numero}</span>
                              ) : (
                                <span className="text-xs text-[#94A3B8]">sai ao gerar</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5" title={faltam.length ? `Faltam: ${faltam.join("; ")}` : "Todas no sistema"}>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${faltam.length ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                {faltam.length ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                {l.enviadas.length}/{l.exigidas.length}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-xs text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
                                title="PDFs que você tem aí (ex.: certidão que ele mandou por fora). Entram no fim do arquivo único.">
                                <Paperclip className="h-3.5 w-3.5" /> {extras.length ? `${extras.length} PDF` : "PDF"}
                                <input type="file" accept="application/pdf" multiple className="hidden"
                                  onChange={(e) => {
                                    const fs = Array.from(e.target.files ?? []);
                                    setAnexos((a) => ({ ...a, [l.efetivoId]: fs }));
                                    e.target.value = "";
                                  }} />
                              </label>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => gerarWord([l])} disabled={!!ocupado} title="Só a certidão, em Word"
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white transition hover:bg-white/5 disabled:opacity-40">
                                  <FileText className="h-3.5 w-3.5" /> Word
                                </button>
                                <button onClick={() => gerarUnificados([l])} disabled={!!ocupado} title="Certidão + certidões das regiões, num PDF só"
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 px-2 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#1a1205] disabled:opacity-40">
                                  <FileStack className="h-3.5 w-3.5" /> PDF único
                                </button>
                                <button onClick={() => removerLinha(l)} disabled={!!ocupado} title="Tirar da lista"
                                  className="rounded-lg border border-white/10 px-1.5 py-1 text-[#94A3B8] transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-40">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ---- em lote ---- */}
              {linhas.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => gerarUnificados(marcadas)} disabled={!!ocupado || !marcadas.length}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
                    <FileStack className="h-4 w-4" /> PDF único de cada um ({marcadas.length})
                  </button>
                  <button onClick={() => gerarWord(marcadas)} disabled={!!ocupado || !marcadas.length}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white transition hover:bg-white/5 disabled:opacity-50">
                    <FileText className="h-4 w-4" /> Só as certidões em Word ({marcadas.length})
                  </button>
                  <span className="text-[11px] text-[#94A3B8]">
                    Mais de um: sai um .zip com um arquivo por policial.
                  </span>
                </div>
              )}

              {ocupado && (
                <p className="flex items-center gap-2 text-sm text-[#D4AF37]"><Loader2 className="h-4 w-4 animate-spin" /> {ocupado}</p>
              )}
            </>
          )}

          {erro && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}
        </div>
      )}
    </div>
  );
}
