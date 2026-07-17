import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import PublicacoesClient from "@/app/escalas/publicacoes/PublicacoesClient";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

/* "Escala de Serviço" — área do policial. Mostra as escalas JÁ PUBLICADAS pelo
   P/1 (histórico oficial), para baixar em PDF/Word. A escala de serviço é
   informação operacional da tropa; só aparece o que foi oficialmente publicado. */
export default async function MinhaEscalaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
          <ClipboardList className="h-6 w-6 text-[#D4AF37]" /> Escala de Serviço
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">Escalas publicadas pelo P/1. Abra e baixe em PDF ou Word.</p>
        <PublicacoesClient isAdmin={false} />
      </div>
    </AppShell>
  );
}
