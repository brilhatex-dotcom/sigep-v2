import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import InclusaoBarraClient from "@/components/InclusaoBarraClient";

export const dynamic = "force-dynamic";

/* Conferência das DATAS DE INCLUSÃO pela barra (só o P/1) — ver lib/inclusaoBarra. */
export default async function InclusaoPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <Link href="/efetivo" className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#D4AF37] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Cadastro de Efetivo
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">Datas de inclusão</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Quem está com a data de inclusão em branco (ou com data de outro ano que não o da barra). A sugestão é a
          data dos colegas da mesma barra — a turma é incluída junta. Sem colega de referência, anote na ficha que
          a data está faltando.
        </p>
        <InclusaoBarraClient />
      </div>
    </AppShell>
  );
}
