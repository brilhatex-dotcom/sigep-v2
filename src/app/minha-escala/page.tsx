import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MinhaEscalaClient from "@/app/minha-escala/MinhaEscalaClient";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

/* "Escala de Serviço" — área do policial. A escala publicada abre JÁ NA TELA,
   sem precisar baixar arquivo, com um calendário para consultar outros dias.
   Só aparece o que o P/1 publicou oficialmente. */
export default async function MinhaEscalaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
          <ClipboardList className="h-6 w-6 text-[#D4AF37]" /> Escala de Serviço
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          A escala publicada pelo P/1, aberta aqui mesmo. Escolha a data para ver outro dia.
        </p>
        <MinhaEscalaClient />
      </div>
    </AppShell>
  );
}
