import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ==========================================================
//  Replica EXATAMENTE o hashSenha() do seu Auth.gs:
//    texto = salt + senha + salt
//    SHA-256(texto), em hexadecimal minusculo
//  Assim as senhas que ja existem continuam funcionando,
//  sem ninguem precisar redefinir.
// ==========================================================
function hashSenha(senha: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(salt + senha + salt, "utf8")
    .digest("hex");
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

        // busca pelo Login, sem diferenciar maiusculas/minusculas
        // (igual ao fazerLogin do Apps Script)
        const usuario = await prisma.usuario.findFirst({
          where: {
            login: { equals: credentials.login.trim(), mode: "insensitive" },
          },
        });
        if (!usuario || !usuario.senhaHash || !usuario.salt) return null;

        // precisa estar ativo (Ativo == "SIM")
        if ((usuario.ativo ?? "").toUpperCase() !== "SIM") return null;

        // mesma conta do Auth.gs
        const hash = hashSenha(credentials.senha, usuario.salt);
        if (hash !== usuario.senhaHash) return null;

        return {
          id: usuario.id,
          name: usuario.nomeCompleto ?? usuario.login,
          email: usuario.email ?? null,
          login: usuario.login,
          perfil: usuario.perfil ?? "admin",
          refEfetivo: usuario.refEfetivo ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.login = user.login;
        token.perfil = user.perfil;
        token.refEfetivo = user.refEfetivo;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.login = token.login;
        session.user.perfil = token.perfil;
        session.user.refEfetivo = token.refEfetivo;
      }
      return session;
    },
  },
};
