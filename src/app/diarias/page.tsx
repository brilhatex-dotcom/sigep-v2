import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import FichaCredor from "@/components/FichaCredor";

export const dynamic = "force-dynamic";

/* Área de DIÁRIAS. Por enquanto a Ficha de Cadastro de Credor; a Ficha de
   Controle Individual de Diárias entra em seguida, na mesma tela. */
export default async function DiariasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/dashboard");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white print:hidden">Diárias</h1>
        <p className="mb-5 text-sm text-[#94A3B8] print:hidden">
          Ficha de Cadastro de Credor — busque o militar e a ficha sai preenchida com os dados do cadastro.
        </p>
        <FichaCredor />
      </div>
    </AppShell>
  );
}
