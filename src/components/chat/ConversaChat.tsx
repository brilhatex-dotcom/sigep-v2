"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Send, X, Download, FileText, Loader2, Mic, Reply, Copy, Pencil, Trash2, Ban,
  Check, ChevronDown, Smile, Forward, Paperclip, Image as ImageIcon, Camera, MapPin, Share2,
} from "lucide-react";

/* =========================================================================
   A CONVERSA — usada nos DOIS lugares onde se conversa no SIGEP: a tela
   cheia (/chat) e a janelinha flutuante que acompanha o usuário.

   Antes cada uma tinha o seu próprio código, e foi assim que as ferramentas
   novas (voz, responder, reagir, silenciar, localização…) acabaram só na
   tela cheia. Agora é um componente só: o que entra aqui aparece nos dois.

   O que fica de fora, de propósito: a LISTA de contatos e o cabeçalho — cada
   tela desenha do seu jeito (a janelinha é estreita, a tela cheia tem duas
   colunas). Daqui para baixo é tudo igual.
   ========================================================================= */

export type ContatoChat = {
  login: string;
  nome: string;
  postoGrad?: string | null;
  lotacao?: string | null;
  online?: boolean;
  foto?: string | null;
  arquivada?: boolean;
};

export type Msg = {
  id: string; minha: boolean; texto: string | null;
  arqKey: string | null; arqNome: string | null; arqTipo: string | null; arqTam: number | null;
  em: string; lida: boolean; lidaEm?: string | null;
  editada?: boolean; apagada?: boolean; encaminhada?: boolean;
  citada?: { id: string; minha: boolean; trecho: string } | null;
  reacoes?: { emoji: string; qtd: number; minha: boolean }[];
};

type ItemSigep = { id: string; icone: string; titulo: string; sub: string; href: string };
type GrupoSigep = { titulo: string; itens: ItemSigep[] };

// as mesmas do WhatsApp, na mesma ordem
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LIMITE = 20 * 1024 * 1024;

const ehImagem = (t: string | null) => !!t && t.startsWith("image/");
const ehAudio = (t: string | null) => !!t && t.startsWith("audio/");

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
// 0:07 — duração da gravação, no formato que todo mundo conhece
function relogio(seg: number): string {
  const m = Math.floor(seg / 60);
  return `${m}:${String(seg % 60).padStart(2, "0")}`;
}

/* Texto do balão com os links clicáveis.

   Dois tipos aparecem no chat: endereço da internet (a localização vai como
   link do Google Maps) e caminho do próprio SIGEP, como "/requerimentos/abc"
   — esse abre por dentro do sistema, sem recarregar a página.

   Quebra por espaço em vez de usar um regex esperto de propósito: iPhone mais
   antigo não entende algumas construções novas de regex e derrubaria a tela
   inteira. */
const CAMINHO_SIGEP = /^\/[A-Za-z0-9][A-Za-z0-9\-_/[\]?=&.%]*$/;

function TextoComLinks({ texto, minha, aoAbrir }: { texto: string; minha: boolean; aoAbrir: (h: string) => void }) {
  const cor = minha ? "text-[#1a1205] underline decoration-[#1a1205]/40" : "text-[#7cc4ff] underline";
  return (
    <p className="whitespace-pre-wrap break-words">
      {texto.split(/(\s+)/).map((p, i) => {
        if (!p) return null;
        if (p.startsWith("http://") || p.startsWith("https://")) {
          return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cor}>{p}</a>;
        }
        if (CAMINHO_SIGEP.test(p)) {
          return <button key={i} onClick={() => aoAbrir(p)} className={cor}>{p}</button>;
        }
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

type Props = {
  /** com quem estou conversando */
  contato: ContatoChat;
  /** todos os contatos — só para escolher o destino ao encaminhar */
  contatos: ContatoChat[];
  /** true na janelinha flutuante: fontes e espaçamentos menores */
  compacto?: boolean;
  /** avisa a tela de fora para recarregar a lista (prévia, não lidas…) */
  aoMudarContatos?: () => void;
  /** altura máxima da área de mensagens na tela cheia (a janelinha usa flex) */
  alturaMaxLista?: string;
};

export default function ConversaChat({
  contato, contatos, compacto = false, aoMudarContatos, alturaMaxLista,
}: Props) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subindo, setSubindo] = useState<{ nome: string; pct: number } | null>(null);
  const [erro, setErro] = useState("");
  const [previas, setPrevias] = useState<Record<string, string>>({});
  // ---- ferramentas de mensagem ----
  const [respondendo, setRespondendo] = useState<Msg | null>(null);
  const [editando, setEditando] = useState<{ id: string; textoOriginal: string } | null>(null);
  const [menuDe, setMenuDe] = useState<string | null>(null);
  const [reagindoEm, setReagindoEm] = useState<string | null>(null);
  const [encaminhando, setEncaminhando] = useState<Msg | null>(null);
  // ---- busca dentro da conversa ----
  const [buscaConversa, setBuscaConversa] = useState("");
  const [emBusca, setEmBusca] = useState(false);
  const [buscaVisivel, setBuscaVisivel] = useState(false);
  // ---- envio de informações ----
  const [menuAnexo, setMenuAnexo] = useState(false);
  const [fila, setFila] = useState<{ i: number; total: number } | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);
  const [gruposSigep, setGruposSigep] = useState<GrupoSigep[] | null>(null);
  // ---- gravação de voz ----
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const cancelouRef = useRef(false);

  const fim = useRef<HTMLDivElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);
  const ultimaRef = useRef<string | null>(null);
  const buscaRef = useRef(false); buscaRef.current = emBusca;
  const comRef = useRef(contato.login); comRef.current = contato.login;
  const avisar = useRef(aoMudarContatos); avisar.current = aoMudarContatos;

  /* ---------------- carregar a conversa ---------------- */
  useEffect(() => {
    let vivo = true;
    setMsgs([]); ultimaRef.current = null; setErro("");
    setRespondendo(null); setEditando(null); setTexto("");
    setEmBusca(false); setBuscaConversa("");
    (async () => {
      try {
        const r = await fetch("/api/chat/mensagens?com=" + encodeURIComponent(contato.login));
        const d = await r.json();
        if (!vivo) return;
        const lista: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
        setMsgs(lista);
        if (lista.length) ultimaRef.current = lista[lista.length - 1].em;
        avisar.current?.();
      } catch { /* sem conexão: a tela fica vazia e a próxima busca resolve */ }
    })();
    return () => { vivo = false; };
  }, [contato.login]);

  /* novas mensagens, a cada 3 s (a Vercel não tem WebSocket) */
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      if (buscaRef.current) return; // mostrando resultado de busca: não empilha
      try {
        const q = "/api/chat/mensagens?com=" + encodeURIComponent(comRef.current) +
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
      } catch { /* silencioso */ }
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // clique em qualquer lugar fecha os menus abertos
  useEffect(() => {
    if (!menuDe && !menuAnexo) return;
    const fechar = () => { setMenuDe(null); setMenuAnexo(false); };
    // no tique seguinte, para o próprio clique que abriu não fechar junto
    const t = setTimeout(() => document.addEventListener("click", fechar), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", fechar); };
  }, [menuDe, menuAnexo]);

  // conta os segundos enquanto grava (para mostrar 0:07 igual ao WhatsApp)
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // URL temporária de imagens E áudios, para ver/tocar dentro do balão
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
        } catch { /* silencioso */ }
      }
    })();
    return () => { vivo = false; };
  }, [msgs, previas]);

  // rola para o fim quando chega mensagem (só se já estava perto do fim)
  useEffect(() => {
    const l = listaRef.current;
    if (!l) return;
    const perto = l.scrollHeight - l.scrollTop - l.clientHeight < 220;
    if (perto || msgs.length <= 1) fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  /* ---------------- enviar ---------------- */
  async function enviarTexto() {
    const t = texto.trim();
    if (!t || enviando) return;
    // com o campo em modo de edição, o mesmo botão salva em vez de mandar nova
    if (editando) return salvarEdicao(t);

    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para: contato.login, texto: t,
          ...(respondendo ? { respondeA: respondendo.id } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível enviar."); return; }
      setTexto("");
      setRespondendo(null);
      setMsgs((m) => [...m, d.mensagem]);
      ultimaRef.current = d.mensagem.em;
      aoMudarContatos?.();
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  /* Manda um texto pronto (localização, item do SIGEP) sem passar pelo campo
     de digitação — e já coloca o balão na tela. */
  async function mandarTexto(t: string) {
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: contato.login, texto: t }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível enviar."); return; }
      setMsgs((m) => [...m, d.mensagem]);
      ultimaRef.current = d.mensagem.em;
      aoMudarContatos?.();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  /* ---------------- ferramentas de mensagem ---------------- */

  // Responder citando: a citação fica em cima do campo até enviar ou cancelar.
  function responder(m: Msg) {
    setMenuDe(null); setEditando(null); setRespondendo(m);
    campoRef.current?.focus();
  }

  function comecarEdicao(m: Msg) {
    setMenuDe(null); setRespondendo(null);
    setEditando({ id: m.id, textoOriginal: m.texto || "" });
    setTexto(m.texto || "");
    campoRef.current?.focus();
  }

  function cancelarEdicao() { setEditando(null); setTexto(""); }

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
      aoMudarContatos?.();
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
      aoMudarContatos?.();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  async function copiar(m: Msg) {
    setMenuDe(null);
    const t = m.texto || m.arqNome || "";
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch { setErro("O navegador não deixou copiar. Selecione o texto à mão."); }
  }

  // Reagir: o mesmo emoji de novo tira a reação (igual ao WhatsApp).
  async function reagir(m: Msg, emoji: string) {
    setReagindoEm(null); setMenuDe(null);
    try {
      const r = await fetch("/api/chat/reacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, emoji }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível reagir."); return; }
      setMsgs((ms) => ms.map((x) => (x.id === m.id ? { ...x, reacoes: d.reacoes } : x)));
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  // Encaminhar: escolhe para quem numa lista por cima da conversa.
  async function encaminharPara(destino: ContatoChat) {
    const m = encaminhando;
    if (!m) return;
    setEncaminhando(null);
    try {
      const r = await fetch("/api/chat/mensagens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: destino.login, encaminharDe: m.id }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível encaminhar."); return; }
      // encaminhou para a conversa que já está aberta: aparece na hora
      if (destino.login === contato.login) {
        setMsgs((ms) => [...ms, d.mensagem]);
        ultimaRef.current = d.mensagem.em;
      }
      aoMudarContatos?.();
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  /* Busca DENTRO da conversa: pergunta ao servidor (acha mensagem antiga, que
     não está carregada na tela) e mostra só os resultados até limpar. */
  async function buscarNaConversa(termo: string) {
    const t = termo.trim();
    if (!t) return limparBusca();
    try {
      const r = await fetch(
        "/api/chat/mensagens?com=" + encodeURIComponent(contato.login) + "&busca=" + encodeURIComponent(t)
      );
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "Não foi possível buscar."); return; }
      setEmBusca(true);
      setMsgs(Array.isArray(d?.mensagens) ? d.mensagens : []);
    } catch { setErro("Sem conexão. Tente de novo."); }
  }

  async function limparBusca() {
    setBuscaConversa("");
    if (!emBusca) return;
    setEmBusca(false);
    // recarrega a conversa inteira
    try {
      const r = await fetch("/api/chat/mensagens?com=" + encodeURIComponent(contato.login));
      const d = await r.json();
      const lista: Msg[] = Array.isArray(d?.mensagens) ? d.mensagens : [];
      setMsgs(lista);
      ultimaRef.current = lista.length ? lista[lista.length - 1].em : null;
    } catch { /* silencioso */ }
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
    try { gravadorRef.current?.stop(); } catch { /* já parado */ }
    gravadorRef.current = null;
  }

  /* ---------------- anexos ---------------- */
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const fotosRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  // devolve true quando deu certo (a fila de vários arquivos usa isso)
  async function enviarArquivo(f: File): Promise<boolean> {
    setErro("");
    if (f.size > LIMITE) {
      setErro(`"${f.name}" tem ${(f.size / 1048576).toFixed(1)} MB. O limite é 20 MB.`);
      return false;
    }
    setSubindo({ nome: f.name, pct: 0 });
    try {
      // 1) pede a URL assinada
      const r1 = await fetch("/api/chat/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size }),
      });
      const d1 = await r1.json();
      if (!r1.ok) { setErro(d1?.error || "Falha ao preparar o envio."); setSubindo(null); return false; }

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
          para: contato.login,
          arq: { key: d1.key, nome: f.name, tipo: f.type || "application/octet-stream", tam: f.size },
        }),
      });
      const d2 = await r2.json();
      if (!r2.ok) { setErro(d2?.error || "Arquivo enviado, mas a mensagem falhou."); return false; }
      setMsgs((m) => [...m, d2.mensagem]);
      ultimaRef.current = d2.mensagem.em;
      aoMudarContatos?.();
      return true;
    } catch (e: any) {
      const m = String(e?.message || "");
      if (m === "__CORS__") {
        // status 0 = o navegador barrou antes de sair. Quase sempre é o CORS
        // do bucket R2 ainda não liberado para este endereço.
        setErro(
          "O navegador bloqueou o envio ao armazenamento. Isso acontece quando o CORS do bucket R2 " +
          "ainda não autoriza este endereço (" + window.location.origin + "). " +
          "Confira em Cloudflare → R2 → sigep-documentos → Settings → CORS Policy se a origem está " +
          "exatamente assim, sem barra no final. Se acabou de configurar, aguarde 1 a 2 minutos e recarregue com Ctrl+F5."
        );
      } else {
        setErro(m || "Falha ao enviar o arquivo. Verifique a conexão e tente de novo.");
      }
      return false;
    } finally {
      setSubindo(null);
      // libera os campos para dar pra escolher o MESMO arquivo de novo
      if (arquivoRef.current) arquivoRef.current.value = "";
      if (fotosRef.current) fotosRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  /* Vários arquivos de uma vez: manda um atrás do outro (o R2 assina uma URL
     por arquivo) e mostra "2 de 5" na barra. Se um falhar, para ali. */
  async function enviarArquivos(lista: FileList | File[] | null) {
    const fs = Array.from(lista || []);
    if (!fs.length) return;
    if (fs.length === 1) { await enviarArquivo(fs[0]); return; }
    for (let i = 0; i < fs.length; i++) {
      setFila({ i: i + 1, total: fs.length });
      const ok = await enviarArquivo(fs[i]);
      if (!ok) break;
    }
    setFila(null);
  }

  /* Localização atual: vai como link do Google Maps, que abre no aplicativo
     de mapas de quem recebe. Nada fica guardado além da mensagem. */
  function enviarLocalizacao() {
    setMenuAnexo(false);
    if (!navigator.geolocation) { setErro("Este aparelho não informa a localização."); return; }
    setBuscandoLocal(true); setErro("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setBuscandoLocal(false);
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        await mandarTexto(`📍 Minha localização agora:\nhttps://www.google.com/maps?q=${lat},${lon}`);
      },
      (e) => {
        setBuscandoLocal(false);
        setErro(
          e.code === e.PERMISSION_DENIED
            ? "Você precisa autorizar a localização para este site no navegador."
            : "Não foi possível pegar a localização agora. Tente de novo em local aberto."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  async function abrirCompartilhar() {
    setMenuAnexo(false);
    setCompartilhar(true);
    if (gruposSigep) return;
    try {
      const r = await fetch("/api/chat/compartilhar");
      const d = await r.json();
      setGruposSigep(Array.isArray(d?.grupos) ? d.grupos : []);
    } catch { setGruposSigep([]); }
  }

  async function compartilharItem(it: ItemSigep) {
    setCompartilhar(false);
    await mandarTexto(`${it.icone} ${it.titulo}\n${it.sub}\n${it.href}`);
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

  /* ---------------- tamanhos: a janelinha é mais apertada ---------------- */
  const t = compacto
    ? { balao: "text-[13px] px-2.5 py-1.5", lista: "space-y-1.5 p-2.5", rodape: "p-2 gap-1.5", botao: "p-1.5", icone: "h-4 w-4" }
    : { balao: "text-sm px-3 py-2", lista: "space-y-2 p-3", rodape: "p-2.5 gap-2", botao: "p-2", icone: "h-4 w-4" };

  return (
    <>
      {/* ---------------- encaminhar: escolher para quem ---------------- */}
      {encaminhando && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-black/60 p-4"
          onClick={() => setEncaminhando(null)}>
          <div className="mt-16 w-full max-w-md overflow-hidden rounded-xl border border-[#2b3f63] bg-[#0F1B2D]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <Forward className="h-4 w-4 text-[#D4AF37]" /> Encaminhar para
                </p>
                <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                  {encaminhando.texto
                    || (ehAudio(encaminhando.arqTipo) ? "🎤 Mensagem de voz"
                        : ehImagem(encaminhando.arqTipo) ? "🖼 Foto"
                        : "📎 " + (encaminhando.arqNome || "arquivo"))}
                </p>
              </div>
              <button onClick={() => setEncaminhando(null)} className="shrink-0 text-[#94A3B8] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {contatos.filter((c) => !c.arquivada).map((c) => (
                <button key={c.login} onClick={() => encaminharPara(c)}
                  className="flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2.5 text-left transition hover:bg-white/5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#16243a] text-[10px] font-bold text-[#D4AF37]">
                    {c.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{c.nome}</span>
                    <span className="block truncate text-[11px] text-[#94A3B8]">
                      {[c.postoGrad, c.lotacao].filter(Boolean).join(" · ") || c.login}
                    </span>
                  </span>
                  <Send className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- mandar item do SIGEP ---------------- */}
      {compartilhar && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-black/60 p-4"
          onClick={() => setCompartilhar(false)}>
          <div className="mt-16 w-full max-w-md overflow-hidden rounded-xl border border-[#2b3f63] bg-[#0F1B2D]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <Share2 className="h-4 w-4 text-[#D4AF37]" /> Mandar item do SIGEP
                </p>
                <p className="mt-0.5 text-xs text-[#94A3B8]">
                  Vai como mensagem com o atalho — quem recebe abre direto na tela certa.
                </p>
              </div>
              <button onClick={() => setCompartilhar(false)} className="shrink-0 text-[#94A3B8] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              {gruposSigep === null ? (
                <p className="flex items-center justify-center gap-2 p-6 text-sm text-[#94A3B8]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </p>
              ) : gruposSigep.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#94A3B8]">Nada para compartilhar no momento.</p>
              ) : gruposSigep.map((g) => (
                <div key={g.titulo}>
                  <p className="bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#D4AF37]">
                    {g.titulo}
                  </p>
                  {g.itens.map((it) => (
                    <button key={it.id} onClick={() => compartilharItem(it)}
                      className="flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2.5 text-left transition hover:bg-white/5">
                      <span className="shrink-0 text-base leading-none">{it.icone}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{it.titulo}</span>
                        <span className="block truncate text-[11px] text-[#94A3B8]">{it.sub}</span>
                      </span>
                      <Send className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- busca dentro da conversa ---------------- */}
      {buscaVisivel && (
        <div className="flex items-center gap-2 border-b border-white/5 bg-black/20 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
          <input
            autoFocus
            value={buscaConversa}
            onChange={(e) => setBuscaConversa(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); buscarNaConversa(buscaConversa); }
              if (e.key === "Escape") { limparBusca(); setBuscaVisivel(false); }
            }}
            placeholder="Buscar nesta conversa…"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs text-white placeholder-white/35 outline-none"
          />
          <button onClick={() => { limparBusca(); setBuscaVisivel(false); }}
            title="Fechar a busca" className="shrink-0 text-[#94A3B8] hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {emBusca && (
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#D4AF37]/10 px-3 py-2 text-xs text-[#D4AF37]">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {msgs.length === 0
              ? `Nenhuma mensagem com “${buscaConversa}”.`
              : `${msgs.length} resultado(s) para “${buscaConversa}”.`}
          </span>
          <button onClick={limparBusca} className="shrink-0 font-semibold underline hover:text-white">
            voltar à conversa
          </button>
        </div>
      )}

      {erro && (
        <div className="flex items-start justify-between gap-2 border-b border-red-500/30 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
          <span className="min-w-0">{erro}</span>
          <button onClick={() => setErro("")} className="shrink-0"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* ---------------- mensagens ---------------- */}
      <div ref={listaRef} className={`flex-1 overflow-y-auto ${t.lista}`}
        style={alturaMaxLista ? { maxHeight: alturaMaxLista } : undefined}>
        {msgs.length === 0 && !emBusca && (
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
                {/* menu da mensagem: reagir, responder, encaminhar, copiar… */}
                {!m.apagada && (
                  <div className={`relative ${m.minha ? "order-1" : "order-2"}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuDe(menuDe === m.id ? null : m.id); }}
                      title="Opções da mensagem"
                      className="mt-2 rounded p-1 text-[#94A3B8] opacity-60 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {menuDe === m.id && (
                      <div className={`absolute z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#2b3f63] bg-[#0F1B2D] shadow-xl ${
                        m.minha ? "left-0" : "right-0"}`}>
                        <button onClick={() => { setMenuDe(null); setReagindoEm(m.id); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                          <Smile className="h-3.5 w-3.5" /> Reagir
                        </button>
                        <button onClick={() => responder(m)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                          <Reply className="h-3.5 w-3.5" /> Responder
                        </button>
                        <button onClick={() => { setMenuDe(null); setEncaminhando(m); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#E8EEF6] hover:bg-white/5">
                          <Forward className="h-3.5 w-3.5" /> Encaminhar
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

                <div className={`max-w-[78%] rounded-2xl ${t.balao} ${m.minha ? "order-2" : "order-1"} ${
                  m.apagada
                    ? "rounded-bl-sm border border-dashed border-white/15 bg-transparent text-[#94A3B8]"
                    : m.minha ? "rounded-br-sm bg-[#D4AF37] text-[#1a1205]" : "rounded-bl-sm bg-[#16243a] text-[#E8EEF6]"}`}>

                  {m.apagada ? (
                    <p className="flex items-center gap-1.5 italic">
                      <Ban className="h-3.5 w-3.5 shrink-0" /> Mensagem apagada
                    </p>
                  ) : (<>

                  {m.encaminhada && (
                    <p className={`mb-0.5 flex items-center gap-1 text-[10px] italic ${
                      m.minha ? "text-[#1a1205]/60" : "text-[#94A3B8]"}`}>
                      <Forward className="h-3 w-3" /> Encaminhada
                    </p>
                  )}

                  {/* trecho da mensagem citada (responder) */}
                  {m.citada && (
                    <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${
                      m.minha ? "border-[#1a1205]/40 bg-black/10 text-[#1a1205]/80" : "border-[#D4AF37] bg-black/25 text-[#94A3B8]"}`}>
                      <b className={m.minha ? "text-[#1a1205]" : "text-[#D4AF37]"}>
                        {m.citada.minha ? "Você" : contato.nome}
                      </b>
                      <span className="ml-1 line-clamp-2 break-words">{m.citada.trecho}</span>
                    </div>
                  )}

                  {m.texto && (
                    <TextoComLinks texto={m.texto} minha={m.minha} aoAbrir={(h) => router.push(h)} />
                  )}

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

                  {/* reações já dadas */}
                  {!m.apagada && !!m.reacoes?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.reacoes.map((r) => (
                        <button
                          key={r.emoji} onClick={() => reagir(m, r.emoji)}
                          title={r.minha ? "Tirar a sua reação" : "Reagir também"}
                          className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${
                            r.minha
                              ? "border-[#D4AF37] bg-[#D4AF37]/20"
                              : m.minha ? "border-black/20 bg-black/10" : "border-white/10 bg-white/5"}`}
                        >
                          {r.emoji}{r.qtd > 1 ? ` ${r.qtd}` : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* fileira de emoji, ao escolher "Reagir" */}
                  {reagindoEm === m.id && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-[#2b3f63] bg-[#0F1B2D] p-1">
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => reagir(m, e)}
                          className="rounded px-1.5 py-0.5 text-base leading-none transition hover:bg-white/10">
                          {e}
                        </button>
                      ))}
                      <button onClick={() => setReagindoEm(null)}
                        className="ml-auto rounded p-1 text-[#94A3B8] hover:text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

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
            {fila && <span className="shrink-0">Arquivo {fila.i} de {fila.total} —</span>}
            Enviando <b className="truncate text-white">{subindo.nome}</b> — {subindo.pct}%
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
              Respondendo {respondendo.minha ? "você mesmo" : contato.nome}
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

      {/* ---------------- rodapé ---------------- */}
      <footer className={`relative flex items-end border-t border-white/5 ${t.rodape}`}>
        {/* três campos escondidos: arquivo qualquer, galeria e câmera */}
        <input ref={arquivoRef} type="file" multiple className="hidden"
          onChange={(e) => enviarArquivos(e.target.files)} />
        <input ref={fotosRef} type="file" multiple accept="image/*,video/*" className="hidden"
          onChange={(e) => enviarArquivos(e.target.files)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => enviarArquivos(e.target.files)} />

        {/* menu do clipe: tudo que dá para mandar além de texto */}
        {menuAnexo && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-16 left-2.5 z-30 w-60 overflow-hidden rounded-xl border border-[#2b3f63] bg-[#0F1B2D] shadow-2xl"
          >
            {[
              { icone: <ImageIcon className="h-4 w-4 text-[#D4AF37]" />, rot: "Fotos e vídeos", sub: "Pode escolher vários", ao: () => { setMenuAnexo(false); fotosRef.current?.click(); } },
              { icone: <Camera className="h-4 w-4 text-[#D4AF37]" />, rot: "Câmera", sub: "Tirar uma foto agora", ao: () => { setMenuAnexo(false); cameraRef.current?.click(); } },
              { icone: <FileText className="h-4 w-4 text-[#D4AF37]" />, rot: "Documento", sub: "Qualquer arquivo, até 20 MB", ao: () => { setMenuAnexo(false); arquivoRef.current?.click(); } },
              { icone: <MapPin className="h-4 w-4 text-[#D4AF37]" />, rot: "Localização", sub: "Onde estou agora", ao: enviarLocalizacao },
              { icone: <Share2 className="h-4 w-4 text-[#D4AF37]" />, rot: "Item do SIGEP", sub: "Escala, JOE, requerimento…", ao: abrirCompartilhar },
            ].map((o) => (
              <button key={o.rot} onClick={o.ao}
                className="flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2.5 text-left transition last:border-0 hover:bg-white/5">
                <span className="shrink-0">{o.icone}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{o.rot}</span>
                  <span className="block truncate text-[10px] text-[#94A3B8]">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {gravando ? (
          /* gravando: o campo some e dá lugar ao contador, como no WhatsApp */
          <>
            <button onClick={() => pararGravacao(false)} title="Cancelar gravação"
              className={`shrink-0 rounded-lg border border-red-500/40 text-red-300 transition hover:bg-red-500/10 ${t.botao}`}>
              <Trash2 className={t.icone} />
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-red-200">Gravando… {relogio(segundos)}</span>
            </div>
            <button onClick={() => pararGravacao(true)} title="Enviar áudio"
              className={`shrink-0 rounded-lg bg-[#D4AF37] text-[#1a1205] transition hover:brightness-110 ${t.botao}`}>
              <Send className={t.icone} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuAnexo((v) => !v); }}
              disabled={!!subindo || buscandoLocal}
              title="Enviar arquivo, foto, localização ou item do SIGEP"
              className={`shrink-0 rounded-lg border border-white/10 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white disabled:opacity-40 ${t.botao}`}
            >
              {buscandoLocal ? <Loader2 className={`${t.icone} animate-spin`} /> : <Paperclip className={t.icone} />}
            </button>

            {!buscaVisivel && (
              <button
                onClick={() => setBuscaVisivel(true)} title="Buscar nesta conversa"
                className={`shrink-0 rounded-lg border border-white/10 text-[#94A3B8] transition hover:border-[#D4AF37] hover:text-white ${t.botao}`}
              >
                <Search className={t.icone} />
              </button>
            )}

            <textarea
              ref={campoRef}
              value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
                if (e.key === "Escape" && editando) cancelarEdicao();
              }}
              placeholder={editando ? "Corrija a mensagem…" : "Escreva sua mensagem…"}
              className={`max-h-28 min-h-[36px] flex-1 resize-y rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-white placeholder-white/35 outline-none focus:border-[#D4AF37] ${
                compacto ? "text-[13px]" : "text-sm"}`}
            />

            {/* sem texto digitado, o botão vira microfone — igual ao WhatsApp */}
            {texto.trim() || editando ? (
              <button
                onClick={enviarTexto} disabled={enviando || !texto.trim()}
                className={`shrink-0 rounded-lg bg-[#D4AF37] text-[#1a1205] transition hover:brightness-110 disabled:opacity-40 ${t.botao}`}
                title={editando ? "Salvar edição (Enter)" : "Enviar (Enter)"}
              >
                {enviando ? <Loader2 className={`${t.icone} animate-spin`} /> : editando ? <Check className={t.icone} /> : <Send className={t.icone} />}
              </button>
            ) : (
              <button
                onClick={iniciarGravacao} disabled={!!subindo}
                className={`shrink-0 rounded-lg bg-[#D4AF37] text-[#1a1205] transition hover:brightness-110 disabled:opacity-40 ${t.botao}`}
                title="Gravar mensagem de voz"
              >
                <Mic className={t.icone} />
              </button>
            )}
          </>
        )}
      </footer>
    </>
  );
}
