"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Network,
  ListOrdered,
  Contact,
  Award,
  Palmtree,
  Gavel,
  ClipboardList,
  Car,
  Phone,
  LogOut,
  Menu,
} from "lucide-react";

type Item = {
  rotulo: string;
  href?: string;
  Icone: React.ComponentType<{ className?: string }>;
  disponivel?: boolean;
};
type Secao = { titulo: string; itens: Item[] };

// Menu espelhando o SIGEP atual. Os itens sem "disponivel" aparecem
// marcados como "em breve" e ficam ativos conforme a gente constroi.
const NAV: Secao[] = [
  {
    titulo: "Principal",
    itens: [
      { rotulo: "Dashboard", href: "/dashboard", Icone: LayoutDashboard, disponivel: true },
    ],
  },
  {
    titulo: "Recursos Humanos",
    itens: [
      { rotulo: "Cadastro de Efetivo", href: "/efetivo", Icone: Users, disponivel: true },
      { rotulo: "Hierarquia", href: "/hierarquia", Icone: Network, disponivel: true },
      { rotulo: "Efetivo por Antiguidade", href: "/antiguidade", Icone: ListOrdered, disponivel: true },
      { rotulo: "Ficha Individual", Icone: Contact },
      { rotulo: "Promoções / Certidões", Icone: Award },
    ],
  },
  {
    titulo: "Operacional",
    itens: [
      { rotulo: "Plano de Férias 2026", Icone: Palmtree },
      { rotulo: "Disciplinar", Icone: Gavel },
      { rotulo: "Escalas de Serviço", Icone: ClipboardList },
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

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-sigep-navy text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
          <ShieldCheck className="h-6 w-6 text-sigep-dourado" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">SIGEP</p>
          <p className="text-xs leading-tight text-white/60">18º BPM · v2</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((secao) => (
          <div key={secao.titulo} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              {secao.titulo}
            </p>
            <ul className="space-y-1">
              {secao.itens.map((item) => {
                const ativo = !!item.href && pathname === item.href;

                if (item.disponivel && item.href) {
                  return (
                    <li key={item.rotulo}>
                      <Link
                        href={item.href}
                        onClick={() => setAberto(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                          ativo
                            ? "bg-white/10 font-semibold text-white"
                            : "text-white/75 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <item.Icone
                          className={`h-[18px] w-[18px] ${ativo ? "text-sigep-dourado" : ""}`}
                        />
                        {item.rotulo}
                        {ativo && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sigep-dourado" />
                        )}
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={item.rotulo}>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/35">
                      <item.Icone className="h-[18px] w-[18px]" />
                      {item.rotulo}
                      <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
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
    </div>
  );

  return (
    <div className="flex min-h-screen bg-sigep-cinza">
      <aside className="sticky top-0 hidden h-screen md:block">{sidebar}</aside>

      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
          />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
          <button
            className="md:hidden"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6 text-sigep-navy" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight text-sigep-navy">
                {userName}
              </p>
              <p className="text-xs leading-tight text-gray-500">perfil {perfil}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-sigep-navy"
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
