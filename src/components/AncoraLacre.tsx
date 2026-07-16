"use client";

import { useEffect, useState } from "react";

/* Âncora externa do lacre: mostra o "selo" atual (hash do último registro +
   contagem), deixa registrar uma âncora e SALVAR fora do sistema, e conferir
   depois se um selo salvo ainda existe na corrente (detecta reescrita da base). */

type Selo = { count: number; ultimoHash: string | null; em: string };
type Ancora = Selo & { por: string };

function dh(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

export default function AncoraLacre() {
  const [selo, setSelo] = useState<Selo | null>(null);
  const [ancoras, setAncoras] = useState<Ancora[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hashConf, setHashConf] = useState("");
  const [confRes, setConfRes] = useState<null | boolean>(null);

  const carregar = () => { fetch("/api/auditoria/ancora").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setSelo(d.selo); setAncoras(d.ancoras || []); } }).catch(() => {}); };
  useEffect(() => { carregar(); }, []);

  const registrar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const r = await fetch("/api/auditoria/ancora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "registrar" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || "Falha."); return; }
      setMsg("Âncora registrada. COPIE o selo abaixo e guarde fora do sistema (imprima/salve/e-mail).");
      carregar();
    } finally { setOcupado(false); }
  };

  const conferir = async () => {
    if (!hashConf.trim()) return;
    setConfRes(null);
    const r = await fetch("/api/auditoria/ancora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "conferir", hash: hashConf.trim() }) });
    const d = await r.json().catch(() => ({}));
    setConfRes(!!d.existe);
  };

  return (
    <div className="mb-3 rounded-lg border border-[#1d2c44] bg-[#0F1B2D]">
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold text-[#D4AF37]">⚓ Âncora externa do lacre</span>
        <span className="text-xs text-[#94A3B8]">{selo ? `${selo.count} registros lacrados` : ""} {aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <div className="border-t border-[#1d2c44] px-4 py-3 text-sm text-[#cdd9ea]">
          <p className="mb-2 text-xs text-[#94A3B8]">
            O selo é o hash do último registro + a contagem. <b>Registre</b> uma âncora, <b>copie</b> o selo e guarde <b>fora do sistema</b>.
            Se um dia a base for reescrita, o selo salvo não vai mais existir — e o &ldquo;conferir&rdquo; acusa.
          </p>

          {selo && (
            <div className="mb-3 rounded-lg bg-[#0a1626] p-3 font-mono text-[11px] leading-relaxed break-all">
              <div><span className="text-[#7f93b3]">Registros lacrados:</span> {selo.count}</div>
              <div><span className="text-[#7f93b3]">Último hash:</span> {selo.ultimoHash || "—"}</div>
              <div><span className="text-[#7f93b3]">Selo em:</span> {dh(selo.em)}</div>
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            <button onClick={registrar} disabled={ocupado} className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
              {ocupado ? "..." : "Registrar âncora agora"}
            </button>
            {selo?.ultimoHash && (
              <button onClick={() => { navigator.clipboard?.writeText(selo.ultimoHash || ""); setMsg("Selo copiado."); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                Copiar último hash
              </button>
            )}
          </div>
          {msg && <div className="mb-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">{msg}</div>}

          <div className="mb-3">
            <label className="mb-1 block text-xs text-[#94A3B8]">Conferir um selo salvo (cole o hash):</label>
            <div className="flex gap-2">
              <input value={hashConf} onChange={(e) => { setHashConf(e.target.value); setConfRes(null); }} placeholder="cole aqui o hash guardado..."
                className="flex-1 rounded-lg border border-[#28395a] bg-[#0a1626] px-3 py-1.5 font-mono text-[11px] text-white outline-none focus:border-[#D4AF37]" />
              <button onClick={conferir} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5">Conferir</button>
            </div>
            {confRes !== null && (
              <p className={`mt-1 text-xs ${confRes ? "text-emerald-300" : "text-red-300"}`}>
                {confRes ? "✓ Selo íntegro — esse hash ainda existe na corrente." : "✗ ALERTA — esse hash NÃO existe mais na base (corrente pode ter sido reescrita)."}
              </p>
            )}
          </div>

          {ancoras.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[#9fb4d4]">Âncoras registradas</p>
              <ul className="space-y-1">
                {ancoras.slice(0, 6).map((a, i) => (
                  <li key={i} className="rounded bg-[#0a1626] px-2 py-1 font-mono text-[10.5px] text-[#8fa3bf] break-all">
                    {dh(a.em)} · {a.count} reg · {a.por} · <span className="text-[#6f82a0]">{(a.ultimoHash || "").slice(0, 24)}…</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
