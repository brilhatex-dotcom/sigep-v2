import { exigirAdmin } from "@/lib/guard";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { PATENTES, classificarPatente } from "@/lib/patentes";
import { idsInativos, semInativos } from "@/lib/inativos";

export const dynamic = "force-dynamic";

export default async function HierarquiaPage() {
  const session = await exigirAdmin();

  const militares = semInativos(
    await prisma.efetivo.findMany({ select: { id: true, postoGrad: true } }),
    await idsInativos(),
  );

  const contagem = new Map<number, number>();
  let semInfo = 0;
  for (const m of militares) {
    const p = classificarPatente(m.postoGrad);
    if (p.ordem === 99) semInfo++;
    else contagem.set(p.ordem, (contagem.get(p.ordem) ?? 0) + 1);
  }
  const total = militares.length;
  const oficiais = PATENTES.filter((p) => p.ordem <= 7);
  const pracas = PATENTES.filter((p) => p.ordem >= 8);

  const Grupo = ({ titulo, patentes }: { titulo: string; patentes: typeof PATENTES }) => {
    const soma = patentes.reduce((a, p) => a + (contagem.get(p.ordem) ?? 0), 0);
    return (
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{titulo}</h2>
          <span className="ml-auto text-sm font-semibold text-[#94A3B8]">{soma}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {patentes.map((p) => {
            const qtd = contagem.get(p.ordem) ?? 0;
            return (
              <Link
                key={p.ordem}
                href={`/antiguidade?posto=${encodeURIComponent(p.rotulo)}`}
                className="ui-card group p-4"
              >
                <p className="text-2xl font-bold text-white">{qtd}</p>
                <p className="text-xs text-[#94A3B8] group-hover:text-[#D4AF37]">{p.rotulo}</p>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Hierarquia</h1>
        <p className="mb-6 text-sm text-[#94A3B8]">
          Distribuição do efetivo por posto e graduação — {total} militares. Clique numa patente para ver os militares.
        </p>
        <Grupo titulo="Oficiais" patentes={oficiais} />
        <Grupo titulo="Praças" patentes={pracas} />
        {semInfo > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            {semInfo} militar(es) sem posto/graduação reconhecido.
          </p>
        )}
      </div>
    </AppShell>
  );
}
