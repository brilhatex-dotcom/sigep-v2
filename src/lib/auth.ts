import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import crypto from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { conferirSenha, gerarHash, hashLegado } from "@/lib/senha";
import { MINUTOS_INATIVIDADE } from "@/lib/sessao";
import { geoPorIp } from "@/lib/geoip";

// ==========================================================
//  Hash IDENTICO ao Auth.gs original:
//    SHA-256( salt + senha + salt ), hex minusculo.
//  Mantido para nao invalidar nenhuma senha ja existente.
// ==========================================================
// LEGADO: mantido apenas por compatibilidade de imports. Senhas novas usam
// bcrypt (lib senha.ts). Delegado ao hashLegado para nao duplicar a regra.
export function hashSenha(senha: string, salt: string): string {
  return hashLegado(senha, salt);
}

// Le o IP injetado pelo middleware no header x-sigep-ip.
// Fallback para x-forwarded-for / x-real-ip caso disponivel.
// Nunca quebra: fora de contexto de request, retorna "desconhecido".
function ipDaRequisicao(): string {
  try {
    const h = headers();
    const sigep = h.get("x-sigep-ip");
    if (sigep) return sigep.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) {
      const primeiro = xff.split(",")[0]?.trim();
      if (primeiro) return primeiro;
    }
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    return "desconhecido";
  } catch {
    return "desconhecido";
  }
}

function uaDaRequisicao(): string {
  try { return headers().get("user-agent") || ""; } catch { return ""; }
}

/* Resume o contexto do dispositivo (mandado pelo cliente no login) para a
   auditoria: GPS, fuso, idioma, tela, plataforma e user-agent. Usado nas
   tentativas de senha para localizar melhor quem tentou (não só o IP). */
function resumoContexto(raw: string | undefined, uaServidor: string): string {
  let o: any = {};
  try { o = raw ? JSON.parse(raw) : {}; } catch {}
  const ua = (o.ua || uaServidor || "").slice(0, 180);
  const partes = [
    o.geo ? `GPS ${o.geo}` : "GPS não informado",
    o.tz ? `fuso ${o.tz}` : null,
    o.idioma ? `idioma ${o.idioma}` : null,
    o.tela ? `tela ${o.tela}` : null,
    o.plataforma ? `plataforma ${o.plataforma}` : null,
    ua ? `UA ${ua}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

// ----- Protecao contra forca bruta -----
const MAX_TENTATIVAS = 5;       // erros permitidos antes de bloquear
const BLOQUEIO_MINUTOS = 15;    // tempo de bloqueio

function agora(): number { return Date.now(); }
function minutosRestantes(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (isNaN(t)) return 0;
  const ms = t - agora();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export const authOptions: NextAuthOptions = {
  // Logout automatico por INATIVIDADE: a sessao vale MINUTOS_INATIVIDADE e e
  // renovada a cada requisicao (updateAge 0 = deslizante). Ficou o tempo todo
  // parado -> cai sozinho. Protege o PC compartilhado deixado aberto, sem
  // atrapalhar quem esta usando. O mesmo valor alimenta o relogio visivel.
  session: { strategy: "jwt", maxAge: MINUTOS_INATIVIDADE * 60, updateAge: 0 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        senha: { label: "Senha", type: "password" },
        ctx: { label: "ctx", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.senha) return null;

        // Login agora e o ID PMMA (ex.: 849988). Aceita TAMBEM a matricula/login
        // textual — assim quem ja tinha acesso (Ten Silas, Danilo) entra pelos
        // dois. Busca por: refEfetivo (id PMMA), Login e ID do usuario, com e sem
        // pontuacao, sem diferenciar maiusculas/minusculas.
        const termo = credentials.login.trim();
        const soDig = termo.replace(/\D/g, "");
        const orBusca: any[] = [
          { login: { equals: termo, mode: "insensitive" } },
          { refEfetivo: termo },
          { id: termo },
        ];
        if (soDig && soDig !== termo) {
          orBusca.push({ login: { equals: soDig, mode: "insensitive" } }, { refEfetivo: soDig }, { id: soDig });
        }
        const usuario = await prisma.usuario.findFirst({ where: { OR: orBusca } });
        // bcrypt embute o sal, entao "salt" so e exigido para hash legado
        if (!usuario || !usuario.senhaHash) return null;

        // precisa estar ativo (Ativo == "SIM")
        if ((usuario.ativo ?? "").toUpperCase() !== "SIM") return null;

        // IP de quem esta tentando logar (injetado pelo middleware) + contexto
        // do dispositivo (GPS/fuso/UA...) mandado pelo cliente na tentativa.
        const ip = ipDaRequisicao();
        const ctx = resumoContexto((credentials as any)?.ctx, uaDaRequisicao());

        // ---- bloqueio por forca bruta ----
        const restante = minutosRestantes((usuario as any).bloqueadoAte ?? null);
        if (restante > 0) {
          // bloqueado: registra a tentativa negada e nega sem checar senha
          const geoIp = await geoPorIp(ip);
          try {
            await prisma.auditoria.create({
              data: {
                acao: "login_bloqueado",
                autorLogin: usuario.login,
                autorNome: usuario.nomeCompleto ?? usuario.login,
                detalhe: `Tentativa em conta bloqueada (${restante} min restantes) — ${ctx}${geoIp ? " — " + geoIp : ""}`,
                ip,
              } as any,
            });
          } catch {}
          throw new Error(`BLOQUEADO:${restante}`);
        }

        // ---- confere a senha (bcrypt ou legado SHA-256) ----
        const { ok, precisaUpgrade } = await conferirSenha(credentials.senha, usuario.senhaHash, usuario.salt);

        if (!ok) {
          // incrementa tentativas; bloqueia se atingir o limite
          const tent = ((usuario as any).tentativas ?? 0) + 1;
          const data: any = { tentativas: tent };
          if (tent >= MAX_TENTATIVAS) {
            data.bloqueadoAte = new Date(agora() + BLOQUEIO_MINUTOS * 60000).toISOString();
            data.tentativas = 0; // zera o contador ao bloquear
          }
          try { await prisma.usuario.update({ where: { id: usuario.id }, data }); } catch {}

          // auditoria da tentativa falha (com IP + contexto + geo por IP)
          const geoIp = await geoPorIp(ip);
          try {
            await prisma.auditoria.create({
              data: {
                acao: "login_falha",
                autorLogin: usuario.login,
                autorNome: usuario.nomeCompleto ?? usuario.login,
                detalhe: (data.bloqueadoAte
                  ? `Senha incorreta — conta BLOQUEADA por ${BLOQUEIO_MINUTOS} min`
                  : `Senha incorreta (tentativa ${tent}/${MAX_TENTATIVAS})`) + ` — ${ctx}${geoIp ? " — " + geoIp : ""}`,
                ip,
              } as any,
            });
          } catch {}

          if (data.bloqueadoAte) {
            // Alerta de segurança para os admins (push). O sino também mostra
            // os bloqueios recentes via /api/seguranca/alertas.
            try {
              const { enviarParaAdmins } = await import("@/lib/push");
              void enviarParaAdmins({
                title: "🔒 Conta bloqueada por tentativas",
                body: `${usuario.login} — 5 senhas erradas. IP ${ip}.${geoIp ? " " + geoIp : ""}`,
                url: "/seguranca/tentativas",
                tag: "bloqueio-" + usuario.id,
              }).catch(() => {});
            } catch {}
            throw new Error(`BLOQUEADO:${BLOQUEIO_MINUTOS}`);
          }
          return null;
        }

        // ---- sucesso: zera tentativas e registra ultimo login ----
        // Se a senha ainda estava no esquema antigo (SHA-256), re-grava agora em
        // bcrypt — migracao transparente, sem o usuario precisar trocar a senha.
        try {
          const data: any = { tentativas: 0, bloqueadoAte: null, ultimoLogin: new Date().toISOString() };
          if (precisaUpgrade) {
            data.senhaHash = await gerarHash(credentials.senha);
            data.salt = ""; // bcrypt embute o sal; o campo antigo fica sem uso
          }
          await prisma.usuario.update({ where: { id: usuario.id }, data });
        } catch {}

        // ---- auditoria: registra a entrada no sistema (com IP) ----
        // Grava direto aqui (sem importar @/lib/auditoria) para evitar
        // dependencia circular auth <-> auditoria.
        try {
          await prisma.auditoria.create({
            data: {
              acao: "login",
              autorLogin: usuario.login,
              autorNome: usuario.nomeCompleto ?? usuario.login,
              detalhe: "Entrou no sistema",
              ip,
            } as any,
          });
        } catch {}

        return {
          id: usuario.id,
          name: usuario.nomeCompleto ?? usuario.login,
          email: usuario.email ?? null,
          login: usuario.login,
          perfil: usuario.perfil ?? "admin",
          refEfetivo: usuario.refEfetivo ?? null,
          precisaTrocar: (usuario as any).precisaTrocar ?? false,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.login = (user as any).login;
        token.perfil = (user as any).perfil;
        token.refEfetivo = (user as any).refEfetivo;
        token.precisaTrocar = (user as any).precisaTrocar;
        // Cmt do BPM / Subcmt / Chefe do P/1: acesso total (entra como admin).
        try {
          const { temAcessoTotalPorEncargo } = await import("@/lib/encargos");
          if (token.perfil !== "admin" && (await temAcessoTotalPorEncargo(token.refEfetivo as string))) {
            token.perfil = "admin";
          }
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).login = token.login;
        (session.user as any).perfil = token.perfil;
        (session.user as any).refEfetivo = token.refEfetivo;
        (session.user as any).precisaTrocar = token.precisaTrocar;
      }
      return session;
    },
  },
};