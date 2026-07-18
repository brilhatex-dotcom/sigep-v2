import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EscalasNav from "@/components/EscalasNav";
import EncargosClient from "./EncargosClient";

export const dynamic = "force-dynamic";

/* Atribuição de encargos (admin): quem é o Cmt e o sargenteante de cada lugar,
   além do Comando/Seções do BPM. Destrava o acesso escopado de cada um. */
export default async function EncargosPage() {
  const session = await exigirAdmin();
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <EscalasNav />
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Encargos e Comando</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">Defina quem comanda cada lugar (Cmt e sargenteante) e o Comando/Seções do BPM. Cada encargo destrava, no login da pessoa, o acesso à escala e aos indicadores da própria unidade.</p>
        <EncargosClient />
      </div>
    </AppShell>
  );
}
