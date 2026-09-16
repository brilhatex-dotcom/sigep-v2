"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Plus, Trash2, Info, Save, Lock, Unlock, FolderOpen, ShieldCheck, FileSignature, Landmark } from "lucide-react";
import { imprimirElemento } from "@/lib/imprimir";
import { avisar, confirmar } from "@/components/Avisos";
import CarimboSigep from "@/components/CarimboSigep";
import { linhaBanco, faltaBanco } from "@/lib/pecuniaComum";
import {
  Cabecalho, Campo, ESTILO_FOLHA, FOLHA_A4, nomeBusca, type Militar,
} from "@/components/docs/Comum";

/* =========================================================================
   REQUERIMENTO DE PREMIAÇÃO PECUNIÁRIA
   (por apreensão de arma de fogo em situação irregular)

   Diferente dos outros requerimentos do sistema em dois pontos que mudam tudo:

   1. É COLETIVO. Um documento só, assinado por vários policiais — os que
      participaram da mesma apreensão. Os requerimentos comuns são de UM
      militar, e por isso saem de um template .docx com os dados dele.
   2. NÃO TEM TEMPLATE. Aqui a folha é montada na tela, o que permite usar o
      MESMO cabeçalho da Escala de Serviço: trocar a logo do aniversário da
      PMMA na escala troca aqui também, sem mexer em arquivo nenhum.

   O texto do corpo é o do modelo oficial, com a Instrução Normativa e o
   Decreto que fundamentam o pedido — e continua editável, porque a norma pode
   mudar e o P/1 não pode ficar esperando alguém alterar o sistema.

   ASSINATURA. O documento é GUARDADO com um número (RP-ano-sequência) e cada
   policial escolhe como assina a sua linha:
     · SIGEP  — confirma com a senha; sai o carimbo com QR verificável;
     · Gov.br — o espaço sai EM BRANCO, para assinar o PDF depois;
     · caneta — o espaço sai em branco, como sempre foi.
   Guardar vem antes de assinar por necessidade, não por burocracia: a
   assinatura é um lacre sobre um conteúdo, e conteúdo que só existe na aba
   aberta do navegador não tem como ser lacrado nem reconferido depois.
   ========================================================================= */

const CONTATO = "(99) 98509-5005 (Permanência) – 18batalhaopmma@gmail.com";

const TEXTO_PADRAO =
  "O(s) signatário(s) abaixo qualificado(s), policial(is) (civil ou militar) do serviço ativo, " +
  "requer(em) o pagamento de premiação pecuniária por apreensão de arma(s) de fogo em situação " +
  "irregular, de acordo com a Instrução Normativa nº 01, de 29 de março de 2016, que disciplina o " +
  "Decreto nº 31.564, de 28 de março de 2016, e conforme documentação anexa, que acompanha o " +
  "presente pedido:";

const DESTINATARIO = "EXCELENTÍSSIMO SENHOR SECRETÁRIO DE ESTADO DA SEGURANÇA PÚBLICA";

type Linha = {
  chave: string;          // identidade da linha na tela (id do efetivo, ou avulso)
  efetivoId: string;      // vazio = digitado à mão
  cargo: string;
  nome: string;
  matricula: string;
  idPmma: string;
  lotacao: string;
  banco: string;          // o que sai na coluna DADOS BANCÁRIOS
  bancoNome?: string;     // resposta do questionário (banco, agência, conta)
  agencia?: string;
  conta?: string;
  tipoConta?: string;
  assinarGov?: boolean;   // espaço em branco: vai assinar o PDF pelo Gov.br
};

type Resposta = { bancoNome: string; agencia: string; conta: string; tipoConta: string };

type Assinatura = { efetivoId: string; id: string; token: string; nome: string; cargo: string; em: string };
type ItemLista = { id: string; criadoEm: string; criadoPorNome: string; quantidade: number; nomes: string[]; souDele: boolean; jaAssinei: boolean; semBanco: number };

/* A API do efetivo traz a lotação; o tipo compartilhado não a declara. */
type MilitarComLotacao = Militar & { lotacao?: string | null };

/* Neste requerimento a lotação é sempre o Batalhão — o documento vai para a
   SSP, que quer saber a unidade, não a seção interna (ADM, FT-SEDE, ROTEM). */
const LOTACAO = "18º BPM";

const vazia = (): Linha => ({
  chave: `m-${Math.random().toString(36).slice(2)}`,
  efetivoId: "", cargo: "", nome: "", matricula: "", idPmma: "", lotacao: LOTACAO, banco: "",
});

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const quandoBR = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function RequerimentoPecuniaDoc({
  meuId = "", idInicial = "",
}: {
  meuId?: string;         // ficha do efetivo ligada ao usuário logado
  idInicial?: string;     // abrir um requerimento já guardado
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [texto, setTexto] = useState(TEXTO_PADRAO);
  const [destinatario, setDestinatario] = useState(DESTINATARIO);
  const [local, setLocal] = useState("Presidente Dutra/MA");
  const [data, setData] = useState(hojeBR());

  const [efetivo, setEfetivo] = useState<MilitarComLotacao[]>([]);
  const [busca, setBusca] = useState("");
  const [avisoBanco, setAvisoBanco] = useState(false);

  // ---- documento guardado ----
  const [reqId, setReqId] = useState(idInicial);
  const [assinaturas, setAssinaturas] = useState<Record<string, Assinatura>>({});
  const [podeMexer, setPodeMexer] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [lista, setLista] = useState<ItemLista[] | null>(null);
  const [verLista, setVerLista] = useState(false);

  // ---- questionário dos dados bancários ----
  const [respondendo, setRespondendo] = useState<Linha | null>(null);
  const [resp, setResp] = useState<Resposta>({ bancoNome: "", agencia: "", conta: "", tipoConta: "CC" });
  const [naFicha, setNaFicha] = useState(true);
  const [gravandoBanco, setGravandoBanco] = useState(false);
  const [erroBanco, setErroBanco] = useState("");

  // ---- assinar ----
  const [pedindoSenha, setPedindoSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [erroAss, setErroAss] = useState("");

  /* Documento com assinatura não se edita: alterar o conteúdo por baixo
     quebraria o lacre de quem já assinou sem ninguém perceber. Para mexer,
     reabre-se — e aí as assinaturas caem, à vista de todos. */
  const travado = Object.keys(assinaturas).length > 0;

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as MilitarComLotacao[])).catch(() => {});
  }, []);

  /* Aplica na tela o que o servidor devolveu (abrir, guardar, reabrir). */
  const aplicar = useCallback((d: any) => {
    const r = d?.requerimento;
    if (r) {
      setReqId(r.id);
      setDestinatario(r.dados.destinatario || DESTINATARIO);
      setTexto(r.dados.texto || TEXTO_PADRAO);
      setLocal(r.dados.local || "");
      setData(r.dados.data || hojeBR());
      setLinhas(r.dados.linhas || []);
    }
    if (Array.isArray(d?.assinaturas)) {
      const m: Record<string, Assinatura> = {};
      for (const a of d.assinaturas) if (a?.efetivoId) m[a.efetivoId] = a;
      setAssinaturas(m);
    }
    if (typeof d?.podeMexer === "boolean") setPodeMexer(d.podeMexer);
  }, []);

  const abrir = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/requerimentos/premiacao?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível abrir o requerimento.", "erro"); return; }
      aplicar(d);
      setVerLista(false);
      if (typeof window !== "undefined") window.history.replaceState(null, "", `?id=${encodeURIComponent(id)}`);
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
  }, [aplicar]);

  useEffect(() => { if (idInicial) abrir(idInicial); }, [idInicial, abrir]);

  const carregarLista = useCallback(async () => {
    try {
      const r = await fetch("/api/requerimentos/premiacao");
      const d = await r.json();
      setLista(r.ok ? (d?.itens || []) : []);
    } catch { setLista([]); }
  }, []);

  const jaTem = useMemo(() => new Set(linhas.map((l) => l.efetivoId).filter(Boolean)), [linhas]);
  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return efetivo
      .filter((m) => !jaTem.has(m.id))
      .filter((m) => (nomeBusca(m) + " " + (m.nome || "") + " " + (m.matricula || "")).toLowerCase().includes(t))
      .slice(0, 8);
  }, [busca, efetivo, jaTem]);

  /* Escolher no buscador preenche a linha inteira.

     O ID PMMA é a CHAVE da ficha (m.id) — não o "nº 863/14" da escala, que é
     a numeração da graduação. Nos policiais de 2018 para cá o ID e a matrícula
     são o mesmo número; nos mais antigos, diferentes.

     Cargo, quadro e dados bancários vêm de /api/requerimentos/premiacao/ficha,
     porque banco/agência/conta são guardados cifrados e não trafegam na
     /api/efetivo, que qualquer usuário logado enxerga. */
  const acrescentar = async (m: MilitarComLotacao) => {
    setBusca("");
    setLinhas((l) => [...l, {
      chave: m.id,
      efetivoId: m.id,
      cargo: (m.postoGrad || "").trim(),
      nome: m.nome || m.nomeGuerra || "",
      matricula: m.matricula || "",
      idPmma: m.id,
      lotacao: LOTACAO,
      banco: "",
    }]);
    try {
      const r = await fetch(`/api/requerimentos/premiacao/ficha?ids=${encodeURIComponent(m.id)}`);
      if (!r.ok) return;
      const d = await r.json();
      const f = (d?.fichas || [])[0];
      if (!f) return;
      setLinhas((l) => l.map((x) => (x.chave === m.id ? {
        ...x,
        cargo: f.cargo || x.cargo,
        nome: f.nome || x.nome,
        matricula: f.matricula || x.matricula,
        idPmma: f.idPmma || x.idPmma,
        /* A ficha preenche a resposta do questionário, não só o texto da
           coluna: assim o policial abre o formulário já com o que o sistema
           sabe e só corrige o que estiver errado, em vez de digitar tudo. */
        bancoNome: f.banco || x.bancoNome || "",
        agencia: f.agencia || x.agencia || "",
        conta: f.conta || x.conta || "",
        tipoConta: f.tipoConta || x.tipoConta || "CC",
        banco: linhaBanco({ bancoNome: f.banco, agencia: f.agencia, conta: f.conta, tipoConta: f.tipoConta }) || x.banco,
      } : x)));
      if (f.bancoOculto) setAvisoBanco(true);
    } catch { /* sem a ficha, a linha fica para preencher a mão */ }
  };

  const mudar = (chave: string, patch: Partial<Linha>) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, ...patch } : x)));
  const remover = (chave: string) => setLinhas((l) => l.filter((x) => x.chave !== chave));

  // ------------------------------------------------------------ guardar
  const guardar = async () => {
    if (!linhas.length) { avisar("Acrescente ao menos um policial antes de guardar.", "atencao"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/requerimentos/premiacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId || undefined, dados: { destinatario, texto, local, data, linhas } }),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível guardar.", "erro"); return; }
      const novo = !reqId;
      aplicar(d);
      if (novo && typeof window !== "undefined") {
        window.history.replaceState(null, "", `?id=${encodeURIComponent(d.requerimento.id)}`);
      }
      avisar(novo ? `Guardado como ${d.requerimento.id}. Agora cada policial pode assinar.` : "Requerimento guardado.", "sucesso");
      setLista(null);
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setSalvando(false); }
  };

  const reabrir = async () => {
    const quem = Object.values(assinaturas).map((a) => a.nome).filter(Boolean).join(", ");
    const ok = await confirmar(
      `Reabrir cancela ${Object.keys(assinaturas).length} assinatura(s)${quem ? ` (${quem})` : ""}. Quem já assinou terá de assinar de novo. Continuar?`,
      { rotuloOk: "Reabrir", perigo: true },
    );
    if (!ok) return;
    try {
      const r = await fetch("/api/requerimentos/premiacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId, acao: "reabrir" }),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível reabrir.", "erro"); return; }
      aplicar(d);
      avisar("Requerimento reaberto para edição.", "info");
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
  };

  // ------------------------------------------- dados bancários (questionário)
  const abrirResposta = (l: Linha) => {
    setErroBanco("");
    setNaFicha(l.efetivoId === meuId);   // só faz sentido oferecer para a própria ficha
    setResp({
      bancoNome: l.bancoNome || "",
      agencia: l.agencia || "",
      conta: l.conta || "",
      tipoConta: l.tipoConta || "CC",
    });
    setRespondendo(l);
  };

  const gravarResposta = async () => {
    if (!respondendo) return;
    setGravandoBanco(true); setErroBanco("");
    try {
      const r = await fetch("/api/requerimentos/premiacao/banco", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: reqId, efetivoId: respondendo.efetivoId, ...resp,
          guardarNaFicha: naFicha && respondendo.efetivoId === meuId,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErroBanco(d?.error || "Não foi possível gravar."); return; }
      if (d?.requerimento?.dados?.linhas) setLinhas(d.requerimento.dados.linhas);
      setRespondendo(null);
      avisar(d?.naFicha ? "Dados bancários gravados — e guardados na sua ficha." : "Dados bancários gravados.", "sucesso");
    } catch { setErroBanco("Sem conexão com o servidor."); }
    finally { setGravandoBanco(false); }
  };

  // ------------------------------------------------------------ assinar
  const escolherModo = async (efetivoId: string, modo: "gov" | "nenhum") => {
    try {
      const r = await fetch("/api/requerimentos/premiacao/assinar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId, modo, efetivoId }),
      });
      const d = await r.json();
      if (!r.ok) { avisar(d?.error || "Não foi possível mudar a forma de assinar.", "erro"); return; }
      if (d?.requerimento?.dados?.linhas) setLinhas(d.requerimento.dados.linhas);
      setAssinaturas((m) => { const c = { ...m }; delete c[efetivoId]; return c; });
      avisar(modo === "gov" ? "O espaço vai sair em branco para assinar pelo Gov.br." : "Voltou para assinatura à caneta.", "info");
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
  };

  const assinarSigep = async () => {
    setAssinando(true); setErroAss("");
    try {
      const r = await fetch("/api/requerimentos/premiacao/assinar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId, modo: "sigep", senha }),
      });
      const d = await r.json();
      if (!r.ok) { setErroAss(d?.error || "Não foi possível assinar."); return; }
      setAssinaturas((m) => ({ ...m, [d.assinatura.efetivoId]: d.assinatura }));
      setLinhas((l) => l.map((x) => (x.efetivoId === d.assinatura.efetivoId ? { ...x, assinarGov: false } : x)));
      setPedindoSenha(false); setSenha("");
      avisar("Assinado. Sai o carimbo com QR verificável.", "sucesso");
    } catch { setErroAss("Sem conexão com o servidor."); }
    finally { setAssinando(false); }
  };

  /* As assinaturas saem DE DOIS EM DOIS, como no modelo em papel. */
  const pares = useMemo(() => {
    const out: Linha[][] = [];
    for (let i = 0; i < linhas.length; i += 2) out.push(linhas.slice(i, i + 2));
    return out;
  }, [linhas]);

  const minhaLinha = useMemo(() => linhas.find((l) => l.efetivoId && l.efetivoId === meuId), [linhas, meuId]);
  // Quem ainda não respondeu o questionário — o documento não fica pronto sem.
  const faltamBanco = useMemo(() => linhas.filter(faltaBanco), [linhas]);
  /* Quem montou o documento (e o P/1) pode marcar o Gov.br pelos colegas — é
     só deixar o espaço em branco. ASSINAR pelo outro ninguém pode, nem aqui
     nem no servidor. `podeMexer` já vem do servidor com essa conta feita. */
  const souDono = podeMexer;

  const td: React.CSSProperties = { border: "0.5pt solid #000", padding: "2pt 3pt", fontSize: "9pt", verticalAlign: "middle" };
  const th: React.CSSProperties = { ...td, fontWeight: "bold", textAlign: "center", fontSize: "8.5pt" };
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#cbd5e1] transition hover:border-[#D4AF37]/40 hover:text-white disabled:opacity-40";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILO_FOLHA }} />

      {/* ---------------- controles (não vão para o papel) ---------------- */}
      <div className="nao-imprimir mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => imprimirElemento(document.getElementById("pecunia-print"), {
              titulo: "Requerimento de premiação pecuniária",
              /* Sem passar isto, o pontilhado dos campos editáveis sai no
                 papel: o <style> da página não acompanha o elemento clonado. */
              estilo: ESTILO_FOLHA,
            })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
          >
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </button>

          {podeMexer && (
            <button onClick={guardar} disabled={salvando || travado} className={btn + " px-4 py-2 text-sm"}
              title={travado ? "Reabra o requerimento para poder alterá-lo" : "Guarda o requerimento com um número, para poder assinar e reabrir depois"}>
              <Save className="h-4 w-4" /> {salvando ? "Guardando…" : reqId ? "Guardar alterações" : "Guardar para assinar"}
            </button>
          )}

          <button onClick={() => { setVerLista((v) => !v); if (lista === null) carregarLista(); }} className={btn + " px-4 py-2 text-sm"}>
            <FolderOpen className="h-4 w-4" /> Requerimentos guardados
          </button>

          {!reqId && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <Info className="h-3.5 w-3.5" /> Clique em qualquer texto do documento para editar antes de imprimir.
            </span>
          )}
        </div>

        {reqId && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2">
            <span className="text-sm font-semibold text-white">Requerimento nº {reqId}</span>
            {travado ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                <Lock className="h-3 w-3" /> assinado — texto travado
              </span>
            ) : (
              <span className="text-xs text-[#94A3B8]">sem assinatura ainda — ainda dá para editar</span>
            )}
            {travado && podeMexer && (
              <button onClick={reabrir} className={btn + " ml-auto"}>
                <Unlock className="h-3.5 w-3.5" /> Reabrir para editar
              </button>
            )}
          </div>
        )}

        {/* ---- lista dos guardados ---- */}
        {verLista && (
          <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0b1626]">
            {lista === null ? (
              <p className="p-3 text-xs text-[#94A3B8]">Carregando…</p>
            ) : lista.length === 0 ? (
              <p className="p-3 text-xs text-[#94A3B8]">Nenhum requerimento guardado ainda.</p>
            ) : lista.map((it) => (
              <button key={it.id} onClick={() => abrir(it.id)}
                className="block w-full border-b border-white/5 px-3 py-2 text-left transition hover:bg-white/5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{it.id}</span>
                  <span className="text-xs text-[#94A3B8]">{quandoBR(it.criadoEm)} · {it.criadoPorNome || "—"} · {it.quantidade} policial(is)</span>
                  {it.souDele && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${it.jaAssinei ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                      {it.jaAssinei ? "você já assinou" : "falta a sua assinatura"}
                    </span>
                  )}
                </div>
                {it.nomes.length > 0 && <div className="mt-0.5 text-xs text-[#6f82a0]">{it.nomes.join(", ")}{it.quantidade > it.nomes.length ? "…" : ""}</div>}
              </button>
            ))}
          </div>
        )}

        {!travado && (
          <>
            <label className="mb-1 block text-xs text-[#94A3B8]">
              Acrescentar policial (preenche cargo com o quadro, nome, matrícula, ID PMMA e os dados bancários da ficha)
            </label>
            <div className="relative">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou matrícula..."
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
              />
              {achados.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0F1B2D] shadow-2xl">
                  {achados.map((m) => (
                    <button
                      key={m.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => acrescentar(m)}
                      className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/5"
                    >
                      {nomeBusca(m)}
                      {m.matricula ? <span className="text-xs text-[#94A3B8]"> · mat {m.matricula}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setLinhas((l) => [...l, vazia()])}
              className={btn + " mt-2"}
            >
              <Plus className="h-3.5 w-3.5" /> linha em branco (policial civil, ou de fora do efetivo)
            </button>
          </>
        )}

        {linhas.length > 0 && !travado && (
          <p className="mt-2 text-xs text-[#94A3B8]">
            {linhas.length} policial(is) no requerimento. Qualquer campo pode ser corrigido na tabela.
          </p>
        )}
        {avisoBanco && (
          <p className="mt-2 text-xs text-amber-300">
            Os dados bancários de outros policiais só são preenchidos pelo P/1 (perfil admin) —
            são guardados cifrados no sistema. Guarde o requerimento e cada um preenche a própria
            conta no questionário, ou peça ao P/1 para montar o documento.
          </p>
        )}

        {/* ---- dados bancários e assinatura, policial por policial ---- */}
        {reqId && linhas.some((l) => l.efetivoId) && (
          <div className="mt-4 rounded-lg border border-white/10 bg-[#0b1626] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#cbd5e1]">
              <FileSignature className="h-3.5 w-3.5" /> Dados bancários e assinaturas
            </div>

            {/* A conta entra no conteúdo assinado. Quem assina antes de todo
                mundo responder obriga a reabrir depois — e reabrir cancela
                assinatura de gente que não errou nada. Melhor avisar antes. */}
            {!travado && faltamBanco.length > 0 && (
              <p className="mb-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                Ainda falta a conta de <b>{faltamBanco.map((l) => l.nome || "—").join(", ")}</b>.
                A conta faz parte do que é assinado: se alguém assinar agora, o requerimento terá
                de ser reaberto para o resto preencher, e as assinaturas caem.
              </p>
            )}

            {linhas.filter((l) => l.efetivoId).map((l) => {
              const a = assinaturas[l.efetivoId];
              const sou = l.efetivoId === meuId;
              const sem = faltaBanco(l);
              return (
                <div key={l.chave} className="border-t border-white/5 py-2 first:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-white">{l.nome || "(sem nome)"}{sou && <span className="text-xs text-[#D4AF37]"> · você</span>}</span>
                    {a ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                        <ShieldCheck className="h-3 w-3" /> SIGEP · {quandoBR(a.em)}
                      </span>
                    ) : l.assinarGov ? (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">vai assinar pelo Gov.br</span>
                    ) : (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#94A3B8]">sem assinatura</span>
                    )}

                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {sou && !a && !sem && (
                        <button onClick={() => { setErroAss(""); setSenha(""); setPedindoSenha(true); }} className={btn}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Assinar no SIGEP
                        </button>
                      )}
                      {(sou || souDono) && !l.assinarGov && (
                        <button onClick={() => escolherModo(l.efetivoId, "gov")} className={btn}>Assinar pelo Gov.br</button>
                      )}
                      {(sou || souDono) && (a || l.assinarGov) && (
                        <button onClick={() => escolherModo(l.efetivoId, "nenhum")} className={btn}>Desfazer</button>
                      )}
                    </span>
                  </div>

                  {/* A conta de cada um, com o botão de responder ao lado.
                      Assinar só aparece depois que a conta está lá: assinar um
                      requerimento com a própria linha em branco não faria
                      sentido nenhum — é justamente o que se está pedindo. */}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {sem ? (
                      <span className="text-[11px] text-amber-300">conta ainda não preenchida</span>
                    ) : (
                      <span className="font-mono text-[11px] text-[#6f82a0]">{l.banco}</span>
                    )}
                    {(sou || souDono) && !travado && (
                      <button onClick={() => abrirResposta(l)} className={btn + " py-1 text-[11px]"}>
                        <Landmark className="h-3 w-3" /> {sem ? (sou ? "Preencher meus dados bancários" : "Preencher") : "Corrigir"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <p className="mt-2 text-[11px] leading-relaxed text-[#6f82a0]">
              Cada policial preenche a <b>própria</b> conta — quem montou o requerimento e o P/1
              também podem preencher pelos outros. <b>SIGEP</b>: assinatura eletrônica avançada
              (MP 2.200-2/2001 · Lei 14.063/2020), carimbo com data, hora e QR que confere o
              documento. <b>Gov.br</b>: o espaço sai <b>em branco</b> no PDF, para ser assinado no
              assinador do Gov.br depois de salvar. Cada um assina a própria linha.
            </p>
          </div>
        )}
        {reqId && !minhaLinha && meuId && (
          <p className="mt-2 text-xs text-[#94A3B8]">Você não está na lista deste requerimento, então não há o que assinar.</p>
        )}
      </div>

      {/* ---------------- questionário dos dados bancários ---------------- */}
      {respondendo && (
        <div className="nao-imprimir" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => !gravandoBanco && setRespondendo(null)}>
          <div style={{ width: "100%", maxWidth: 420, background: "#0F1B2D", border: "1px solid #2b3f63", borderRadius: 14, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#fff", fontWeight: 700, margin: "0 0 4px" }}>
              🏦 Dados bancários {respondendo.efetivoId === meuId ? "— os seus" : `de ${respondendo.nome}`}
            </h3>
            <p style={{ color: "#94A3B8", fontSize: 12, margin: "0 0 12px" }}>
              É a conta em que a premiação vai cair. Confira o dígito — conta errada volta o pagamento.
            </p>

            <label className="mb-1 block text-xs text-[#94A3B8]">1. Banco</label>
            <input value={resp.bancoNome} onChange={(e) => setResp((r) => ({ ...r, bancoNome: e.target.value }))}
              placeholder="Banco do Brasil, Caixa, Bradesco…"
              className="mb-3 w-full rounded-lg border border-white/10 bg-[#0a1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />

            <label className="mb-1 block text-xs text-[#94A3B8]">2. Agência</label>
            <input value={resp.agencia} onChange={(e) => setResp((r) => ({ ...r, agencia: e.target.value }))}
              placeholder="1234-5" inputMode="text"
              className="mb-3 w-full rounded-lg border border-white/10 bg-[#0a1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />

            <label className="mb-1 block text-xs text-[#94A3B8]">3. Conta</label>
            <div className="mb-3 flex gap-2">
              <select value={resp.tipoConta} onChange={(e) => setResp((r) => ({ ...r, tipoConta: e.target.value }))}
                className="rounded-lg border border-white/10 bg-[#0a1626] px-2 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50">
                <option value="CC">Corrente</option>
                <option value="CP">Poupança</option>
              </select>
              <input value={resp.conta} onChange={(e) => setResp((r) => ({ ...r, conta: e.target.value }))}
                placeholder="98765-4" inputMode="text"
                className="w-full rounded-lg border border-white/10 bg-[#0a1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>

            {/* Como vai sair no papel — confere-se antes de gravar, não depois
                de imprimir. */}
            <div className="mb-3 rounded-lg border border-white/5 bg-[#0a1626] px-3 py-2">
              <div className="text-[11px] text-[#6f82a0]">No documento vai sair assim:</div>
              <div className="font-mono text-xs text-white">{linhaBanco(resp) || "—"}</div>
            </div>

            {respondendo.efetivoId === meuId && (
              <label className="mb-1 flex items-start gap-2 text-xs text-[#cbd5e1]">
                <input type="checkbox" checked={naFicha} onChange={(e) => setNaFicha(e.target.checked)} className="mt-0.5" />
                <span>Guardar também na minha ficha, para o próximo requerimento já vir preenchido.</span>
              </label>
            )}

            {erroBanco && <div style={{ color: "#ffb3b3", fontSize: 12, marginTop: 8 }}>{erroBanco}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setRespondendo(null)} disabled={gravandoBanco} className={btn}>Cancelar</button>
              <button onClick={gravarResposta} disabled={gravandoBanco}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-1.5 text-xs font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
                {gravandoBanco ? "Gravando…" : "Gravar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- confirmação da assinatura ---------------- */}
      {pedindoSenha && (
        <div className="nao-imprimir" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => !assinando && setPedindoSenha(false)}>
          <div style={{ width: "100%", maxWidth: 420, background: "#0F1B2D", border: "1px solid #2b3f63", borderRadius: 14, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#fff", fontWeight: 700, margin: "0 0 4px" }}>🔏 Assinar o requerimento {reqId}</h3>
            <p style={{ color: "#94A3B8", fontSize: 12, margin: "0 0 12px" }}>
              Assinatura <b>avançada SIGEP</b>. Confirme com a <b>sua senha</b> — fica registrado o dia, a hora,
              de onde partiu o ato e o conteúdo exato do requerimento. Sai um carimbo com QR verificável.
            </p>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha"
              onKeyDown={(e) => { if (e.key === "Enter" && senha && !assinando) assinarSigep(); }}
              style={{ width: "100%", boxSizing: "border-box", background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 8, padding: "9px 11px", fontSize: 14 }} />
            {erroAss && <div style={{ color: "#ffb3b3", fontSize: 12, marginTop: 8 }}>{erroAss}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setPedindoSenha(false)} disabled={assinando} className={btn}>Cancelar</button>
              <button onClick={assinarSigep} disabled={assinando || !senha}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-1.5 text-xs font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
                {assinando ? "Assinando…" : "Assinar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- a folha ---------------- */}
      <div className="overflow-x-auto">
        <div id="pecunia-print" className="folha-diaria mx-auto bg-white text-black shadow-xl" style={FOLHA_A4}>
          <Cabecalho
            contato={CONTATO}
            orgDestaque
            tamanhos={{ pmma: ["26mm", "22mm"], ma: ["30mm", "16mm"], bpm: ["22mm", "22mm"] }}
          />

          <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 6mm", textDecoration: "underline" }}>
            REQUERIMENTO PREMIAÇÃO PECUNIÁRIA
          </h1>

          <p style={{ fontWeight: "bold", fontSize: "11pt", margin: "0 0 6mm" }}>
            <Campo valor={destinatario} onChange={setDestinatario} inline negrito travado={travado} />
          </p>

          <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
            <Campo valor={texto} onChange={setTexto} inline travado={travado} />
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 6mm" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: "8mm" }}>ORD</th>
                <th style={{ ...th, width: "22mm" }}>CARGO</th>
                <th style={th}>NOME COMPLETO</th>
                <th style={{ ...th, width: "20mm" }}>MATRÍCULA</th>
                <th style={{ ...th, width: "20mm" }}>ID</th>
                <th style={{ ...th, width: "20mm" }}>LOTAÇÃO</th>
                <th style={{ ...th, width: "34mm" }}>DADOS BANCÁRIOS</th>
                <th style={{ ...th, width: "6mm", border: "none" }} className="nao-imprimir" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.chave}>
                  <td style={{ ...td, textAlign: "center" }}>{String(i + 1).padStart(2, "0")}</td>
                  <td style={td}><Campo valor={l.cargo} onChange={(v) => mudar(l.chave, { cargo: v })} inline travado={travado} /></td>
                  <td style={td}><Campo valor={l.nome} onChange={(v) => mudar(l.chave, { nome: v })} inline travado={travado} /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.matricula} onChange={(v) => mudar(l.chave, { matricula: v })} inline travado={travado} /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.idPmma} onChange={(v) => mudar(l.chave, { idPmma: v })} inline travado={travado} /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.lotacao} onChange={(v) => mudar(l.chave, { lotacao: v })} inline travado={travado} /></td>
                  <td style={td}><Campo valor={l.banco} onChange={(v) => mudar(l.chave, { banco: v })} inline travado={travado} /></td>
                  <td style={{ border: "none", padding: "0 0 0 3pt" }} className="nao-imprimir">
                    {!travado && (
                      <button onClick={() => remover(l.chave)} title="tirar do requerimento" style={{ color: "#b3261e", background: "none", border: "none", cursor: "pointer" }}>
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: "center", color: "#777", fontStyle: "italic", padding: "6pt" }}>
                    Use o buscador acima para acrescentar os policiais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p style={{ textAlign: "center", margin: "8mm 0 12mm" }}>
            <Campo valor={local} onChange={setLocal} inline travado={travado} />, <Campo valor={data} onChange={setData} inline travado={travado} />.
          </p>

          {/* Assinaturas de dois em dois, como no modelo em papel. O nome vai
              ACIMA da linha porque é assim que o documento oficial faz — quem
              confere lê o nome e a assinatura no mesmo bloco.

              Quem assinou no SIGEP ganha o carimbo com QR no lugar do espaço em
              branco. Quem vai assinar pelo Gov.br continua com o espaço vazio,
              de propósito: o assinador do Gov.br carimba por cima do PDF, e a
              observação que explica isso não vai para o papel. */}
          {pares.map((par, i) => (
            <div key={i} style={{ display: "flex", gap: "8mm", marginBottom: "10mm", breakInside: "avoid" }}>
              {par.map((l) => {
                const a = l.efetivoId ? assinaturas[l.efetivoId] : null;
                return (
                  <div key={l.chave} style={{ flex: 1, textAlign: "center" }}>
                    {a ? (
                      <div style={{ marginBottom: "1.5mm" }}>
                        <CarimboSigep nome={a.nome || l.nome} cargo={a.cargo || l.cargo} data={a.em} largura="66mm" escala={0.92} assinatura={{ id: a.id, token: a.token }} />
                      </div>
                    ) : null}
                    <div style={{ fontSize: "10.5pt", marginBottom: "1mm", minHeight: "5mm" }}>{l.nome}</div>
                    <div style={{ borderTop: "0.8pt solid #000", paddingTop: "1mm", fontSize: "8.5pt" }}>
                      {[l.cargo, l.matricula ? `Mat. ${l.matricula}` : ""].filter(Boolean).join(" · ")}
                    </div>
                    {l.assinarGov && !a && (
                      <div className="nao-imprimir" style={{ fontSize: "8pt", color: "#888", marginTop: "1mm" }}>
                        (assinatura digital via Gov.br)
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Sobrou um sozinho na última fileira: a coluna vazia mantém a
                  linha dele com a mesma largura das de cima. */}
              {par.length === 1 && <div style={{ flex: 1 }} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
