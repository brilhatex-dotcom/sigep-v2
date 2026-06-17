import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ==========================================================
//  Hash IDENTICO ao Auth.gs original:
//    SHA-256( salt + senha + salt ), hex minusculo.
//  Mantido para nao invalidar nenhuma senha ja existente.
// ==========================================================
export function hashSenha(senha: string, salt: string): string {
  return crypto.createHash("sha256").update(salt + senha + salt, "utf8").digest("hex");
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
  session: { strategy: "jwt" },
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
        if (!usuario || !usuario.senhaHash || !usuario.salt) return null;

        // precisa estar ativo (Ativo == "SIM")
        if ((usuario.ativo ?? "").toUpperCase() !== "SIM") return null;

        // ---- bloqueio por forca bruta ----
        const restante = minutosRestantes((usuario as any).bloqueadoAte ?? null);
        if (restante > 0) {
          // bloqueado: nega sem nem checar a senha
          throw new Error(`BLOQUEADO:${restante}`);
        }

        // ---- confere a senha ----
        const hash = hashSenha(credentials.senha, usuario.salt);
        const ok = hash === usuario.senhaHash;

        if (!ok) {
          // incrementa tentativas; bloqueia se atingir o limite
          const tent = ((usuario as any).tentativas ?? 0) + 1;
          const data: any = { tentativas: tent };
          if (tent >= MAX_TENTATIVAS) {
            data.bloqueadoAte = new Date(agora() + BLOQUEIO_MINUTOS * 60000).toISOString();
            data.tentativas = 0; // zera o contador ao bloquear
          }
          try { await prisma.usuario.update({ where: { id: usuario.id }, data }); } catch {}
          if (data.bloqueadoAte) throw new Error(`BLOQUEADO:${BLOQUEIO_MINUTOS}`);
          return null;
        }

        // ---- sucesso: zera tentativas e registra ultimo login ----
        try {
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { tentativas: 0, bloqueadoAte: null, ultimoLogin: new Date().toISOString() },
          });
        } catch {}

        // ---- auditoria: registra a entrada no sistema ----
        // Grava direto aqui (sem importar @/lib/auditoria) para evitar
        // dependencia circular auth <-> auditoria.
        try {
          await prisma.auditoria.create({
            data: {
              acao: "login",
              autorLogin: usuario.login,
              autorNome: usuario.nomeCompleto ?? usuario.login,
              detalhe: "Entrou no sistema",
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
