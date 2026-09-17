import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentosClient from "@/components/RequerimentosClient";
import { itensPremiacao } from "@/lib/premiacaoItens";
import PremiacaoEsperando from "@/components/PremiacaoEsperando";

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

  const comuns = lista.map((r) => ({
    id: r.id,
    modalidade: r.modalidade === "OUTROS" && r.modalidadeOutros ? r.modalidadeOutros : r.modalidade,
    modelo: r.modelo,
    status: r.status,
    criadoEm: r.criadoEm.toISOString(),
    requerente: mapaNome.get(r.efetivoId) || r.nomeCompleto || r.efetivoId,
  }));

  /* A premiação pecuniária entra NA MESMA LISTA, e não num bloco à parte em
     cima da tela: ela também tem data, e quem procura um requerimento procura
     pelo mês. A própria lista agrupa, recolhe e filtra — não precisa de uma
     segunda tela para crescer junto. */
  const pecunia = await itensPremiacao(
    String((session.user as any).login || ""), meuEfetivo ?? "", ehAdmin,
  );
  const itens = [...comuns, ...pecunia];

  /* Uma linha no alto com o que espera por VOCÊ — só a contagem, porque o selo
     da linha não ajuda se ela estiver num mês recolhido. Com um só, leva
     direto ao documento; com vários, à tela deles. */
  const meus = pecunia.filter((p) => p.status === "pecunia_falta_voce");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <PremiacaoEsperando
          quantos={meus.length}
          href={meus.length === 1 ? meus[0].href : "/requerimentos/premiacao"}
        />
        <RequerimentosClient itens={itens} ehAdmin={ehAdmin} temFicha={!!meuEfetivo} />
      </div>
    </AppShell>
  );
}
