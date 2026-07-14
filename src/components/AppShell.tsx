"use client";

import { useState, useEffect } from "react";
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
  ShieldCheck,
  FileText,
  KeyRound,
  BookOpen,
  Receipt,
  Landmark,
  CreditCard,
  Shield,
  Truck,
  History,
} from "lucide-react";
import Relogio from "@/components/Relogio";
import BuscaGlobal from "@/components/BuscaGlobal";
import AcoesRapidas from "@/components/AcoesRapidas";
import AvatarUpload from "@/components/AvatarUpload";
import "@/components/ui-theme.css";

type Item = {
  rotulo: string;
  href?: string;
  Icone: React.ComponentType<{ className?: string }>;
  disponivel?: boolean;
  adminOnly?: boolean;
};
type Secao = { titulo: string; itens: Item[] };

// adminOnly: true  -> SO o admin ve/acessa.
// Sem adminOnly    -> todos (inclusive policial) veem.
// Regra final: o policial so enxerga Ficha Individual, JOE e Promocoes/Certidoes.
const NAV: Secao[] = [
  {
    titulo: "Principal",
    itens: [
      { rotulo: "Dashboard", href: "/dashboard", Icone: LayoutDashboard, disponivel: true, adminOnly: true },
      { rotulo: "Avisos", href: "/avisos", Icone: Bell, disponivel: true, adminOnly: true },
    ],
  },
  {
    titulo: "Recursos Humanos",
    itens: [
      { rotulo: "Cadastro de Efetivo", href: "/efetivo", Icone: Users, disponivel: true, adminOnly: true },
      { rotulo: "Hierarquia", href: "/hierarquia", Icone: Network, disponivel: true, adminOnly: true },
      { rotulo: "Organograma", href: "/organograma", Icone: Network, disponivel: true, adminOnly: true },
      { rotulo: "Efetivo por Antiguidade", href: "/antiguidade", Icone: ListOrdered, disponivel: true, adminOnly: true },
      { rotulo: "Efetivo por Lotação", href: "/lotacao", Icone: Building2, disponivel: true, adminOnly: true },
      { rotulo: "Ficha Individual", href: "/ficha", Icone: Contact, disponivel: true },
      { rotulo: "Promoções / Certidões", href: "/promocoes", Icone: Award, disponivel: true },
    ],
  },
  {
    titulo: "Operacional",
    itens: [
      { rotulo: "Plano de Férias", href: "/ferias", Icone: Palmtree, disponivel: true, adminOnly: true },
      { rotulo: "Licença-Prêmio", href: "/licenca-premio", Icone: Award, disponivel: true, adminOnly: true },
      { rotulo: "JOE", href: "/joe", Icone: ClipboardList, disponivel: true },
      { rotulo: "Requerimentos", href: "/requerimentos", Icone: FileText, disponivel: true },
      { rotulo: "Cursos", href: "/cursos", Icone: Award, disponivel: true },
      { rotulo: "Diárias", Icone: FileText, adminOnly: true },
      { rotulo: "Escalas de Serviço", href: "/escalas", Icone: ClipboardList, disponivel: true, adminOnly: true },
      { rotulo: "Mapa de Escala", href: "/escalas/mapa", Icone: Map, disponivel: true, adminOnly: true },
    ],
  },
  {
    titulo: "Disciplinar",
    itens: [
      { rotulo: "FATD", href: "/disciplinar/fatd", Icone: Gavel, disponivel: true, adminOnly: true },
      { rotulo: "Sindicância", href: "/disciplinar/sindicancia", Icone: FileText, disponivel: true, adminOnly: true },
      { rotulo: "IPS", href: "/disciplinar/ips", Icone: ShieldCheck, disponivel: true, adminOnly: true },
      { rotulo: "IPM", href: "/disciplinar/ipm", Icone: ClipboardList, disponivel: true, adminOnly: true },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Gerenciar Acessos", href: "/admin/gerar-logins", Icone: KeyRound, disponivel: true, adminOnly: true },
      { rotulo: "Auditoria", href: "/auditoria", Icone: ShieldCheck, disponivel: true, adminOnly: true },
    ],
  },
  {
    titulo: "Próximas versões",
    itens: [
      { rotulo: "Histórico Policial Militar", Icone: History, adminOnly: true },
      { rotulo: "Motoristas / CNH", Icone: Car, adminOnly: true },
      { rotulo: "Telefones", Icone: Phone, adminOnly: true },
      { rotulo: "Livro do CPU", Icone: BookOpen, adminOnly: true },
      { rotulo: "Controle de Diárias", Icone: Receipt, adminOnly: true },
      { rotulo: "Cadastro de Credor", Icone: Landmark, adminOnly: true },
      { rotulo: "RG Militar Digital (via DAL)", Icone: CreditCard, adminOnly: true },
      { rotulo: "P/3", Icone: Shield, adminOnly: true },
      { rotulo: "P/4", Icone: Truck, adminOnly: true },
    ],
  },
];

// admin = acesso total. Qualquer outro perfil (ex: "policial") = restrito.
function ehAdmin(perfil?: string | null): boolean {
  return (perfil ?? "").toLowerCase() === "admin";
}

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
  // rotulos fora do NAV
  if (pathname === "/trocar-senha" || pathname.startsWith("/trocar-senha/")) {
    return "Trocar Senha";
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
  const admin = ehAdmin(perfil);
  const primeiroNome = (userName || "").split(" ")[0] || "Usuário";

  // Busca o efetivoId e se ja tem foto, para montar o avatar (sem que as
  // paginas precisem passar isso). Roda uma vez ao carregar.
  const [meuEfetivoId, setMeuEfetivoId] = useState<string | null>(null);
  const [tenhoFoto, setTenhoFoto] = useState(false);
  const [meuNome, setMeuNome] = useState<string>("");
  useEffect(() => {
    let vivo = true;
    fetch("/api/eu")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setMeuEfetivoId(d.efetivoId ?? null);
        setTenhoFoto(!!d.temFoto);
        setMeuNome(d.nomeExibicao || "");
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Nome a exibir no cabecalho: usa "Posto + nome de guerra" da ficha quando
  // disponivel; enquanto carrega, cai no primeiro nome do login.
  const nomeExibir = meuNome || primeiroNome;

  // Secoes ja filtradas pelo perfil; secoes que ficaram vazias somem.
  const secoesVisiveis = NAV
    .map((secao) => ({
      ...secao,
      itens: secao.itens.filter((item) => admin || !item.adminOnly),
    }))
    .filter((secao) => secao.itens.length > 0);

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
        {secoesVisiveis.map((secao) => (
          <div key={secao.titulo} className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94A3B8]/60">
              {secao.titulo}
            </p>
            <ul className="space-y-1">
              {secao.itens.map((item) => {
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

        {/* Conta: visivel a todos os perfis */}
        <div className="mb-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94A3B8]/60">
            Conta
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href="/trocar-senha"
                onClick={() => setAberto(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  pathname === "/trocar-senha" || pathname.startsWith("/trocar-senha/")
                    ? "ui-nav-ativo font-semibold text-white"
                    : "text-[#94A3B8] hover:bg-white/5 hover:text-white"
                }`}
              >
                <KeyRound
                  className={`h-[18px] w-[18px] ${
                    pathname === "/trocar-senha" || pathname.startsWith("/trocar-senha/")
                      ? "text-[#D4AF37]"
                      : ""
                  }`}
                />
                Trocar Senha
              </Link>
            </li>
          </ul>
        </div>
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
        <header className="ui-glass sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 px-4 py-4">
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
              {saudacao()}, {nomeExibir}
            </p>
          </div>

          <BuscaGlobal />

          <div className="ml-auto flex items-center gap-3">
            {admin && <AcoesRapidas isAdmin={true} />}
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
                <p className="text-sm font-semibold text-white">{nomeExibir}</p>
                <p className="text-[11px] uppercase tracking-wide text-[#D4AF37]">
                  {perfil}
                </p>
              </div>
              <AvatarUpload
                efetivoId={meuEfetivoId}
                inicial={(admin ? "P" : (primeiroNome.charAt(0) || "P")).toUpperCase()}
                temFoto={tenhoFoto}
                podeEditar={!!meuEfetivoId}
              />
            </div>

            <Link
              href="/trocar-senha"
              title="Trocar senha"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Senha</span>
            </Link>

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