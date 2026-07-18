"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Menu modular do bloco de Escalas. As telas prontas viram links; as das
   proximas fases aparecem como "em breve" (estrutura visivel desde ja). */

type Item = { href?: string; ic: string; label: string; breve?: boolean };

const ITENS: Item[] = [
  { href: "/escalas/mapa", ic: "📅", label: "Escala Mensal" },
  { href: "/escalas", ic: "📆", label: "Escala Diária" },
  { href: "/escalas/servico/cpu", ic: "🎖️", label: "CPU de dia" },
  { href: "/escalas/servico/rp", ic: "🚔", label: "Rádio Patrulha" },
  { href: "/escalas/servico/ft", ic: "⚔️", label: "Força Tática" },
  { href: "/escalas/servico/rotem", ic: "🛡️", label: "ROTEM" },
  { href: "/escalas/servico/inteligencia", ic: "🕵️", label: "Inteligência" },
  { href: "/escalas/servico/permanencia", ic: "🏢", label: "Permanência" },
  { href: "/escalas/permutas", ic: "🔄", label: "Substituições" },
  { href: "/escalas/unidades", ic: "🏘️", label: "Escalas das Unidades" },
  { href: "/escalas/encargos", ic: "🧑‍✈️", label: "Encargos e Comando" },
  { href: "/escalas/publicacoes", ic: "📄", label: "Publicações" },
  { href: "/escalas/estatisticas", ic: "📊", label: "Estatísticas" },
];

// Para o comando de lugar (interior): só Rádio Patrulha e Publicações.
const ITENS_RP: Item[] = [
  { href: "/escalas/servico/rp", ic: "🚔", label: "Rádio Patrulha da unidade" },
];

export default function EscalasNav({ soRp = false }: { soRp?: boolean }) {
  const path = usePathname() || "";
  const itens = soRp ? ITENS_RP : ITENS;
  return (
    <div className="esc-nav no-print">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span className="esc-nav-tit">Escalas</span>
      <div className="esc-nav-itens">
        {itens.map((it) => {
          if (it.breve || !it.href) {
            return (
              <span key={it.label} className="esc-item breve" title="Em breve — próximas fases">
                <span className="esc-ic">{it.ic}</span>{it.label}
                <span className="esc-badge">em breve</span>
              </span>
            );
          }
          const ativo = it.href === "/escalas" ? path === "/escalas" : path.startsWith(it.href);
          return (
            <Link key={it.label} href={it.href} className={"esc-item" + (ativo ? " on" : "")}>
              <span className="esc-ic">{it.ic}</span>{it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
.esc-nav{ display:flex; align-items:center; gap:12px; background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px; padding:8px 12px; margin-bottom:14px; }
.esc-nav-tit{ font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#D4AF37; white-space:nowrap; }
.esc-nav-itens{ display:flex; gap:6px; overflow-x:auto; scrollbar-width:thin; }
.esc-item{ display:inline-flex; align-items:center; gap:7px; white-space:nowrap; background:#0a1626; color:#cdd9ea; border:1px solid #28395a; border-radius:9px; padding:7px 12px; font-size:13px; text-decoration:none; cursor:pointer; }
.esc-item:hover{ border-color:#D4AF37; color:#fff; }
.esc-item.on{ background:#D4AF37; color:#0a1020; border-color:#D4AF37; font-weight:700; }
.esc-ic{ font-size:14px; }
.esc-item.breve{ opacity:.5; cursor:default; }
.esc-item.breve:hover{ border-color:#28395a; color:#cdd9ea; }
.esc-badge{ font-size:9.5px; background:#2a2410; color:#f3df9d; border:1px solid #6b5320; border-radius:999px; padding:1px 6px; }
@media print{ .esc-nav{ display:none !important; } }
`;
