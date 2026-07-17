"use client";

import { useState } from "react";
import { Download, Loader2, Mail } from "lucide-react";

/* Botões de backup externo na tela de Governança.
   - "Baixar backup agora": baixa o JSON completo (cópia externa manual).
   - "Enviar por e-mail": dispara o envio (se o SMTP estiver configurado). */
export default function BackupBotao() {
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const baixar = async () => {
    setBaixando(true);
    setMsg("");
    try {
      const r = await fetch("/api/backup");
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sigep-18bpm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg("Backup baixado. Guarde o arquivo no e-mail ou no Drive.");
    } catch {
      setMsg("Falha ao gerar o backup.");
    } finally {
      setBaixando(false);
    }
  };

  const enviarEmail = async () => {
    setEnviando(true);
    setMsg("");
    try {
      const r = await fetch("/api/backup/email");
      const d = await r.json().catch(() => ({}));
      if (d?.configurado === false) {
        setMsg("E-mail automático ainda não configurado (falta o SMTP nas variáveis de ambiente).");
      } else if (d?.ok) {
        setMsg(`Backup enviado para ${d.enviadoPara}.`);
      } else {
        setMsg(d?.error || "Falha ao enviar por e-mail.");
      }
    } catch {
      setMsg("Falha ao enviar por e-mail.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={baixar}
          disabled={baixando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-60"
        >
          {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Baixar backup agora
        </button>
        <button
          onClick={enviarEmail}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Enviar backup por e-mail
        </button>
      </div>
      {msg && <p className="text-xs text-[#94A3B8]">{msg}</p>}
    </div>
  );
}
