"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Search, X, Minus, ArrowLeft, Phone, Video, Maximize2,
  ChevronDown, Pin, Archive, MailOpen, Bell, BellOff,
} from "lucide-react";
import Link from "next/link";
import Chamada from "@/components/Chamada";
import ConversaChat, { type ContatoChat } from "@/components/chat/ConversaChat";

/* =========================================================================
   Chat flutuante — a bolha no canto que acompanha o usuário em qualquer
   tela do SIGEP. Mostra quantos estão online, abre a lista, procura pelo
   nome e conversa sem sair da página onde a pessoa está.

   A CONVERSA em si é o mesmo componente da tela cheia (ConversaChat), só
   que em modo compacto — assim ferramenta nova aparece nos dois lugares de
   uma vez. Aqui ficam só a bolha, a lista e o cabeçalho.

   Na própria /chat ele não aparece, para não duplicar.
   ========================================================================= */

type Contato = ContatoChat & {
  admin: boolean; online: boolean; naoLidas: number; previa: string; em: string | null;
  // como EU organizei esta conversa
  fixada?: boolean; arquivada?: boolean; naoLidaManual?: boolean; silenciada?: boolean;
};

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
  const [erro, setErro] = useState("");
  const [menuContato, setMenuContato] = useState<string | null>(null);
  const [ligarPara, setLigarPara] = useState<{ para: string; video: boolean } | null>(null);

  const convRef = useRef<Contato | null>(null); convRef.current = conversa;

  /* ---------- presença + contatos (sempre, para a bolha ter número) ----------
     A batida diz também QUAL conversa está na tela, para o servidor não mandar
     notificação de algo que a pessoa já está lendo aqui na janelinha. */
  const puxar = useCallback(async () => {
    if (document.hidden) return;
    try {
      fetch("/api/chat/presenca", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olhando: convRef.current?.login ?? null }),
      }).catch(() => {});
      const r = await fetch("/api/chat/contatos");
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d?.contatos)) setContatos(d.contatos);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    puxar();
    const t = setInterval(puxar, aberto ? 6000 : 20000);
    return () => clearInterval(t);
  }, [puxar, aberto]);

  // trocou de conversa (ou fechou): avisa na hora, sem esperar o próximo ciclo
  useEffect(() => { puxar(); }, [conversa?.login, puxar]);

  // clique em qualquer lugar fecha o menu da conversa
  useEffect(() => {
    if (!menuContato) return;
    const fechar = () => setMenuContato(null);
    const t = setTimeout(() => document.addEventListener("click", fechar), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", fechar); };
  }, [menuContato]);

  const abrir = useCallback((c: Contato) => {
    setConversa(c); setErro("");
    setContatos((cs) => cs.map((x) => (x.login === c.login ? { ...x, naoLidas: 0 } : x)));
  }, []);

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
      // lida de novo no próximo ciclo
      if (acao === "naoLida" && convRef.current?.login === c.login) setConversa(null);
      puxar();
    } catch { setErro("Sem conexão."); }
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
      // fixadas sempre no topo, como no WhatsApp
      if (!!a.fixada !== !!b.fixada) return a.fixada ? -1 : 1;
      if ((b.naoLidas > 0 ? 1 : 0) !== (a.naoLidas > 0 ? 1 : 0)) return b.naoLidas - a.naoLidas;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [contatos, online, busca, soOnline]);

  const nomePorLogin = useCallback(
    (login: string) => contatos.find((c) => c.login === login)?.nome || login,
    [contatos]
  );

  /* A conversa aberta guardada no estado envelhece (fica com o "online" e o
     "silenciada" de quando foi aberta). Sempre que a lista recarrega, pega a
     linha nova dessa mesma pessoa. */
  const conversaViva = useMemo(
    () => (conversa ? contatos.find((c) => c.login === conversa.login) ?? conversa : null),
    [conversa, contatos]
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
            {conversaViva ? (
              <>
                <button onClick={() => setConversa(null)} className="text-[#94A3B8] hover:text-white" title="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Foto c={conversaViva} tam={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-bold text-white">
                    {conversaViva.nome}
                    {conversaViva.silenciada && <BellOff className="h-3 w-3 shrink-0 text-[#94A3B8]" />}
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">
                    {conversaViva.online ? <span className="text-emerald-400">● online</span> : "offline"}
                  </p>
                </div>
                <button onClick={() => setLigarPara({ para: conversaViva.login, video: false })}
                  title="Ligar" className="rounded p-1.5 text-[#94A3B8] hover:text-emerald-300">
                  <Phone className="h-4 w-4" />
                </button>
                <button onClick={() => setLigarPara({ para: conversaViva.login, video: true })}
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

          {!conversaViva ? (
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
                  <div key={c.login} className="relative flex items-center gap-2 border-b border-white/5 px-3 py-2 transition hover:bg-white/5">
                    <button onClick={() => abrir(c)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className="relative shrink-0">
                        <Foto c={c} tam={32} />
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0F1B2D] ${c.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {c.fixada && <Pin className="h-3 w-3 shrink-0 text-[#D4AF37]" />}
                          <span className="truncate text-sm font-medium text-white">{c.nome}</span>
                          {c.silenciada && <BellOff className="h-3 w-3 shrink-0 text-[#94A3B8]" />}
                          {c.admin && <span className="shrink-0 rounded bg-[#D4AF37]/15 px-1 text-[9px] font-bold text-[#D4AF37]">P/1</span>}
                        </span>
                        <span className="block truncate text-[11px] text-[#94A3B8]">{c.previa || c.postoGrad || ""}</span>
                      </span>
                    </button>

                    {c.naoLidas > 0 ? (
                      <span className="shrink-0 rounded-full bg-[#D4AF37] px-1.5 text-[10px] font-bold text-[#1a1205]">{c.naoLidas}</span>
                    ) : c.naoLidaManual ? (
                      <span title="Marcada como não lida" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D4AF37]" />
                    ) : null}

                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuContato(menuContato === c.login ? null : c.login); }}
                      title="Opções da conversa"
                      className="shrink-0 rounded p-1 text-[#94A3B8] transition hover:bg-white/10 hover:text-white"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>

                    {menuContato === c.login && (
                      <div onClick={(e) => e.stopPropagation()}
                        className="absolute right-2 top-10 z-30 w-48 overflow-hidden rounded-lg border border-[#2b3f63] bg-[#0F1B2D] shadow-xl">
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
                                <button key={o.rot} onClick={() => organizar(c, "silenciar", o.horas)}
                                  className="flex-1 rounded border border-[#2b3f63] px-1 py-1 text-[10px] text-[#E8EEF6] transition hover:bg-white/10">
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
            </>
          ) : (
            /* ---------------- conversa (a mesma da tela cheia) ---------------- */
            <ConversaChat
              contato={conversaViva}
              contatos={contatos}
              compacto
              aoMudarContatos={puxar}
            />
          )}
        </div>
      )}
    </>
  );
}
