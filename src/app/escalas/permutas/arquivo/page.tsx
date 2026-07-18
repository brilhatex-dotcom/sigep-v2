import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import ArquivoPermutasClient from "./ArquivoPermutasClient";

export const dynamic = "force-dynamic";

/* Arquivo de permutas organizado POR LUGAR (sede + localidades). Busca por
   policial / dia / mês / ano; abre e baixa (PDF/Word). */
export default async function ArquivoPermutasPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Permutas por Lugar</h1>
        <p className="mb-4 text-sm text-[#94A3B8]">Todas as permutas — da sede e das localidades — organizadas por lugar. Escolha o lugar, busque por policial/data, abra na tela e baixe em PDF ou Word.</p>
        <ArquivoPermutasClient />
      </div>
    </AppShell>
  );
}
