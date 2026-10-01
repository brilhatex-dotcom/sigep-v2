import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeVerP1 } from "@/lib/encargos";
import { postoDoMilitar } from "@/lib/promocoes";
import { ehCpopm } from "@/lib/certidoes";

/* Quem mexe na certidão/declaração do P/1 de um militar:
     · o P/1 (Chefe e Auxiliares, ou os admins enquanto não houver Chefe) —
       a de qualquer um;
     · o PRÓPRIO militar, se concorre pela CPOPM (oficial ou subtenente) —
       só a dele. */
export type AcessoCertidao = { login: string; refEfetivo: string | null; p1: boolean; proprio: boolean };

export async function acessoCertidao(efetivoAlvo?: string | null): Promise<AcessoCertidao | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  const refEfetivo = (u.refEfetivo || null) as string | null;
  const p1 = await podeVerP1(refEfetivo, admin);
  const proprio = !!refEfetivo && !!efetivoAlvo && refEfetivo === efetivoAlvo && ehCpopm(await postoDoMilitar(refEfetivo));
  return { login: String(u.login || u.name || ""), refEfetivo, p1, proprio };
}
