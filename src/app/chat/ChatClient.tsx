"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, Search, Paperclip, Send, X, Download, FileText, Loader2, ArrowLeft, Phone, Video,
  Mic, Reply, Copy, Pencil, Trash2, Ban, Check, ChevronDown,
} from "lucide-react";
import Chamada from "@/components/Chamada";

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
  foto?: string | null;
};
type Msg = {
  id: string; minha: boolean; texto: string | null;
  arqKey: string | null; arqNome: string | null; arqTipo: string | null; arqTam: number | null;
  em: string; lida: boolean; lidaEm?: string | null;
  editada?: boolean; apagada?: boolean;
  // mensagem citada (responder), já com o trecho pronto para o balão
  citada?: { id: string; minha: boolean; trecho: string } | null;
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
const ehAudio = (t: string | null) => !!t && t.startsWith("audio/");

// 0:07 — duração da gravação, no formato que todo mundo conhece
function relogio(seg: number): string {
  const m = Math.floor(seg / 60);
  return `${m}:${String(seg % 60).padStart(2, "0")}`;
}

/* Avatar: foto do militar quando existe; iniciais quando não tem. */
function Avatar({ c, tam = 36 }: { c: { nome: string; foto?: string | null }; tam?: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tam, height: tam };
  if (c.foto && !falhou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={c.foto} alt={c.nome} style={estilo} onError={() => setFalhou(true)}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <span style={estilo} className="grid place-items-center rounded-full bg-[#16243a] text-[11px] font-bold text-[#D4AF37]">
      {c.nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

// meuNome vem da página (continua no contrato do componente) — hoje só o
// login "eu" é usado aqui dentro.
export default function ChatClient({ eu }: { eu: string; meuNome: string }) {
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
  // URL temporaria de cada imagem, para mostrar a foto dentro do balao
  const [previas, setPrevias] = useState<Record<string, string>>({});
  // quando preenchido, dispara a ligacao/chamada de video
  const [ligarPara, setLigarPara] = useState<{ para: string; video: boolean } | null>(null);
  // ---- ferramentas de mensagem (responder, editar, apagar) ----
  const [respondendo, setRespondendo] = useState<Msg | null>(null);
  const [editando, setEditando] = useState<{ id: string; textoOriginal: string } | null>(null);
  const [menuDe, setMenuDe] = useState<string | null>(null); // id da mensagem com o menu aberto
  // ---- gravacao de voz ----
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const cancelouRef = useRef(false);

  const fim = useRef<HTMLDivElement | null>(null);
  const abertoRef = useRef<Contato | null>(null); abertoRef.current = aberto;
  const ultimaRef = useRef<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);

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

  // clique em qualquer lugar fecha o menu da mensagem
  useEffect(() => {
    if (!menuDe) return;
    const fechar = () => setMenuDe(null);
    // no tique seguinte, para o próprio clique que abriu não fechar junto
    const t = setTimeout(() => document.addEventListener("click", fechar), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", fechar); };
  }, [menuDe]);

  // conta os segundos enquanto grava (para mostrar 0:07 igual ao WhatsApp)
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // Busca a URL temporária de imagens E áudios, para tocar/ver no balão.
  useEffect(() => {
    const faltando = msgs.filter(
      (m) => m.arqKey && (ehImagem(m.arqTipo) || ehAudio(m.arqTipo)) && !previas[m.arqKey]
    );
    if (faltando.length === 0) return;
    let vivo = true;
    (async () => {
      for (const m of faltando.slice(0, 12)) {
        try {
          const r = await fetch("/api/chat/anexo?key=" + encodeURIComponent(m.arqKey!));
          const d = await r.json();
          if (vivo && r.ok && d?.url) setPrevias((p) => ({ ...p, [m.arqKey!]: d.url }));
        } catch {}
      }
    })();
    return () => { vivo = false; };
  }, [msgs, previas]);

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

    // com o campo em modo de edição, o mesmo botão salva em vez de mandar nova
    if (editando) return salvarEdicao(t);

    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para: aberto.login,
          texto: t,
          ...(respondendo ? { respondeA: respondendo.id } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível enviar."); return; }
      setTexto("");
      setRespondendo(null);
      setMsgs((m) => [...m, d.mensagem]);
      ultimaRef.current = d.mensagem.em;
      puxarContatos();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  /* ---------------- ferramentas de mensagem ---------------- */

  // Responder citando: a citação fica em cima do campo até enviar ou cancelar.
  function responder(m: Msg) {
    setMenuDe(null);
    setEditando(null);
    setRespondendo(m);
    campoRef.current?.focus();
  }

  function comecarEdicao(m: Msg) {
    setMenuDe(null);
    setRespondendo(null);
    setEditando({ id: m.id, textoOriginal: m.texto || "" });
    setTexto(m.texto || "");
    campoRef.current?.focus();
  }

  function cancelarEdicao() {
    setEditando(null);
    setTexto("");
  }

  async function salvarEdicao(novoTexto: string) {
    if (!editando) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editando.id, texto: novoTexto }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível editar."); return; }
      setMsgs((ms) => ms.map((x) => (x.id === editando.id ? { ...x, texto: d.texto, editada: true } : x)));
      cancelarEdicao();
      puxarContatos();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  // Apagar para todos: a mensagem vira "mensagem apagada" dos dois lados.
  async function apagar(m: Msg) {
    setMenuDe(null);
    if (!confirm("Apagar esta mensagem para todos? Quem recebeu vai ver que uma mensagem foi apagada.")) return;
    try {
      const r = await fetch("/api/chat/mensagens?id=" + encodeURIComponent(m.id), { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error || "Não foi possível apagar."); return; }
      setMsgs((ms) => ms.map((x) => (x.id === m.id
        ? { ...x, apagada: true, texto: null, arqKey: null, arqNome: null, arqTipo: null, arqTam: null, citada: null }
        : x)));
      if (editando?.id === m.id) cancelarEdicao();
      if (respondendo?.id === m.id) setRespondendo(null);
      puxarContatos();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  async function copiar(m: Msg) {
    setMenuDe(null);
    const t = m.texto || m.arqNome || "";
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch { setErro("O navegador não deixou copiar. Selecione o texto à mão."); }
  }

  /* ---------------- mensagem de voz ---------------- */

  async function iniciarGravacao() {
    if (gravando || subindo) return;
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // o formato varia por navegador: o Safari só grava mp4/aac
      const tipo = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacosRef.current = [];
      cancelouRef.current = false;

      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) pedacosRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const cancelou = cancelouRef.current;
        const blob = new Blob(pedacosRef.current, { type: rec.mimeType || "audio/webm" });
        pedacosRef.current = [];
        setSegundos(0);
        // toque sem querer no botão não vira mensagem
        if (cancelou || blob.size < 1500) return;
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : (rec.mimeType || "").includes("ogg") ? "ogg" : "webm";
        const agora = new Date();
        const nome = `Mensagem de voz ${agora.toLocaleDateString("pt-BR")} ${horaBR(agora.toISOString()).replace(":", "h")}.${ext}`;
        await enviarArquivo(new File([blob], nome, { type: blob.type || "audio/webm" }));
      };

      rec.start();
      gravadorRef.current = rec;
      setGravando(true);
      setSegundos(0);
    } catch {
      setErro("Não foi possível usar o microfone. Autorize o acesso no navegador e tente de novo.");
    }
  }

  function pararGravacao(enviar: boolean) {
    cancelouRef.current = !enviar;
    try { gravadorRef.current?.stop(); } catch {}
    gravadorRef.current = null;
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
  const nomePorLogin = useCallback(
    (login: string) => contatos.find((c) => c.login === login)?.nome || login,
    [contatos]
  );

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
                  <Avatar c={c} tam={36} />
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
                  <Avatar c={aberto} tam={36} />
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
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setLigarPara({ para: aberto.login, video: false })}
                    title="Ligar (voz)"
                    className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-emerald-400 hover:text-emerald-300"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLigarPara({ para: aberto.login, video: true })}
                    title="Chamada de vídeo"
                    className="rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  >
                    <Video className="h-4 w-4" />
                  </button>
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
                      <div className={`group relative flex items-start gap-1 ${m.minha ? "justify-end" : "justify-start"}`}>
                        {/* menu da mensagem: responder, copiar, editar, apagar */}
                        {!m.apagada && (
                          <div className={`relative ${m.minha ? "order-1" : "order-2"}`}>
                            <button
                              onClick={() => setMenuDe(menuDe === m.id ? null : m.id)}
                              title="Opções da mensagem"
                              className="mt-2 rounded p-1 text-[#94A3B8] opacity-60 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            {menuDe === m.id && (
                              <div className={`absolute z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#2b3f63] bg-[#0F1B2D] shadow-xl ${
                                m.minha ? "left-0" : "right-0"}`}>
                                <button onClick={() => responder(m)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                                  <Reply className="h-3.5 w-3.5" /> Responder
                                </button>
                                {(m.texto || m.arqNome) && (
                                  <button onClick={() => copiar(m)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                                    <Copy className="h-3.5 w-3.5" /> Copiar
                                  </button>
                                )}
                                {m.minha && m.texto && (
                                  <button onClick={() => comecarEdicao(m)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                                    <Pencil className="h-3.5 w-3.5" /> Editar
                                  </button>
                                )}
                                {m.minha && (
                                  <button onClick={() => apagar(m)}
                                    className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10">
                                    <Trash2 className="h-3.5 w-3.5" /> Apagar para todos
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.minha ? "order-2" : "order-1"} ${
                          m.apagada
                            ? "rounded-bl-sm border border-dashed border-white/15 bg-transparent text-[#94A3B8]"
                            : m.minha ? "rounded-br-sm bg-[#D4AF37] text-[#1a1205]" : "rounded-bl-sm bg-[#16243a] text-[#E8EEF6]"}`}>

                          {m.apagada ? (
                            <p className="flex items-center gap-1.5 italic">
                              <Ban className="h-3.5 w-3.5 shrink-0" /> Mensagem apagada
                            </p>
                          ) : (<>

                          {/* trecho da mensagem citada (responder) */}
                          {m.citada && (
                            <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${
                              m.minha ? "border-[#1a1205]/40 bg-black/10 text-[#1a1205]/80" : "border-[#D4AF37] bg-black/25 text-[#94A3B8]"}`}>
                              <b className={m.minha ? "text-[#1a1205]" : "text-[#D4AF37]"}>
                                {m.citada.minha ? "Você" : (aberto?.nome ?? "")}
                              </b>
                              <span className="ml-1 line-clamp-2 break-words">{m.citada.trecho}</span>
                            </div>
                          )}

                          {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}

                          {/* mensagem de voz */}
                          {m.arqKey && ehAudio(m.arqTipo) && (
                            previas[m.arqKey] ? (
                              // eslint-disable-next-line jsx-a11y/media-has-caption
                              <audio controls src={previas[m.arqKey]} preload="none" className="mt-1 h-9 w-56 max-w-full" />
                            ) : (
                              <span className={`mt-1 flex items-center gap-2 text-xs ${m.minha ? "text-[#1a1205]/70" : "text-[#94A3B8]"}`}>
                                <Mic className="h-3.5 w-3.5" /> Mensagem de voz…
                              </span>
                            )
                          )}

                          {m.arqKey && ehImagem(m.arqTipo) && (
                            <button onClick={() => abrirAnexo(m.arqKey!, false)}
                              title={`${m.arqNome} · ${tamanhoBR(m.arqTam)} — abrir em tamanho real`}
                              className="mt-1 block w-full overflow-hidden rounded-lg border border-black/20">
                              {previas[m.arqKey] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={previas[m.arqKey]} alt={m.arqNome || "imagem"}
                                  className="max-h-60 w-full object-cover" />
                              ) : (
                                <span className={`flex items-center gap-2 px-2 py-6 text-xs ${m.minha ? "text-[#1a1205]/80" : "text-[#94A3B8]"}`}>
                                  🖼 <b className="truncate">{m.arqNome}</b>
                                  <span className="ml-auto shrink-0">{tamanhoBR(m.arqTam)}</span>
                                </span>
                              )}
                            </button>
                          )}

                          {m.arqKey && !ehImagem(m.arqTipo) && !ehAudio(m.arqTipo) && (
                            <button onClick={() => abrirAnexo(m.arqKey!, true)}
                              className={`mt-1 flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs ${
                                m.minha ? "border-black/20 hover:bg-black/10" : "border-white/10 hover:bg-white/5"}`}>
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-semibold">{m.arqNome}</span>
                              <span className="shrink-0 opacity-70">{tamanhoBR(m.arqTam)}</span>
                              <Download className="h-3.5 w-3.5 shrink-0" />
                            </button>
                          )}

                          </>)}

                          <p className={`mt-0.5 text-right text-[10px] ${
                            m.apagada ? "text-[#94A3B8]" : m.minha ? "text-[#1a1205]/60" : "text-[#94A3B8]"}`}>
                            {horaBR(m.em)}
                            {m.editada && !m.apagada && " · editada"}
                            {m.minha && !m.apagada && (m.lida
                              ? " · lida" + (m.lidaEm ? " " + horaBR(m.lidaEm) : "")
                              : " · enviada")}
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

              {/* respondendo a alguém: a citação fica presa acima do campo */}
              {respondendo && (
                <div className="flex items-start gap-2 border-t border-white/5 bg-black/20 px-3 py-2">
                  <span className="mt-0.5 h-8 w-0.5 shrink-0 rounded bg-[#D4AF37]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-[#D4AF37]">
                      Respondendo {respondendo.minha ? "você mesmo" : (aberto?.nome ?? "")}
                    </p>
                    <p className="truncate text-xs text-[#94A3B8]">
                      {respondendo.texto
                        || (ehAudio(respondendo.arqTipo) ? "🎤 Mensagem de voz"
                            : ehImagem(respondendo.arqTipo) ? "🖼 Foto"
                            : "📎 " + (respondendo.arqNome || "arquivo"))}
                    </p>
                  </div>
                  <button onClick={() => setRespondendo(null)} title="Cancelar resposta"
                    className="shrink-0 text-[#94A3B8] hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* editando uma mensagem já enviada */}
              {editando && (
                <div className="flex items-center gap-2 border-t border-white/5 bg-black/20 px-3 py-2">
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                  <p className="min-w-0 flex-1 truncate text-xs text-[#94A3B8]">
                    Editando a mensagem — quem recebeu verá “editada”.
                  </p>
                  <button onClick={cancelarEdicao} title="Cancelar edição"
                    className="shrink-0 text-[#94A3B8] hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <footer className="flex items-end gap-2 border-t border-white/5 p-2.5">
                <input
                  ref={arquivoRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); }}
                />

                {gravando ? (
                  /* gravando: o campo some e dá lugar ao contador, como no WhatsApp */
                  <>
                    <button
                      onClick={() => pararGravacao(false)} title="Cancelar gravação"
                      className="shrink-0 rounded-lg border border-red-500/40 p-2 text-red-300 transition hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                      <span className="text-sm font-semibold text-red-200">Gravando… {relogio(segundos)}</span>
                      <span className="ml-auto text-[11px] text-red-200/70">toque no envio para mandar</span>
                    </div>
                    <button
                      onClick={() => pararGravacao(true)}
                      className="shrink-0 rounded-lg bg-[#D4AF37] p-2 text-[#1a1205] transition hover:brightness-110"
                      title="Enviar áudio"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => arquivoRef.current?.click()} disabled={!!subindo}
                      title="Anexar foto ou arquivo (até 20 MB)"
                      className="shrink-0 rounded-lg border border-white/10 p-2 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-40"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <textarea
                      ref={campoRef}
                      value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
                        if (e.key === "Escape" && editando) cancelarEdicao();
                      }}
                      placeholder={editando ? "Corrija a mensagem…" : "Escreva sua mensagem…"}
                      className="max-h-28 min-h-[38px] flex-1 resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-[#D4AF37]"
                    />
                    {/* sem texto digitado, o botão vira microfone — igual ao WhatsApp */}
                    {texto.trim() || editando ? (
                      <button
                        onClick={enviarTexto} disabled={enviando || !texto.trim()}
                        className="shrink-0 rounded-lg bg-[#D4AF37] p-2 text-[#1a1205] transition hover:brightness-110 disabled:opacity-40"
                        title={editando ? "Salvar edição (Enter)" : "Enviar (Enter)"}
                      >
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      </button>
                    ) : (
                      <button
                        onClick={iniciarGravacao} disabled={!!subindo}
                        className="shrink-0 rounded-lg bg-[#D4AF37] p-2 text-[#1a1205] transition hover:brightness-110 disabled:opacity-40"
                        title="Gravar mensagem de voz"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
