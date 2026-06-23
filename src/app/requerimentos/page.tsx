import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentosClient from "@/components/RequerimentosClient";

export const dynamic = "force-dynamic";

export default async function RequerimentosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  // admin ve todos os enviados; policial ve so os seus
  const where = ehAdmin ? {} : { efetivoId: meuEfetivo ?? "__sem__" };
  const lista = await prisma.requerimento.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, modalidade: true, modalidadeOutros: true, modelo: true,
      status: true, criadoEm: true, efetivoId: true,
      nomeCompleto: true, postoGrad: true,
    },
  });

  // nomes dos requerentes (para o admin ver de quem e)
  const ids = Array.from(new Set(lista.map((r) => r.efetivoId)));
  const fichas = ids.length
    ? await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
      })
    : [];
  const mapaNome = new Map(
    fichas.map((f) => [
      f.id,
      [f.postoGrad || "", (f.nomeGuerra || f.nome || "")].filter(Boolean).join(" ").trim(),
    ])
  );

  const itens = lista.map((r) => ({
    id: r.id,
    modalidade: r.modalidade === "OUTROS" && r.modalidadeOutros ? r.modalidadeOutros : r.modalidade,
    modelo: r.modelo,
    status: r.status,
    criadoEm: r.criadoEm.toISOString(),
    requerente: mapaNome.get(r.efetivoId) || r.nomeCompleto || r.efetivoId,
  }));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <RequerimentosClient itens={itens} ehAdmin={ehAdmin} temFicha={!!meuEfetivo} />
      </div>
    </AppShell>
  );
}
