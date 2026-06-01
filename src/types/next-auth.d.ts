import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    login: string;
    perfil: string;
    refEfetivo: string | null;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      login: string;
      perfil: string;
      refEfetivo: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login: string;
    perfil: string;
    refEfetivo: string | null;
  }
}
