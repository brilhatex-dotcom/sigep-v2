"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, BellOff, Send } from "lucide-react";

// Converte a chave VAPID (base64url) para o formato que o navegador exige.
function base64ParaUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Estado = "carregando" | "indisponivel" | "negado" | "inativo" | "ativo";

export default function AtivarNotificacoes() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

  useEffect(() => {
    const checar = async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEstado("indisponivel");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("negado");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub ? "ativo" : "inativo");
      } catch {
        setEstado("inativo");
      }
    };
    checar();
  }, []);

  const ativar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado("negado");
        setMsg("Permissão negada pelo navegador.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ParaUint8(VAPID),
        });
      }

      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });
      if (!resp.ok) throw new Error("falha ao salvar inscricao");

      setEstado("ativo");
      setMsg("Notificações ativadas neste dispositivo.");
    } catch (e) {
      setMsg("Não foi possível ativar. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("inativo");
      setMsg("Notificações desativadas neste dispositivo.");
    } catch {
      setMsg("Não foi possível desativar.");
    } finally {
      setOcupado(false);
    }
  };

  const testar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/push/testar", { method: "POST" });
      const d = await resp.json();
      if (resp.ok && d.enviadas > 0) {
        setMsg(`Teste enviado (${d.enviadas} dispositivo${d.enviadas > 1 ? "s" : ""}).`);
      } else if (resp.ok && d.enviadas === 0) {
        setMsg("Nenhum dispositivo inscrito para receber. Ative primeiro.");
      } else {
        setMsg(d?.erro || "Falha ao enviar teste.");
      }
    } catch {
      setMsg("Erro ao enviar teste.");
    } finally {
      setOcupado(false);
    }
  };

  if (estado === "carregando") {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4 text-sm text-[#94A3B8]">
        Verificando suporte a notificações...
      </div>
    );
  }

  if (estado === "indisponivel") {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4 text-sm text-[#94A3B8]">
        <div className="flex items-center gap-2 text-[#E8EEF6]">
          <BellOff className="h-4 w-4" />
          <span className="font-medium">Notificações indisponíveis</span>
        </div>
        <p className="mt-1">
          Este navegador não suporta notificações push. Em iPhone, adicione o sistema
          à tela de início (compartilhar &rarr; &quot;Adicionar à Tela de Início&quot;) e abra por lá.
        </p>
      </div>
    );
  }

  if (estado === "negado") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        <div className="flex items-center gap-2">
          <BellOff className="h-4 w-4" />
          <span className="font-medium">Permissão bloqueada</span>
        </div>
        <p className="mt-1 text-[#94A3B8]">
          Você bloqueou as notificações. Reative nas configurações do navegador
          (ícone de cadeado na barra de endereço) e recarregue a página.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
      <div className="flex items-center gap-2 text-[#E8EEF6]">
        {estado === "ativo" ? (
          <BellRing className="h-5 w-5 text-[#D4AF37]" />
        ) : (
          <Bell className="h-5 w-5 text-[#94A3B8]" />
        )}
        <span className="font-semibold">Notificações no celular</span>
      </div>
      <p className="mt-1 text-sm text-[#94A3B8]">
        {estado === "ativo"
          ? "Ativadas neste dispositivo. Você receberá avisos do SIGEP mesmo fora do sistema."
          : "Receba avisos do SIGEP (escala, requerimentos, comunicados) direto no aparelho."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {estado === "inativo" && (
          <button
            onClick={ativar}
            disabled={ocupado}
            className="flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#08111F] transition hover:bg-[#D4AF37]/90 disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            {ocupado ? "Ativando..." : "Ativar notificações"}
          </button>
        )}

        {estado === "ativo" && (
          <>
            <button
              onClick={testar}
              disabled={ocupado}
              className="flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#08111F] transition hover:bg-[#D4AF37]/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {ocupado ? "Enviando..." : "Enviar teste"}
            </button>
            <button
              onClick={desativar}
              disabled={ocupado}
              className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-[#94A3B8] transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
            >
              <BellOff className="h-4 w-4" />
              Desativar
            </button>
          </>
        )}
      </div>

      {msg && <p className="mt-3 text-sm text-[#E8EEF6]/80">{msg}</p>}
    </div>
  );
}