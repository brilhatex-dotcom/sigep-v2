import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { PATENTES, classificarPatente } from "@/lib/patentes";

export const dynamic = "force-dynamic";

export default async function HierarquiaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militares = await prisma.efetivo.findMany({
    select: { postoGrad: true },
  });

  // conta por patente
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

  const Cartao = ({
    rotulo,
    qtd,
  }: {
    rotulo: string;
    qtd: number;
  }) => (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <p className="text-2xl font-bold text-sigep-navy">{qtd}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  );

  const Grupo = ({
    titulo,
    patentes,
  }: {
    titulo: string;
    patentes: typeof PATENTES;
  }) => {
    const soma = patentes.reduce((a, p) => a + (contagem.get(p.ordem) ?? 0), 0);
    return (
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded bg-sigep-dourado" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-sigep-navy">
            {titulo}
          </h2>
          <span className="ml-auto text-sm font-semibold text-gray-500">
            {soma}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {patentes.map((p) => (
            <Cartao
              key={p.ordem}
              rotulo={p.rotulo}
              qtd={contagem.get(p.ordem) ?? 0}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-sigep-navy">Hierarquia</h1>
        <p className="mb-6 text-sm text-gray-500">
          Distribuição do efetivo por posto e graduação — {total} militares.
        </p>

        <Grupo titulo="Oficiais" patentes={oficiais} />
        <Grupo titulo="Praças" patentes={pracas} />

        {semInfo > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {semInfo} militar(es) sem posto/graduação reconhecido. Verifique o
            campo Posto/Grad na ficha desses militares.
          </p>
        )}
      </div>
    </AppShell>
  );
}
