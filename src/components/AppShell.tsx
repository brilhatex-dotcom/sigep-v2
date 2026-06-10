"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Network,
  ListOrdered,
  Building2,
  Contact,
  Award,
  Palmtree,
  Gavel,
  ClipboardList,
  Map,
  Car,
  Phone,
  LogOut,
  Menu,
  Bell,
  ChevronRight,
} from "lucide-react";
import Relogio from "@/components/Relogio";
import BuscaGlobal from "@/components/BuscaGlobal";
import AcoesRapidas from "@/components/AcoesRapidas";
import "@/components/ui-theme.css";

type Item = {
  rotulo: string;
  href?: string;
  Icone: React.ComponentType<{ className?: string }>;
  disponivel?: boolean;
  adminOnly?: boolean;
};
type Secao = { titulo: string; itens: Item[] };

const NAV: Secao[] = [
  {
    titulo: "Principal",
    itens: [
      { rotulo: "Dashboard", href: "/dashboard", Icone: LayoutDashboard, disponivel: true },
      { rotulo: "Avisos", href: "/avisos", Icone: Bell, disponivel: true, adminOnly: true },
    ],
  },
  {
    titulo: "Recursos Humanos",
    itens: [
      { rotulo: "Cadastro de Efetivo", href: "/efetivo", Icone: Users, disponivel: true },
      { rotulo: "Hierarquia", href: "/hierarquia", Icone: Network, disponivel: true },
      { rotulo: "Organograma", href: "/organograma", Icone: Network, disponivel: true },
      { rotulo: "Efetivo por Antiguidade", href: "/antiguidade", Icone: ListOrdered, disponivel: true },
      { rotulo: "Efetivo por Lotação", href: "/lotacao", Icone: Building2, disponivel: true },
      { rotulo: "Ficha Individual", href: "/ficha", Icone: Contact, disponivel: true },
      { rotulo: "Promoções / Certidões", href: "/promocoes", Icone: Award, disponivel: true },
    ],
  },
  {
    titulo: "Operacional",
    itens: [
      { rotulo: "Plano de Férias", href: "/ferias", Icone: Palmtree, disponivel: true },
      { rotulo: "Disciplinar", Icone: Gavel },
      { rotulo: "Escalas de Serviço", href: "/escalas", Icone: ClipboardList, disponivel: true },
      { rotulo: "Mapa de Escala", href: "/escalas/mapa", Icone: Map, disponivel: true },
    ],
  },
  {
    titulo: "Próximas versões",
    itens: [
      { rotulo: "Motoristas / CNH", Icone: Car },
      { rotulo: "Telefones", Icone: Phone },
    ],
  },
];

// Acha o rotulo da pagina atual para o breadcrumb e saudacao.
function tituloAtual(pathname: string): string {
  let melhor = "Painel";
  let tam = -1;
  for (const s of NAV) {
    for (const i of s.itens) {
      if (i.href && (pathname === i.href || pathname.startsWith(i.href + "/"))) {
        if (i.href.length > tam) {
          tam = i.href.length;
          melhor = i.rotulo;
        }
      }
    }
  }
  return melhor;
}

function saudacao(): string {
  const h = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  ).getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function AppShell({
  userName,
  perfil,
  children,
}: {
  userName: string;
  perfil: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const pagina = tituloAtual(pathname);
  const primeiroNome = (userName || "").split(" ")[0] || "Usuário";

  const sidebar = (
    <div className="ui-glass flex h-full w-60 flex-col border-r border-white/5 text-white">
      {/* logo */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-5">
        <Image
          src="/login/brasao-18bpm.png"
          alt="18º BPM"
          width={38}
          height={46}
          className="drop-shadow"
        />
        <div>
          <p className="text-sm font-extrabold leading-tight tracking-wide">
            SIGEP-<span className="text-[#D4AF37]">18BPM</span>
          </p>
          <p className="text-[10px] uppercase leading-tight tracking-wider text-[#94A3B8]">
            Gestão de Efetivo
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((secao) => (
          <div key={secao.titulo} className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94A3B8]/60">
              {secao.titulo}
            </p>
            <ul className="space-y-1">
              {secao.itens
                .filter((item) => !item.adminOnly || (perfil ?? "").toLowerCase() === "admin")
                .map((item) => {
                const ativo =
                  !!item.href &&
                  (pathname === item.href || pathname.startsWith(item.href + "/"));

                if (item.disponivel && item.href) {
                  return (
                    <li key={item.rotulo}>
                      <Link
                        href={item.href}
                        onClick={() => setAberto(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                          ativo
                            ? "ui-nav-ativo font-semibold text-white"
                            : "text-[#94A3B8] hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <item.Icone
                          className={`h-[18px] w-[18px] ${ativo ? "text-[#D4AF37]" : ""}`}
                        />
                        {item.rotulo}
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={item.rotulo}>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#94A3B8]/40">
                      <item.Icone className="h-[18px] w-[18px]" />
                      {item.rotulo}
                      <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#94A3B8]/60">
                        em breve
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 px-5 py-3 text-[10px] text-[#94A3B8]/50">
        18º BPM · Presidente Dutra - MA
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#08111F] text-white">
      <aside className="sticky top-0 hidden h-screen md:block">{sidebar}</aside>

      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="ui-glass sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <button
            className="md:hidden"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6 text-white" />
          </button>

          {/* breadcrumb + saudacao */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
              <span>SIGEP</span>
              <ChevronRight className="h-3 w-3" />
              <span className="truncate text-white/80">{pagina}</span>
            </div>
            <p className="text-sm font-semibold text-white">
              {saudacao()}, Seção P1
            </p>
          </div>

          <BuscaGlobal />

          <div className="ml-auto flex items-center gap-3">
            <AcoesRapidas isAdmin={(perfil ?? "").toLowerCase() === "admin"} />
            <Relogio />

            <button
              className="relative rounded-lg p-2 text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
              aria-label="Notificações"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            </button>

            <div className="hidden items-center gap-3 border-l border-white/10 pl-4 sm:flex">
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-white">Seção P1</p>
                <p className="text-[11px] uppercase tracking-wide text-[#D4AF37]">
                  {perfil}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D4AF37]/15 text-sm font-bold text-[#D4AF37]">
                P
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
