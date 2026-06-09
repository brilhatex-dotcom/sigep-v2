import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// "Ficha Individual" no menu:
// - admin -> lista de efetivo (escolhe qualquer militar)
// - policial -> a propria ficha (refEfetivo)
export default async function FichaMenuPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  if (ehAdmin) redirect("/efetivo");

  const meuId = session.user.refEfetivo;
  if (meuId) redirect(`/efetivo/${encodeURIComponent(meuId)}`);

  // policial sem ficha vinculada
  redirect("/dashboard");
}
