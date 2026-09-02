"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, Search, X, ArrowLeft, Phone, Video, ChevronDown,
  Pin, Archive, MailOpen, Bell, BellOff,
} from "lucide-react";
import Chamada from "@/components/Chamada";
import ConversaChat, { type ContatoChat } from "@/components/chat/ConversaChat";

/* =========================================================================
   Chat interno do SIGEP — tela cheia, todos com todos.

   Aqui ficam só a LISTA de conversas e o cabeçalho. A conversa em si é o
   componente ConversaChat, o MESMO usado pela janelinha flutuante — foi
   assim que as ferramentas pararam de existir em um lugar só.

   Como funciona (a Vercel não suporta WebSocket, então tudo é por consulta):
   - presença: bate ponto a cada 25 s enquanto a aba está visível, dizendo
     também qual conversa está aberta (para não notificar o que já está
     sendo lido);
   - contatos: recarrega a cada 8 s (quem está online, não lidas, prévia).
   ========================================================================= */

type Contato = ContatoChat & {
  admin: boolean; online: boolean; naoLidas: number; previa: string; em: string | null;
  // como EU organizei esta conversa
  fixada?: boolean; arquivada?: boolean; naoLidaManual?: boolean; silenciada?: boolean;
};

/* Avatar: foto do militar quando existe; iniciais quando não tem. */
function Avatar({ c, tam = 36 }: { c: { nome: string; foto?: string | null }; tam?: number }) {
  const [falhou, setFalhou] = useState(false);
  const st = { width: tam, height: tam };
  if (c.foto && !falhou) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.foto} alt={c.nome} style={st} onError={() => setFalhou(true)}
      className="rounded-full object-cover" />;
  }
  return (
    <span style={st} className="grid place-items-center rounded-full bg-[#16243a] text-xs font-bold text-[#D4AF37]">
      {c.nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

// login "eu" é usado nas chamadas de voz/vídeo.
export default function ChatClient({ eu }: { eu: string; meuNome: string }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Contato | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // false enquanto as tabelas do chat nao existirem no banco
  const [instalado, setInstalado] = useState(true);
  // quando preenchido, dispara a ligacao/chamada de video
  const [ligarPara, setLigarPara] = useState<{ para: string; video: boolean } | null>(null);
  const [menuContato, setMenuContato] = useState<string | null>(null);
  const [verArquivadas, setVerArquivadas] = useState(false);

  const abertoRef = useRef<Contato | null>(null); abertoRef.current = aberto;

  /* ---------------- presença ----------------
     Além de dizer "estou online", a batida informa QUAL conversa está aberta
     na tela. Com isso o servidor não manda notificação de uma conversa que a
     pessoa está lendo neste exato momento. */
  useEffect(() => {
    const bater = () => {
      if (document.hidden) return;
      fetch("/api/chat/presenca", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olhando: abertoRef.current?.login ?? null }),
      }).catch(() => {});
    };
    bater();
    const t = setInterval(bater, 25000);
    document.addEventListener("visibilitychange", bater);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", bater); };
  }, [aberto?.login]);

  /* Saiu do chat (fechou a aba ou foi para outra tela): avisa que não está
     mais olhando nenhuma conversa, para as notificações voltarem na hora. */
  useEffect(() => {
    const largar = () => {
      try {
        const corpo = new Blob([JSON.stringify({ olhando: null })], { type: "application/json" });
        if (!navigator.sendBeacon?.("/api/chat/presenca", corpo)) throw new Error("sem beacon");
      } catch {
        fetch("/api/chat/presenca", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ olhando: null }), keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", largar);
    return () => { window.removeEventListener("pagehide", largar); largar(); };
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
    } catch { /* silencioso */ }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    puxarContatos();
    const t = setInterval(() => { if (!document.hidden) puxarContatos(); }, 8000);
    return () => clearInterval(t);
  }, [puxarContatos]);

  const abrirConversa = useCallback((c: Contato) => {
    setAberto(c); setErro("");
    setContatos((cs) => cs.map((x) => (x.login === c.login ? { ...x, naoLidas: 0 } : x)));
  }, []);

  // clique em qualquer lugar fecha o menu da conversa
  useEffect(() => {
    if (!menuContato) return;
    const fechar = () => setMenuContato(null);
    // no tique seguinte, para o próprio clique que abriu não fechar junto
    const t = setTimeout(() => document.addEventListener("click", fechar), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", fechar); };
  }, [menuContato]);

  // abre direto pelo ?com= (vindo da notificação)
  useEffect(() => {
    if (aberto || contatos.length === 0) return;
    try {
      const alvo = new URLSearchParams(window.location.search).get("com");
      if (alvo) {
        const c = contatos.find((x) => x.login === alvo);
        if (c) abrirConversa(c);
      }
    } catch { /* endereço sem parâmetro: segue */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatos]);

  /* Organização da conversa (fixar, arquivar, não lida, silenciar). É só meu:
     não muda nada do outro lado. */
  async function organizar(c: Contato, acao: string, horas?: number) {
    setMenuContato(null);
    try {
      const r = await fetch("/api/chat/conversa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ com: c.login, acao, horas }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível salvar."); return; }
      // marcar como não lida também fecha a conversa, senão ela se marca como
      // lida de novo no próximo ciclo de busca
      if (acao === "naoLida" && abertoRef.current?.login === c.login) setAberto(null);
      puxarContatos();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = t
      ? contatos.filter((c) =>
          (c.nome + " " + (c.postoGrad || "") + " " + (c.lotacao || "") + " " + c.login).toLowerCase().includes(t))
      : contatos;
    // arquivadas ficam escondidas até pedir para ver (como no WhatsApp)
    return base.filter((c) => (verArquivadas ? c.arquivada : !c.arquivada));
  }, [contatos, busca, verArquivadas]);

  const qtdArquivadas = useMemo(() => contatos.filter((c) => c.arquivada).length, [contatos]);
  const totalNaoLidas = contatos.filter((c) => !c.arquivada).reduce((a, c) => a + c.naoLidas, 0);

  const nomePorLogin = useCallback(
    (login: string) => contatos.find((c) => c.login === login)?.nome || login,
    [contatos]
  );

  /* A conversa aberta guardada no estado envelhece (fica com o "online" e o
     "silenciada" de quando foi aberta). Sempre que a lista recarrega, pega a
     linha nova dessa mesma pessoa. */
  const conversaViva = useMemo(
    () => (aberto ? contatos.find((c) => c.login === aberto.login) ?? aberto : null),
    [aberto, contatos]
  );

  /* ---------------- render ---------------- */
  return (
    <div className="mx-auto max-w-6xl">
      <Chamada
        eu={eu}
        nomeDe={nomePorLogin}
        chamarAgora={ligarPara}
        aoFechar={() => setLigarPara(null)}
      />
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
          {(qtdArquivadas > 0 || verArquivadas) && (
            <button
              onClick={() => setVerArquivadas((v) => !v)}
              className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left text-xs text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
            >
              <Archive className="h-3.5 w-3.5" />
              {verArquivadas ? "Voltar às conversas" : `Arquivadas (${qtdArquivadas})`}
            </button>
          )}
          <div className="max-h-[62vh] overflow-y-auto">
            {carregando ? (
              <p className="p-4 text-center text-sm text-[#94A3B8]">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <p className="p-4 text-center text-sm text-[#94A3B8]">Nenhum militar encontrado.</p>
            ) : filtrados.map((c) => (
              <div
                key={c.login}
                className={`group/linha relative flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5 transition hover:bg-white/5 ${
                  aberto?.login === c.login ? "bg-white/[.07]" : ""}`}
              >
                <button onClick={() => abrirConversa(c)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="relative shrink-0">
                    <Avatar c={c} tam={36} />
                    <span
                      title={c.online ? "Online" : "Offline"}
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0F1B2D] ${
                        c.online ? "bg-emerald-400" : "bg-slate-600"}`}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {c.fixada && <Pin className="h-3 w-3 shrink-0 text-[#D4AF37]" />}
                      <span className="truncate text-sm font-semibold text-white">{c.nome}</span>
                      {c.silenciada && <BellOff className="h-3 w-3 shrink-0 text-[#94A3B8]" />}
                      {c.admin && <span className="shrink-0 rounded bg-[#D4AF37]/15 px-1 text-[9px] font-bold uppercase text-[#D4AF37]">P/1</span>}
                    </span>
                    <span className="block truncate text-xs text-[#94A3B8]">
                      {c.previa || c.postoGrad || c.lotacao || c.login}
                    </span>
                  </span>
                </button>

                {c.naoLidas > 0 ? (
                  <span className="shrink-0 rounded-full bg-[#D4AF37] px-1.5 py-0.5 text-[10px] font-bold text-[#1a1205]">
                    {c.naoLidas}
                  </span>
                ) : c.naoLidaManual ? (
                  <span title="Marcada como não lida" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D4AF37]" />
                ) : null}

                <button
                  onClick={(e) => { e.stopPropagation(); setMenuContato(menuContato === c.login ? null : c.login); }}
                  title="Opções da conversa"
                  className="shrink-0 rounded p-1 text-[#94A3B8] opacity-60 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover/linha:opacity-100"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {menuContato === c.login && (
                  <div onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-11 z-30 w-48 overflow-hidden rounded-lg border border-[#2b3f63] bg-[#0F1B2D] shadow-xl">
                    <button onClick={() => organizar(c, c.fixada ? "desfixar" : "fixar")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                      <Pin className="h-3.5 w-3.5" /> {c.fixada ? "Desafixar" : "Fixar no topo"}
                    </button>
                    <button onClick={() => organizar(c, c.naoLidaManual ? "lida" : "naoLida")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                      <MailOpen className="h-3.5 w-3.5" />
                      {c.naoLidaManual ? "Marcar como lida" : "Marcar como não lida"}
                    </button>
                    <button onClick={() => organizar(c, c.arquivada ? "desarquivar" : "arquivar")}
                      className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                      <Archive className="h-3.5 w-3.5" /> {c.arquivada ? "Desarquivar" : "Arquivar"}
                    </button>

                    {/* silenciar: para de tocar o celular, mas a mensagem
                        continua chegando normalmente na conversa */}
                    {c.silenciada ? (
                      <button onClick={() => organizar(c, "desilenciar")}
                        className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                        <Bell className="h-3.5 w-3.5" /> Reativar som
                      </button>
                    ) : (
                      <div className="border-t border-white/5">
                        <p className="flex items-center gap-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                          <BellOff className="h-3 w-3" /> Silenciar
                        </p>
                        <div className="flex gap-1 px-2 pb-2 pt-1">
                          {[
                            { rot: "8 horas", horas: 8 },
                            { rot: "1 semana", horas: 168 },
                            { rot: "Sempre", horas: 0 },
                          ].map((o) => (
                            <button
                              key={o.rot}
                              onClick={() => organizar(c, "silenciar", o.horas)}
                              className="flex-1 rounded border border-[#2b3f63] px-1 py-1 text-[10px] text-[#E8EEF6] transition hover:bg-white/10"
                            >
                              {o.rot}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ---------- conversa ---------- */}
        <section className={`flex min-h-[62vh] flex-col rounded-xl border border-[#1d2c44] bg-[#0F1B2D] ${conversaViva ? "" : "hidden md:flex"}`}>
          {!conversaViva ? (
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
                  <Avatar c={conversaViva} tam={36} />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0F1B2D] ${
                    conversaViva.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-white">
                    {[conversaViva.postoGrad, conversaViva.nome].filter(Boolean).join(" ")}
                    {conversaViva.silenciada && <BellOff className="h-3 w-3 shrink-0 text-[#94A3B8]" />}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {conversaViva.online ? <span className="text-emerald-400">● online agora</span> : "offline"}
                    {conversaViva.lotacao ? " · " + conversaViva.lotacao : ""}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setLigarPara({ para: conversaViva.login, video: false })}
                    title="Ligar (voz)"
                    className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-emerald-400 hover:text-emerald-300"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLigarPara({ para: conversaViva.login, video: true })}
                    title="Chamada de vídeo"
                    className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <ConversaChat
                contato={conversaViva}
                contatos={contatos}
                aoMudarContatos={puxarContatos}
                alturaMaxLista="48vh"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
