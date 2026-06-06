import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import LotacaoLista, { GrupoLot } from "@/components/LotacaoLista";
import { classificarPatente } from "@/lib/patentes";
import { hojeLocal, montarIdsEmFerias, situacaoCalculada } from "@/lib/situacao";

export const dynamic = "force-dynamic";

export default async function LotacaoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";

  const hoje = hojeLocal();

  const militares = await prisma.efetivo.findMany({
    select: {
      id: true, postoGrad: true, numeroBarra: true, nome: true,
      nomeGuerra: true, matricula: true, situacao: true, lotacao: true,
      jmsDataInicio: true, jmsDataRetorno: true,
    },
  });

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);

  const mapa = new Map<string, typeof militares>();
  militares.forEach((m) => {
    const lot = (m.lotacao && m.lotacao.trim()) ? m.lotacao.trim() : "(sem lotação)";
    if (!mapa.has(lot)) mapa.set(lot, []);
    mapa.get(lot)!.push(m);
  });

  const grupos: GrupoLot[] = Array.from(mapa.entries())
    .map(([lotacao, lista]) => ({
      lotacao,
      lista: [...lista]
        .sort((a, b) => {
          const pa = classificarPatente(a.postoGrad).ordem;
          const pb = classificarPatente(b.postoGrad).ordem;
          if (pa !== pb) return pa - pb;
          return (a.nome ?? "").localeCompare(b.nome ?? "");
        })
        .map((m) => ({
          id: m.id,
          postoGrad: m.postoGrad,
          numeroBarra: m.numeroBarra,
          nome: m.nome,
          nomeGuerra: m.nomeGuerra,
          matricula: m.matricula,
          situacao: situacaoCalculada(m, idsFerias, hoje),
        })),
    }))
    .sort((a, b) => a.lotacao.localeCompare(b.lotacao));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <LotacaoLista grupos={grupos} totalMil={militares.length} isAdmin={ehAdmin} />
      </div>
    </AppShell>
  );
}
