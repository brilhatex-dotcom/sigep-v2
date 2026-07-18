import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import crypto from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { conferirSenha, gerarHash, hashLegado } from "@/lib/senha";
import { MINUTOS_INATIVIDADE } from "@/lib/sessao";

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
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.senha) return null;

        // Login agora e a MATRICULA (ou o Login textual antigo do admin):
        // busca por login, sem diferenciar maiusculas/minusculas.
        const usuario = await prisma.usuario.findFirst({
          where: { login: { equals: credentials.login.trim(), mode: "insensitive" } },
        });
        // bcrypt embute o sal, entao "salt" so e exigido para hash legado
        if (!usuario || !usuario.senhaHash) return null;

        // precisa estar ativo (Ativo == "SIM")
        if ((usuario.ativo ?? "").toUpperCase() !== "SIM") return null;

        // IP de quem esta tentando logar (injetado pelo middleware)
        const ip = ipDaRequisicao();

        // ---- bloqueio por forca bruta ----
        const restante = minutosRestantes((usuario as any).bloqueadoAte ?? null);
        if (restante > 0) {
          // bloqueado: registra a tentativa negada e nega sem checar senha
          try {
            await prisma.auditoria.create({
              data: {
                acao: "login_bloqueado",
                autorLogin: usuario.login,
                autorNome: usuario.nomeCompleto ?? usuario.login,
                detalhe: `Tentativa em conta bloqueada (${restante} min restantes)`,
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

          // auditoria da tentativa falha (com IP)
          try {
            await prisma.auditoria.create({
              data: {
                acao: "login_falha",
                autorLogin: usuario.login,
                autorNome: usuario.nomeCompleto ?? usuario.login,
                detalhe: data.bloqueadoAte
                  ? `Senha incorreta — conta BLOQUEADA por ${BLOQUEIO_MINUTOS} min`
                  : `Senha incorreta (tentativa ${tent}/${MAX_TENTATIVAS})`,
                ip,
              } as any,
            });
          } catch {}

          if (data.bloqueadoAte) throw new Error(`BLOQUEADO:${BLOQUEIO_MINUTOS}`);
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