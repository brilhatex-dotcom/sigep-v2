import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

/* =========================================================================
   src/lib/guard.ts  — protecao de paginas no servidor.

   exigirLogin() : exige sessao; se for 1o acesso (precisaTrocar) -> /trocar-senha
   exigirAdmin() : exige admin; policial vai para /ficha; 1o acesso -> /trocar-senha
   souAdmin(s)   : helper booleano

   Uso:
     import { exigirAdmin } from "@/lib/guard";
     const session = await exigirAdmin();
   ========================================================================= */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil ?? "").toLowerCase() === "admin";
}

export async function exigirLogin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as any).precisaTrocar) redirect("/trocar-senha");
  return session;
}

export async function exigirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as any).precisaTrocar) redirect("/trocar-senha");
  if (!ehAdmin((session.user as any).perfil)) redirect("/ficha");
  return session;
}

export function souAdmin(session: any): boolean {
  return ehAdmin(session?.user?.perfil);
}
