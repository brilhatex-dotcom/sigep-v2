import Link from "next/link";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import { LUGARES_COMANDO } from "@/lib/encargos";
import { Building2, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

/* Painel do ADMIN para ver/gerir a escala de RÁDIO PATRULHA de CADA unidade
   (CIA/DPM/Pelotão). Cada card abre a escala escopada daquela unidade. */
export default async function EscalasUnidadesPage() {
  const session = await exigirAdmin();
  const cias = LUGARES_COMANDO.filter((l) => /^\d+cia$/.test(l.id));
  const pelotoes = LUGARES_COMANDO.filter((l) => /-p\d+$/.test(l.id));

  const Card = ({ id, rotulo }: { id: string; rotulo: string }) => (
    <Link href={`/escalas/servico/rp?escopo=${encodeURIComponent(id)}`}
      className="flex items-center justify-between gap-2 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4 transition hover:border-[#D4AF37]/50">
      <span className="flex items-center gap-2 text-sm font-semibold text-white">
        <Building2 className="h-4 w-4 text-[#D4AF37]" /> {rotulo}
      </span>
      <ChevronRight className="h-4 w-4 text-[#94A3B8]" />
    </Link>
  );

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <div className="mx-auto max-w-5xl text-[#cdd9ea]">
        <h1 className="mb-1 text-2xl font-bold text-white">Escalas das Unidades</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">Escala de Rádio Patrulha de cada CIA/DPM/Pelotão. Clique para abrir e gerir a escala da unidade (você é admin — vê todas).</p>

        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#D4AF37]">Companhias</h2>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cias.map((l) => <Card key={l.id} id={l.id} rotulo={l.rotulo} />)}
        </div>

        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#D4AF37]">Pelotões / DPM</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pelotoes.map((l) => <Card key={l.id} id={l.id} rotulo={l.rotulo} />)}
        </div>
      </div>
    </AppShell>
  );
}
