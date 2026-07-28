"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Loader2, AlertTriangle } from "lucide-react";

/* =========================================================================
   Ligação e chamada de vídeo do chat (WebRTC).

   O áudio e o vídeo vão DIRETO de um aparelho ao outro — não passam pelo
   servidor. O que passa pelo SIGEP é só a negociação (quem chama quem e por
   quais caminhos de rede tentar), guardada no banco e lida a cada 1,5 s.

   Limitação honesta: sem um servidor TURN configurado, a chamada funciona
   bem no Wi-Fi do quartel, mas costuma falhar quando os dois lados estão em
   4G — as operadoras bloqueiam a conexão direta. O componente avisa isso na
   tela em vez de deixar a pessoa achando que o sistema quebrou.
   ========================================================================= */

type Ativa = {
  id: string; souQuemLigou: boolean; outro: string;
  video: boolean; estado: string; oferta: string | null; resposta: string | null;
};

export default function Chamada({
  eu,
  nomeDe,
  chamarAgora,
  aoFechar,
}: {
  eu: string;
  nomeDe: (login: string) => string;
  // quando o usuário clica em ligar: { para, video }
  chamarAgora: { para: string; video: boolean } | null;
  aoFechar: () => void;
}) {
  const [ativa, setAtiva] = useState<Ativa | null>(null);
  const [ice, setIce] = useState<any[]>([]);
  const [temTurn, setTemTurn] = useState(true);
  const [estado, setEstado] = useState<"" | "chamando" | "tocando" | "conectando" | "falando" | "fim">("");
  const [semMic, setSemMic] = useState("");
  const [mudo, setMudo] = useState(false);
  const [semCam, setSemCam] = useState(false);
  const [demorando, setDemorando] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const vLocal = useRef<HTMLVideoElement | null>(null);
  const vRemoto = useRef<HTMLVideoElement | null>(null);
  const idRef = useRef<string | null>(null);
  const lidosIce = useRef(0);
  const encerrando = useRef(false);

  /* ---------- descobre chamada ativa e os servidores ---------- */
  const sondar = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/chamada");
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d?.ice)) setIce(d.ice);
      if (typeof d?.temTurn === "boolean") setTemTurn(d.temTurn);
      setAtiva(d?.chamada ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    sondar();
    const t = setInterval(sondar, 2500);
    return () => clearInterval(t);
  }, [sondar]);

  /* ---------- encerra tudo e limpa ---------- */
  const desligar = useCallback(async (avisar = true) => {
    if (encerrando.current) return;
    encerrando.current = true;
    const id = idRef.current;
    try { pc.current?.close(); } catch {}
    pc.current = null;
    try { local.current?.getTracks().forEach((t) => t.stop()); } catch {}
    local.current = null;
    if (vRemoto.current) vRemoto.current.srcObject = null;
    if (vLocal.current) vLocal.current.srcObject = null;
    if (avisar && id) {
      try {
        await fetch("/api/chat/chamada?id=" + encodeURIComponent(id), {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "encerrar" }),
        });
      } catch {}
    }
    idRef.current = null; lidosIce.current = 0;
    setEstado(""); setAtiva(null); setDemorando(false); setMudo(false); setSemCam(false);
    encerrando.current = false;
    aoFechar();
  }, [aoFechar]);

  /* ---------- monta a conexão ---------- */
  function criarPC(idChamada: string) {
    const conexao = new RTCPeerConnection({ iceServers: ice.length ? ice : [{ urls: "stun:stun.l.google.com:19302" }] });

    conexao.onicecandidate = (e) => {
      if (!e.candidate) return;
      fetch("/api/chat/chamada/ice?id=" + encodeURIComponent(idChamada), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato: e.candidate.toJSON() }),
      }).catch(() => {});
    };
    conexao.ontrack = (e) => {
      if (vRemoto.current && e.streams[0]) {
        vRemoto.current.srcObject = e.streams[0];
        vRemoto.current.play().catch(() => {});
      }
    };
    conexao.onconnectionstatechange = () => {
      const s = conexao.connectionState;
      if (s === "connected") { setEstado("falando"); setDemorando(false); }
      if (s === "failed") { setEstado("fim"); setDemorando(true); }
      if (s === "disconnected" || s === "closed") desligar(false);
    };
    pc.current = conexao;
    return conexao;
  }

  async function pegarMidia(comVideo: boolean) {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: comVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } : false,
    });
    local.current = s;
    if (vLocal.current) { vLocal.current.srcObject = s; vLocal.current.play().catch(() => {}); }
    return s;
  }

  /* ---------- eu ligo para alguém ---------- */
  useEffect(() => {
    if (!chamarAgora) return;
    let cancelado = false;
    (async () => {
      setSemMic(""); setEstado("chamando");
      let fluxo: MediaStream;
      try {
        fluxo = await pegarMidia(chamarAgora.video);
      } catch {
        setSemMic(
          chamarAgora.video
            ? "Não consegui acessar a câmera e o microfone. Autorize o acesso no navegador e tente de novo."
            : "Não consegui acessar o microfone. Autorize o acesso no navegador e tente de novo."
        );
        setEstado(""); aoFechar(); return;
      }
      if (cancelado) return;

      // cria a chamada primeiro para já ter o id dos candidatos
      const conexao = criarPC("pendente");
      fluxo.getTracks().forEach((t) => conexao.addTrack(t, fluxo));
      const oferta = await conexao.createOffer();
      await conexao.setLocalDescription(oferta);

      const r = await fetch("/api/chat/chamada", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: chamarAgora.para, video: chamarAgora.video, oferta: JSON.stringify(oferta) }),
      });
      const d = await r.json();
      if (!r.ok || !d?.id) { setSemMic(d?.error || "Não foi possível iniciar a chamada."); desligar(false); return; }
      idRef.current = d.id;

      // agora que temos o id, os candidatos passam a ir para o lugar certo
      conexao.onicecandidate = (e) => {
        if (!e.candidate) return;
        fetch("/api/chat/chamada/ice?id=" + encodeURIComponent(d.id), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidato: e.candidate.toJSON() }),
        }).catch(() => {});
      };
      setEstado("chamando");
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamarAgora]);

  /* ---------- alguém me liga: aceitar ---------- */
  async function atender() {
    if (!ativa || ativa.souQuemLigou || !ativa.oferta) return;
    setSemMic(""); setEstado("conectando");
    idRef.current = ativa.id;
    let fluxo: MediaStream;
    try {
      fluxo = await pegarMidia(ativa.video);
    } catch {
      setSemMic("Não consegui acessar o microfone/câmera. Autorize no navegador.");
      recusar(); return;
    }
    const conexao = criarPC(ativa.id);
    fluxo.getTracks().forEach((t) => conexao.addTrack(t, fluxo));
    await conexao.setRemoteDescription(JSON.parse(ativa.oferta));
    const resposta = await conexao.createAnswer();
    await conexao.setLocalDescription(resposta);
    await fetch("/api/chat/chamada?id=" + encodeURIComponent(ativa.id), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "aceitar", resposta: JSON.stringify(resposta) }),
    });
  }

  async function recusar() {
    if (!ativa) return;
    try {
      await fetch("/api/chat/chamada?id=" + encodeURIComponent(ativa.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "recusar" }),
      });
    } catch {}
    desligar(false);
  }

  /* ---------- quem ligou recebe a resposta ---------- */
  useEffect(() => {
    if (!ativa || !ativa.souQuemLigou || ativa.estado !== "aceita" || !ativa.resposta) return;
    const c = pc.current;
    if (!c || c.currentRemoteDescription) return;
    (async () => {
      try {
        await c.setRemoteDescription(JSON.parse(ativa.resposta!));
        setEstado("conectando");
      } catch {}
    })();
  }, [ativa]);

  /* ---------- troca de candidatos de rede ---------- */
  useEffect(() => {
    const id = idRef.current;
    if (!id || !pc.current) return;
    const t = setInterval(async () => {
      const c = pc.current; if (!c) return;
      try {
        const r = await fetch(`/api/chat/chamada/ice?id=${encodeURIComponent(id)}&desde=${lidosIce.current}`);
        const d = await r.json();
        if (d?.estado === "recusada" || d?.estado === "encerrada" || d?.estado === "perdida") { desligar(false); return; }
        const lista: any[] = Array.isArray(d?.candidatos) ? d.candidatos : [];
        for (const cand of lista) {
          try { await c.addIceCandidate(cand); } catch {}
        }
        if (lista.length) lidosIce.current += lista.length;
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [estado, desligar]);

  /* ---------- avisa quando está demorando (provável falta de TURN) ---------- */
  useEffect(() => {
    if (estado !== "chamando" && estado !== "conectando") return;
    const t = setTimeout(() => setDemorando(true), 12000);
    return () => clearTimeout(t);
  }, [estado]);

  /* ---------- controles ---------- */
  function alternarMudo() {
    const s = local.current; if (!s) return;
    const novo = !mudo;
    s.getAudioTracks().forEach((t) => (t.enabled = !novo));
    setMudo(novo);
  }
  function alternarCamera() {
    const s = local.current; if (!s) return;
    const novo = !semCam;
    s.getVideoTracks().forEach((t) => (t.enabled = !novo));
    setSemCam(novo);
  }

  /* ================= tela ================= */
  const recebendo = ativa && !ativa.souQuemLigou && ativa.estado === "chamando" && estado === "";
  const emChamada = estado === "chamando" || estado === "conectando" || estado === "falando" || estado === "fim";

  if (semMic) {
    return (
      <div className="fixed inset-x-0 top-4 z-[90] mx-auto max-w-md rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur">
        <p className="mb-2">{semMic}</p>
        <button onClick={() => setSemMic("")} className="rounded border border-red-400/40 px-3 py-1 text-xs font-semibold hover:bg-red-900/60">Fechar</button>
      </div>
    );
  }

  /* --- tocando: alguém está me ligando --- */
  if (recebendo) {
    return (
      <div className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0F1B2D] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 grid h-16 w-16 animate-pulse place-items-center rounded-full bg-[#D4AF37]/20">
            {ativa!.video ? <Video className="h-7 w-7 text-[#D4AF37]" /> : <Phone className="h-7 w-7 text-[#D4AF37]" />}
          </div>
          <p className="text-sm text-[#94A3B8]">{ativa!.video ? "Chamada de vídeo" : "Ligação"} recebida</p>
          <p className="mb-6 text-lg font-bold text-white">{nomeDe(ativa!.outro)}</p>
          <div className="flex justify-center gap-3">
            <button onClick={recusar}
              className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white hover:brightness-110">
              <PhoneOff className="h-4 w-4" /> Recusar
            </button>
            <button onClick={atender}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:brightness-110">
              <Phone className="h-4 w-4" /> Atender
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!emChamada) return null;

  /* --- em chamada --- */
  const comVideo = ativa?.video ?? !!chamarAgora?.video;
  const quem = ativa ? nomeDe(ativa.outro) : chamarAgora ? nomeDe(chamarAgora.para) : "";
  const rotulo =
    estado === "chamando" ? "chamando…" :
    estado === "conectando" ? "conectando…" :
    estado === "falando" ? "em chamada" : "chamada encerrada";

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-bold text-white">{quem}</p>
          <p className="text-xs text-[#94A3B8]">
            {estado !== "falando" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            {rotulo}
          </p>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={vRemoto} playsInline autoPlay
          className={`h-full w-full ${comVideo ? "object-cover" : "hidden"}`} />
        {!comVideo && (
          <div className="grid h-full place-items-center">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-[#16243a] text-3xl font-bold text-[#D4AF37]">
              {quem.slice(0, 2).toUpperCase()}
            </div>
          </div>
        )}
        <video ref={vLocal} playsInline autoPlay muted
          className={`absolute bottom-4 right-4 w-28 rounded-lg border border-white/20 shadow-xl ${comVideo && !semCam ? "" : "hidden"}`} />

        {demorando && (
          <div className="absolute inset-x-4 top-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/85 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              A chamada está demorando a conectar.
              {!temTurn && " O sistema não tem servidor TURN configurado — em rede móvel (4G) a conexão direta costuma falhar. No Wi-Fi do quartel funciona normalmente."}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 py-5">
        <button onClick={alternarMudo} title={mudo ? "Ligar microfone" : "Desligar microfone"}
          className={`grid h-12 w-12 place-items-center rounded-full ${mudo ? "bg-white/20 text-white" : "bg-white/10 text-white/90"} hover:bg-white/25`}>
          {mudo ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        {comVideo && (
          <button onClick={alternarCamera} title={semCam ? "Ligar câmera" : "Desligar câmera"}
            className={`grid h-12 w-12 place-items-center rounded-full ${semCam ? "bg-white/20 text-white" : "bg-white/10 text-white/90"} hover:bg-white/25`}>
            {semCam ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </button>
        )}
        <button onClick={() => desligar(true)} title="Desligar"
          className="grid h-14 w-14 place-items-center rounded-full bg-red-600 text-white hover:brightness-110">
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
