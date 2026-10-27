"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Lock, LockOpen, Loader2 } from "lucide-react";
import { avisar, confirmar } from "@/components/Avisos";
import { dataHoraBR } from "@/lib/promocaoPrazo";

/* =========================================================================
   PRAZO DE ENVIO (painel do P/1): o P/1 digita a data e a hora; chegou a
   hora, o sistema trava sozinho o envio dos policiais (ver lib/promocaoPrazo).
   "Encerrar agora" trava na hora; "Tirar o prazo" reabre para todos.
   ========================================================================= */

// ISO -> "2026-10-26T23:59" no horário do quartel (o valor do campo da tela)
function paraCampo(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export default function PrazoEnvioCertidoes({ periodoId, ate, foraDoPrazo }: {
  periodoId: string;
  ate: string | null;
  // quantos ficaram de fora (não enviaram ao P/1 até o prazo)
  foraDoPrazo: number;
}) {
  const router = useRouter();
  const [campo, setCampo] = useState(ate ? paraCampo(ate) : "");
  const [salvando, setSalvando] = useState(false);
  // a tela vira "encerrado" sozinha quando a hora chega, sem recarregar
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { setCampo(ate ? paraCampo(ate) : ""); }, [ate]);

  const encerrado = !!ate && agora >= Date.parse(ate);

  async function salvar(valor: string | null, pergunta?: string) {
    if (pergunta && !await confirmar(pergunta)) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/promocoes/prazo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoId, ate: valor }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(j?.erro || "Falha ao salvar o prazo.", "erro"); return; }
      avisar(
        !valor ? "Prazo retirado: o envio está aberto."
          : valor === "agora" ? "Envio encerrado. Os policiais não conseguem mais enviar."
          : `Prazo salvo: até ${dataHoraBR(j.prazo.ate)}.`,
        "sucesso",
      );
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${encerrado ? "border-red-500/40 bg-red-500/[.06]" : ate ? "border-amber-500/40 bg-amber-500/[.06]" : "border-white/10 bg-[#0F1B2D]"}`}>
      <div className="flex flex-wrap items-start gap-3">
        {encerrado
          ? <Lock className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          : <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">
            {encerrado ? "Envio de certidões ENCERRADO"
              : ate ? `Envio aberto até ${dataHoraBR(ate)}`
              : "Prazo de envio das certidões"}
          </p>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            {encerrado
              ? <>Desde {dataHoraBR(ate!)} os policiais não enviam, não trocam e não excluem mais nada.
                  O senhor continua podendo conferir, receber e reabrir.
                  {foraDoPrazo > 0 && <> <b className="text-red-200">{foraDoPrazo}</b> ficou(aram) sem enviar ao P/1 — se o Cmt aceitar algum, use “Liberar” na linha dele.</>}</>
              : ate
                ? "Quando chegar a hora, o sistema trava sozinho o envio dos policiais."
                : "Sem prazo: os policiais podem enviar a qualquer hora. Coloque a data e a hora limite e o sistema trava sozinho."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-[#94A3B8]" htmlFor="prazo-envio">Até</label>
        <input
          id="prazo-envio"
          type="datetime-local"
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1626] px-3 py-1.5 text-sm text-white [color-scheme:dark] outline-none focus:border-[#D4AF37]/50"
        />
        <button
          onClick={() => salvar(campo)}
          disabled={salvando || !campo || (!!ate && campo === paraCampo(ate))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-medium text-[#1a1205] transition hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {ate ? "Alterar prazo" : "Salvar prazo"}
        </button>
        {!encerrado && (
          <button
            onClick={() => salvar("agora", "Encerrar o envio das certidões AGORA?\n\nOs policiais não vão mais conseguir enviar, trocar nem excluir certidões. O senhor pode reabrir depois.")}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" /> Encerrar agora
          </button>
        )}
        {ate && (
          <button
            onClick={() => salvar(null, "Tirar o prazo?\n\nO envio volta a ficar aberto para todos, sem data limite.")}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <LockOpen className="h-4 w-4" /> {encerrado ? "Reabrir para todos" : "Tirar o prazo"}
          </button>
        )}
      </div>
    </div>
  );
}
