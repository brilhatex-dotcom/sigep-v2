import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { lugarDoUsuario } from "@/lib/lugarUsuario";

export const dynamic = "force-dynamic";

// "Ficha Individual" no menu:
// - admin -> lista de efetivo (escolhe qualquer militar)
// - Cmt/Sargenteante de lugar -> organograma da PRÓPRIA unidade (lista as fichas)
// - policial -> a propria ficha (refEfetivo)
export default async function FichaMenuPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  if (ehAdmin) redirect("/efetivo");

  // Comando de lugar: vê as fichas da própria unidade pelo organograma escopado.
  const lugar = await lugarDoUsuario((session.user as any).refEfetivo);
  if (lugar) redirect(`/organograma/${encodeURIComponent(lugar.noId)}`);

  const meuId = session.user.refEfetivo;
  if (meuId) redirect(`/efetivo/${encodeURIComponent(meuId)}`);

  // policial sem ficha vinculada
  redirect("/dashboard");
}
