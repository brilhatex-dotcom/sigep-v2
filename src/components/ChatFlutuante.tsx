"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Search, X, Minus, Send, Paperclip, ArrowLeft,
  Loader2, FileText, Download, Phone, Video, Maximize2,
} from "lucide-react";
import Link from "next/link";
import Chamada from "@/components/Chamada";

/* =========================================================================
   Chat flutuante — a bolha no canto que acompanha o usuário em qualquer
   tela do SIGEP. Mostra quantos estão online, abre a lista, procura pelo
   nome e conversa sem sair da página onde a pessoa está.

   Usa exatamente as mesmas rotas da tela cheia (/chat). Na própria /chat
   ele não aparece, para não duplicar.
   ========================================================================= */

type Contato = {
  login: string; nome: string; postoGrad: string | null; lotacao: string | null;
  admin: boolean; online: boolean; naoLidas: number; previa: string; em: string | null;
  foto?: string | null;
};
type Msg = {
  id: string; minha: boolean; texto: string | null;
  arqKey: string | null; arqNome: string | null; arqTipo: string | null; arqTam: number | null;
  em: string; lida: boolean; lidaEm?: string | null;
};

const LIMITE = 20 * 1024 * 1024;
const ehImagem = (t: string | null) => !!t && t.startsWith("image/");
const horaBR = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
function tamanhoBR(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function Foto({ c, tam = 32 }: { c: { nome: string; foto?: string | null }; tam?: number }) {
  const [falhou, setFalhou] = useState(false);
  const st = { width: tam, height: tam };
  if (c.foto && !falhou) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.foto} alt={c.nome} style={st} onError={() => setFalhou(true)} className="rounded-full object-cover" />;
  }
  return (
    <span style={st} className="grid place-items-center rounded-full bg-[#16243a] text-[10px] font-bold text-[#D4AF37]">
      {c.nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function ChatFlutuante() {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState("");
  const [soOnline, setSoOnline] = useState(true);
  const [conversa, setConversa] = useState<Contato | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subindo, setSubindo] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [ligarPara, setLigarPara] = useState<{ para: string; video: boolean } | null>(null);

  const fim = useRef<HTMLDivElement | null>(null);
  const ultimaRef = useRef<string | null>(null);
  const convRef = useRef<Contato | null>(null); convRef.current = conversa;
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  /* ---------- presença + contatos (sempre, para a bolha ter número) ---------- */
  const puxar = useCallback(async () => {
    if (document.hidden) return;
    try {
      fetch("/api/chat/presenca", { method: "POST" }).catch(() => {});
      const r = await fetch("/api/chat/contatos");
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d?.contatos)) setContatos(d.contatos);
    } catch {}
  }, []);

  useEffect(() => {
    puxar();
    const t = setInterval(puxar, aberto ? 6000 : 20000);
    return () => clearInterval(t);
  }, [puxar, aberto]);

  /* ---------- conversa ---------- */
  const abrir = useCallback(async (c: Contato) => {
    setConversa(c); setMsgs([]); ultimaRef.current = null; setErro("");
    try {
      const r = await fetch("/api/chat/mensagens?com=" + encodeURIComponent(c.login));
      const d = await r.json();
      const lista: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
      setMsgs(lista);
      if (lista.length) ultimaRef.current = lista[lista.length - 1].em;
      setContatos((cs) => cs.map((x) => (x.login === c.login ? { ...x, naoLidas: 0 } : x)));
    } catch {}
  }, []);

  useEffect(() => {
    if (!conversa || !aberto) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const c = convRef.current; if (!c) return;
      try {
        const q = "/api/chat/mensagens?com=" + encodeURIComponent(c.login) +
          (ultimaRef.current ? "&depois=" + encodeURIComponent(ultimaRef.current) : "");
        const r = await fetch(q);
        if (!r.ok) return;
        const d = await r.json();
        const novas: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
        if (novas.length) {
          setMsgs((m) => {
            const ids = new Set(m.map((x) => x.id));
            const add = novas.filter((x) => !ids.has(x.id));
            return add.length ? [...m, ...add] : m;
          });
          ultimaRef.current = novas[novas.length - 1].em;
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [conversa, aberto]);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  async function enviar() {
    const t = texto.trim();
    if (!t || !conversa || enviando) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: conversa.login, texto: t }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível enviar."); return; }
      setTexto("");
      setMsgs((m) => [...m, d.mensagem]);
      ultimaRef.current = d.mensagem.em;
      puxar();
    } catch { setErro("Sem conexão."); }
    finally { setEnviando(false); }
  }

  async function mandarArquivo(f: File) {
    if (!conversa) return;
    setErro("");
    if (f.size > LIMITE) { setErro(`"${f.name}" tem ${(f.size / 1048576).toFixed(1)} MB. O limite é 20 MB.`); return; }
    setSubindo(0);
    try {
      const r1 = await fetch("/api/chat/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size }),
      });
      const d1 = await r1.json();
      if (!r1.ok) { setErro(d1?.error || "Falha ao preparar o envio."); setSubindo(null); return; }
      await new Promise<void>((ok, falha) => {
        const x = new XMLHttpRequest();
        x.open("PUT", d1.url, true);
        x.setRequestHeader("Content-Type", f.type || "application/octet-stream");
        x.upload.onprogress = (e) => { if (e.lengthComputable) setSubindo(Math.round((e.loaded / e.total) * 100)); };
        x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : falha(new Error("HTTP " + x.status)));
        x.onerror = () => falha(new Error("rede"));
        x.send(f);
      });
      const r2 = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: conversa.login, arq: { key: d1.key, nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size } }),
      });
      const d2 = await r2.json();
      if (r2.ok) { setMsgs((m) => [...m, d2.mensagem]); ultimaRef.current = d2.mensagem.em; puxar(); }
    } catch { setErro("Falha ao enviar o arquivo."); }
    finally { setSubindo(null); if (arquivoRef.current) arquivoRef.current.value = ""; }
  }

  async function abrirAnexo(key: string) {
    try {
      const r = await fetch("/api/chat/anexo?key=" + encodeURIComponent(key));
      const d = await r.json();
      if (r.ok && d?.url) {
        const a = document.createElement("a");
        a.href = d.url; a.target = "_blank"; a.rel = "noopener"; a.click();
      }
    } catch {}
  }

  /* ---------- números e filtro ---------- */
  const online = useMemo(() => contatos.filter((c) => c.online), [contatos]);
  const naoLidas = useMemo(() => contatos.reduce((a, c) => a + c.naoLidas, 0), [contatos]);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let base = t ? contatos : soOnline ? online : contatos;
    if (t) {
      base = contatos.filter((c) =>
        (c.nome + " " + (c.postoGrad || "") + " " + (c.lotacao || "") + " " + c.login).toLowerCase().includes(t));
    }
    return [...base].sort((a, b) => {
      if ((b.naoLidas > 0 ? 1 : 0) !== (a.naoLidas > 0 ? 1 : 0)) return b.naoLidas - a.naoLidas;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [contatos, online, busca, soOnline]);

  const nomePorLogin = useCallback(
    (login: string) => contatos.find((c) => c.login === login)?.nome || login,
    [contatos]
  );

  // na tela cheia do chat, a bolha some (mas as chamadas continuam lá)
  if (caminho?.startsWith("/chat")) return null;

  return (
    <>
      {/* as chamadas tocam em QUALQUER tela do sistema */}
      <Chamada eu="" nomeDe={nomePorLogin} chamarAgora={ligarPara} aoFechar={() => setLigarPara(null)} />

      {/* ---------------- bolha fechada ---------------- */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#0F1B2D] py-2.5 pl-3 pr-4 shadow-2xl transition hover:border-[#D4AF37] hover:bg-[#16243a]"
          title="Abrir o chat"
        >
          <span className="relative">
            <MessageSquare className="h-5 w-5 text-[#D4AF37]" />
            {naoLidas > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {online.length} online
          </span>
        </button>
      )}

      {/* ---------------- painel aberto ---------------- */}
      {aberto && (
        <div className="fixed bottom-0 right-0 z-[60] flex h-[70vh] max-h-[560px] w-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#0F1B2D] shadow-2xl sm:bottom-5 sm:right-5 sm:w-[370px] sm:rounded-xl">
          {/* cabeçalho */}
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            {conversa ? (
              <>
                <button onClick={() => setConversa(null)} className="text-[#94A3B8] hover:text-white" title="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Foto c={conversa} tam={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{conversa.nome}</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    {conversa.online ? <span className="text-emerald-400">● online</span> : "offline"}
                  </p>
                </div>
                <button onClick={() => setLigarPara({ para: conversa.login, video: false })}
                  title="Ligar" className="rounded p-1.5 text-[#94A3B8] hover:text-emerald-300">
                  <Phone className="h-4 w-4" />
                </button>
                <button onClick={() => setLigarPara({ para: conversa.login, video: true })}
                  title="Chamada de vídeo" className="rounded p-1.5 text-[#94A3B8] hover:text-[#D4AF37]">
                  <Video className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4 text-[#D4AF37]" />
                <p className="flex-1 text-sm font-bold text-white">
                  Chat
                  <span className="ml-2 text-xs font-normal text-emerald-400">● {online.length} online</span>
                </p>
                <Link href="/chat" title="Abrir em tela cheia"
                  className="rounded p-1.5 text-[#94A3B8] hover:text-white">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
            <button onClick={() => setAberto(false)} className="rounded p-1.5 text-[#94A3B8] hover:text-white" title="Minimizar">
              <Minus className="h-4 w-4" />
            </button>
          </div>

          {erro && (
            <div className="flex items-start justify-between gap-2 border-b border-red-500/30 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
              <span>{erro}</span>
              <button onClick={() => setErro("")}><X className="h-3 w-3" /></button>
            </div>
          )}

          {!conversa ? (
            /* ---------------- lista ---------------- */
            <>
              <div className="border-b border-white/5 p-2.5">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                  <input
                    value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar militar pelo nome…"
                    className="w-full bg-transparent py-1.5 text-sm text-white placeholder-white/35 outline-none"
                  />
                  {busca && <button onClick={() => setBusca("")} className="text-[#94A3B8] hover:text-white"><X className="h-3 w-3" /></button>}
                </div>
                {!busca && (
                  <div className="mt-2 flex gap-1.5 text-[11px]">
                    <button onClick={() => setSoOnline(true)}
                      className={`rounded-full px-2.5 py-0.5 ${soOnline ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-[#94A3B8]"}`}>
                      Online ({online.length})
                    </button>
                    <button onClick={() => setSoOnline(false)}
                      className={`rounded-full px-2.5 py-0.5 ${!soOnline ? "bg-white/15 text-white" : "bg-white/5 text-[#94A3B8]"}`}>
                      Todos ({contatos.length})
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {lista.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[#94A3B8]">
                    {busca ? "Ninguém encontrado com esse nome." : "Ninguém online agora."}
                  </p>
                ) : lista.map((c) => (
                  <button key={c.login} onClick={() => abrir(c)}
                    className="flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2 text-left transition hover:bg-white/5">
                    <span className="relative shrink-0">
                      <Foto c={c} tam={32} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0F1B2D] ${c.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">{c.nome}</span>
                        {c.admin && <span className="shrink-0 rounded bg-[#D4AF37]/15 px-1 text-[9px] font-bold text-[#D4AF37]">P/1</span>}
                      </span>
                      <span className="block truncate text-[11px] text-[#94A3B8]">{c.previa || c.postoGrad || ""}</span>
                    </span>
                    {c.naoLidas > 0 && (
                      <span className="shrink-0 rounded-full bg-[#D4AF37] px-1.5 text-[10px] font-bold text-[#1a1205]">{c.naoLidas}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* ---------------- conversa ---------------- */
            <>
              <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
                {msgs.length === 0 && <p className="py-8 text-center text-xs text-[#94A3B8]">Nenhuma mensagem ainda.</p>}
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-2xl px-2.5 py-1.5 text-[13px] ${m.minha ? "rounded-br-sm bg-[#D4AF37] text-[#1a1205]" : "rounded-bl-sm bg-[#16243a] text-[#E8EEF6]"}`}>
                      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                      {m.arqKey && (
                        <button onClick={() => abrirAnexo(m.arqKey!)}
                          className={`mt-1 flex w-full items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[11px] ${m.minha ? "border-black/20" : "border-white/10"}`}>
                          {ehImagem(m.arqTipo) ? <span>🖼</span> : <FileText className="h-3 w-3 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{m.arqNome}</span>
                          <span className="shrink-0 opacity-70">{tamanhoBR(m.arqTam)}</span>
                          <Download className="h-3 w-3 shrink-0" />
                        </button>
                      )}
                      <p className={`text-right text-[9px] ${m.minha ? "text-[#1a1205]/60" : "text-[#94A3B8]"}`}>
                        {horaBR(m.em)}{m.minha && (m.lida ? " · lida" : " · enviada")}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={fim} />
              </div>

              {subindo !== null && (
                <div className="border-t border-white/5 px-3 py-1.5">
                  <div className="h-1 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-[#D4AF37] transition-all" style={{ width: subindo + "%" }} />
                  </div>
                </div>
              )}

              <div className="flex items-end gap-1.5 border-t border-white/10 p-2">
                <input ref={arquivoRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) mandarArquivo(f); }} />
                <button onClick={() => arquivoRef.current?.click()} disabled={subindo !== null}
                  title="Anexar (até 20 MB)"
                  className="shrink-0 rounded-lg border border-white/10 p-1.5 text-[#94A3B8] hover:border-[#D4AF37] hover:text-white disabled:opacity-40">
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder="Mensagem…"
                  className="max-h-20 min-h-[34px] flex-1 resize-y rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[13px] text-white placeholder-white/35 outline-none focus:border-[#D4AF37]"
                />
                <button onClick={enviar} disabled={enviando || !texto.trim()}
                  className="shrink-0 rounded-lg bg-[#D4AF37] p-1.5 text-[#1a1205] hover:brightness-110 disabled:opacity-40">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
