import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import GuiaJmsClient from "@/components/GuiaJmsClient";

export const dynamic = "force-dynamic";

/* Aba GUIA JMS E OFÍCIO: ofício de apresentação do militar à Junta Médica de
   Saúde e guia de encaminhamento médico. */
export default async function GuiaJmsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/dashboard");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white print:hidden">Guia JMS e Ofício</h1>
        <p className="mb-5 text-sm text-[#94A3B8] print:hidden">
          Busque o militar e o documento sai redigido com os dados do cadastro.
        </p>
        <GuiaJmsClient />
      </div>
    </AppShell>
  );
}
