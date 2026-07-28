"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Search, Paperclip, Send, X, Download, FileText, Loader2, ArrowLeft } from "lucide-react";

/* =========================================================================
   Chat interno do SIGEP — todos com todos.

   Como funciona (a Vercel não suporta WebSocket, então tudo é por consulta):
   - presença: bate ponto a cada 25 s enquanto a aba está visível;
   - contatos: recarrega a cada 8 s (quem está online, não lidas, prévia);
   - conversa aberta: busca só o que chegou depois da última mensagem, a
     cada 3 s — leve no banco e parece instantâneo na tela.
   - anexo: o arquivo vai do navegador DIRETO para o R2 por URL assinada,
     porque a plataforma corta requisições acima de ~4,5 MB.
   ========================================================================= */

type Contato = {
  login: string; nome: string; postoGrad: string | null; lotacao: string | null;
  admin: boolean; online: boolean; naoLidas: number; previa: string; em: string | null;
};
type Msg = {
  id: string; minha: boolean; texto: string | null;
  arqKey: string | null; arqNome: string | null; arqTipo: string | null; arqTam: number | null;
  em: string; lida: boolean;
};

const LIMITE = 20 * 1024 * 1024;

function tamanhoBR(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function horaBR(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function diaBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return "Hoje";
  if (mesmo(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const ehImagem = (t: string | null) => !!t && t.startsWith("image/");

export default function ChatClient({ eu, meuNome }: { eu: string; meuNome: string }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Contato | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subindo, setSubindo] = useState<{ nome: string; pct: number } | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // false enquanto as tabelas do chat nao existirem no banco
  const [instalado, setInstalado] = useState(true);

  const fim = useRef<HTMLDivElement | null>(null);
  const abertoRef = useRef<Contato | null>(null); abertoRef.current = aberto;
  const ultimaRef = useRef<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  /* ---------------- presença ---------------- */
  useEffect(() => {
    const bater = () => {
      if (document.hidden) return;
      fetch("/api/chat/presenca", { method: "POST" }).catch(() => {});
    };
    bater();
    const t = setInterval(bater, 25000);
    document.addEventListener("visibilitychange", bater);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", bater); };
  }, []);

  /* ---------------- contatos ---------------- */
  const puxarContatos = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/contatos");
      if (!r.ok) return;
      const d = await r.json();
      if (d?.instalado === false) { setInstalado(false); return; }
      setInstalado(true);
      if (Array.isArray(d?.contatos)) setContatos(d.contatos);
    } catch {}
    finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    puxarContatos();
    const t = setInterval(() => { if (!document.hidden) puxarContatos(); }, 8000);
    return () => clearInterval(t);
  }, [puxarContatos]);

  /* ---------------- conversa aberta ---------------- */
  const abrirConversa = useCallback(async (c: Contato) => {
    setAberto(c); setMsgs([]); ultimaRef.current = null; setErro("");
    try {
      const r = await fetch("/api/chat/mensagens?com=" + encodeURIComponent(c.login));
      const d = await r.json();
      const lista: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
      setMsgs(lista);
      if (lista.length) ultimaRef.current = lista[lista.length - 1].em;
      setContatos((cs) => cs.map((x) => (x.login === c.login ? { ...x, naoLidas: 0 } : x)));
    } catch {}
  }, []);

  // novas mensagens da conversa aberta
  useEffect(() => {
    if (!aberto) return;
    const puxar = async () => {
      if (document.hidden) return;
      const c = abertoRef.current; if (!c) return;
      try {
        const q = "/api/chat/mensagens?com=" + encodeURIComponent(c.login) +
          (ultimaRef.current ? "&depois=" + encodeURIComponent(ultimaRef.current) : "");
        const r = await fetch(q);
        if (!r.ok) return;
        const d = await r.json();
        const novas: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
        if (novas.length) {
          setMsgs((m) => {
            const vistos = new Set(m.map((x) => x.id));
            const add = novas.filter((x) => !vistos.has(x.id));
            return add.length ? [...m, ...add] : m;
          });
          ultimaRef.current = novas[novas.length - 1].em;
        }
      } catch {}
    };
    const t = setInterval(puxar, 3000);
    return () => clearInterval(t);
  }, [aberto]);

  // rola para o fim quando chega mensagem
  useEffect(() => {
    const l = listaRef.current;
    if (!l) return;
    const perto = l.scrollHeight - l.scrollTop - l.clientHeight < 220;
    if (perto || msgs.length <= 1) fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  // abre direto pelo ?com= (vindo da notificação)
  useEffect(() => {
    if (aberto || contatos.length === 0) return;
    try {
      const alvo = new URLSearchParams(window.location.search).get("com");
      if (alvo) {
        const c = contatos.find((x) => x.login === alvo);
        if (c) abrirConversa(c);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatos]);

  /* ---------------- enviar ---------------- */
  async function enviarTexto() {
    const t = texto.trim();
    if (!t || !aberto || enviando) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: aberto.login, texto: t }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível enviar."); return; }
      setTexto("");
      setMsgs((m) => [...m, d.mensagem]);
      ultimaRef.current = d.mensagem.em;
      puxarContatos();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  async function enviarArquivo(f: File) {
    if (!aberto) return;
    setErro("");
    if (f.size > LIMITE) {
      setErro(`"${f.name}" tem ${(f.size / 1048576).toFixed(1)} MB. O limite é 20 MB.`);
      return;
    }
    setSubindo({ nome: f.name, pct: 0 });
    try {
      // 1) pede a URL assinada
      const r1 = await fetch("/api/chat/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size }),
      });
      const d1 = await r1.json();
      if (!r1.ok) { setErro(d1?.error || "Falha ao preparar o envio."); setSubindo(null); return; }

      // 2) manda o arquivo DIRETO para o R2 (com barra de progresso).
      //    Aqui é onde o CORS do bucket entra em jogo: sem ele o navegador
      //    bloqueia antes de sair, e o erro chega como status 0.
      await new Promise<void>((ok, falha) => {
        const x = new XMLHttpRequest();
        x.open("PUT", d1.url, true);
        x.setRequestHeader("Content-Type", f.type || "application/octet-stream");
        x.upload.onprogress = (e) => {
          if (e.lengthComputable) setSubindo({ nome: f.name, pct: Math.round((e.loaded / e.total) * 100) });
        };
        x.onload = () => {
          if (x.status >= 200 && x.status < 300) return ok();
          // o R2 devolve o motivo em XML; mostra o essencial
          const det = (x.responseText || "").replace(/<[^>]+>/g, " ").trim().slice(0, 160);
          falha(new Error("O armazenamento recusou (código " + x.status + ")." + (det ? " " + det : "")));
        };
        x.onerror = () => falha(new Error("__CORS__"));
        x.ontimeout = () => falha(new Error("Tempo esgotado no envio. Verifique a conexão."));
        x.send(f);
      });

      // 3) registra a mensagem
      const r2 = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para: aberto.login,
          arq: { key: d1.key, nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size },
        }),
      });
      const d2 = await r2.json();
      if (!r2.ok) { setErro(d2?.error || "Arquivo enviado, mas a mensagem falhou."); return; }
      setMsgs((m) => [...m, d2.mensagem]);
      ultimaRef.current = d2.mensagem.em;
      puxarContatos();
    } catch (e: any) {
      const m = String(e?.message || "");
      if (m === "__CORS__") {
        // status 0 = o navegador barrou antes de sair. Quase sempre é o CORS
        // do bucket ainda não liberado para este endereço.
        setErro(
          "O navegador bloqueou o envio ao armazenamento. Isso acontece quando o CORS do bucket R2 " +
          "ainda não autoriza este endereço (" + window.location.origin + "). " +
          "Confira em Cloudflare → R2 → sigep-documentos → Settings → CORS Policy se a origem está " +
          "exatamente assim, sem barra no final. Se acabou de configurar, aguarde 1 a 2 minutos e recarregue com Ctrl+F5."
        );
      } else {
        setErro(m || "Falha ao enviar o arquivo. Verifique a conexão e tente de novo.");
      }
    } finally {
      setSubindo(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  async function abrirAnexo(key: string, baixar: boolean) {
    try {
      const r = await fetch("/api/chat/anexo?key=" + encodeURIComponent(key));
      const d = await r.json();
      if (!r.ok || !d?.url) { setErro(d?.error || "Não foi possível abrir o anexo."); return; }
      const a = document.createElement("a");
      a.href = d.url;
      if (baixar) a.download = d.nome || "arquivo";
      a.target = "_blank"; a.rel = "noopener";
      a.click();
    } catch { setErro("Não foi possível abrir o anexo."); }
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return contatos;
    return contatos.filter((c) =>
      (c.nome + " " + (c.postoGrad || "") + " " + (c.lotacao || "") + " " + c.login).toLowerCase().includes(t));
  }, [contatos, busca]);

  const totalNaoLidas = contatos.reduce((a, c) => a + c.naoLidas, 0);

  /* ---------------- render ---------------- */
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
        <MessageSquare className="h-6 w-6 text-[#D4AF37]" /> Chat
        {totalNaoLidas > 0 && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
            {totalNaoLidas} não lida{totalNaoLidas > 1 ? "s" : ""}
          </span>
        )}
      </h1>
      <p className="mb-4 text-sm text-[#94A3B8]">
        Converse com qualquer militar do batalhão. Envie fotos e arquivos de até 20 MB.
      </p>

      {erro && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          <span>{erro}</span>
          <button onClick={() => setErro("")} className="shrink-0 text-red-300 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!instalado && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-5 text-sm text-amber-100">
          <p className="mb-1 font-bold text-amber-200">Chat ainda não ativado</p>
          <p className="text-amber-100/85">
            As tabelas do chat ainda não foram criadas no banco. Quem administra o sistema
            precisa rodar <code className="rounded bg-black/30 px-1.5 py-0.5">npm run db:push</code> uma
            única vez. Depois é só recarregar esta página.
          </p>
        </div>
      )}

      <div className={`grid gap-3 md:grid-cols-[280px_1fr] ${instalado ? "" : "hidden"}`}>
        {/* ---------- lista de contatos ---------- */}
        <aside className={`rounded-xl border border-[#1d2c44] bg-[#0F1B2D] ${aberto ? "hidden md:block" : ""}`}>
          <div className="border-b border-white/5 p-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
              <input
                value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar militar..."
                className="w-full bg-transparent py-2 text-sm text-white placeholder-white/35 outline-none"
              />
            </div>
          </div>
          <div className="max-h-[62vh] overflow-y-auto">
            {carregando ? (
              <p className="p-4 text-center text-sm text-[#94A3B8]">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <p className="p-4 text-center text-sm text-[#94A3B8]">Nenhum militar encontrado.</p>
            ) : filtrados.map((c) => (
              <button
                key={c.login} onClick={() => abrirConversa(c)}
                className={`flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                  aberto?.login === c.login ? "bg-white/[.07]" : ""}`}
              >
                <span className="relative shrink-0">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#16243a] text-[11px] font-bold text-[#D4AF37]">
                    {c.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <span
                    title={c.online ? "Online" : "Offline"}
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0F1B2D] ${
                      c.online ? "bg-emerald-400" : "bg-slate-600"}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">{c.nome}</span>
                    {c.admin && <span className="shrink-0 rounded bg-[#D4AF37]/15 px-1 text-[9px] font-bold uppercase text-[#D4AF37]">P/1</span>}
                  </span>
                  <span className="block truncate text-xs text-[#94A3B8]">
                    {c.previa || c.postoGrad || c.lotacao || c.login}
                  </span>
                </span>
                {c.naoLidas > 0 && (
                  <span className="shrink-0 rounded-full bg-[#D4AF37] px-1.5 py-0.5 text-[10px] font-bold text-[#1a1205]">
                    {c.naoLidas}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ---------- conversa ---------- */}
        <section className={`flex min-h-[62vh] flex-col rounded-xl border border-[#1d2c44] bg-[#0F1B2D] ${aberto ? "" : "hidden md:flex"}`}>
          {!aberto ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[#94A3B8]">
              Escolha um militar na lista para começar a conversa.
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5">
                <button onClick={() => setAberto(null)} className="md:hidden text-[#94A3B8] hover:text-white">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="relative">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#16243a] text-[11px] font-bold text-[#D4AF37]">
                    {aberto.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0F1B2D] ${
                    aberto.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {[aberto.postoGrad, aberto.nome].filter(Boolean).join(" ")}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {aberto.online ? <span className="text-emerald-400">● online agora</span> : "offline"}
                    {aberto.lotacao ? " · " + aberto.lotacao : ""}
                  </p>
                </div>
              </header>

              <div ref={listaRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: "48vh" }}>
                {msgs.length === 0 && (
                  <p className="py-10 text-center text-sm text-[#94A3B8]">
                    Nenhuma mensagem ainda. Escreva a primeira.
                  </p>
                )}
                {msgs.map((m, i) => {
                  const novoDia = i === 0 || diaBR(m.em) !== diaBR(msgs[i - 1].em);
                  return (
                    <div key={m.id}>
                      {novoDia && (
                        <p className="my-3 text-center text-[11px] uppercase tracking-wider text-[#94A3B8]">{diaBR(m.em)}</p>
                      )}
                      <div className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                          m.minha ? "rounded-br-sm bg-[#D4AF37] text-[#1a1205]" : "rounded-bl-sm bg-[#16243a] text-[#E8EEF6]"}`}>
                          {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}

                          {m.arqKey && ehImagem(m.arqTipo) && (
                            <button onClick={() => abrirAnexo(m.arqKey!, false)}
                              className="mt-1 block w-full overflow-hidden rounded-lg border border-black/20">
                              <span className={`flex items-center gap-2 px-2 py-6 text-xs ${m.minha ? "text-[#1a1205]/80" : "text-[#94A3B8]"}`}>
                                🖼 <b className="truncate">{m.arqNome}</b>
                                <span className="ml-auto shrink-0">{tamanhoBR(m.arqTam)}</span>
                              </span>
                            </button>
                          )}

                          {m.arqKey && !ehImagem(m.arqTipo) && (
                            <button onClick={() => abrirAnexo(m.arqKey!, true)}
                              className={`mt-1 flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs ${
                                m.minha ? "border-black/20 hover:bg-black/10" : "border-white/10 hover:bg-white/5"}`}>
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-semibold">{m.arqNome}</span>
                              <span className="shrink-0 opacity-70">{tamanhoBR(m.arqTam)}</span>
                              <Download className="h-3.5 w-3.5 shrink-0" />
                            </button>
                          )}

                          <p className={`mt-0.5 text-right text-[10px] ${m.minha ? "text-[#1a1205]/60" : "text-[#94A3B8]"}`}>
                            {horaBR(m.em)}{m.minha && (m.lida ? " · lida" : " · enviada")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={fim} />
              </div>

              {subindo && (
                <div className="border-t border-white/5 px-3 py-2">
                  <p className="mb-1 flex items-center gap-2 text-xs text-[#94A3B8]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Enviando <b className="text-white">{subindo.nome}</b> — {subindo.pct}%
                  </p>
                  <div className="h-1 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-[#D4AF37] transition-all" style={{ width: subindo.pct + "%" }} />
                  </div>
                </div>
              )}

              <footer className="flex items-end gap-2 border-t border-white/5 p-2.5">
                <input
                  ref={arquivoRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); }}
                />
                <button
                  onClick={() => arquivoRef.current?.click()} disabled={!!subindo}
                  title="Anexar foto ou arquivo (até 20 MB)"
                  className="shrink-0 rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
                  placeholder="Escreva sua mensagem…"
                  className="max-h-28 min-h-[38px] flex-1 resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-[#D4AF37]"
                />
                <button
                  onClick={enviarTexto} disabled={enviando || !texto.trim()}
                  className="shrink-0 rounded-lg bg-[#D4AF37] p-2 text-[#1a1205] transition hover:brightness-110 disabled:opacity-40"
                  title="Enviar (Enter)"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
