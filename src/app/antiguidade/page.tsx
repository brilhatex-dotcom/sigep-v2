import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AntiguidadeTabela from "@/components/AntiguidadeTabela";
import {
  classificarPatente,
  chaveAntiguidade,
  carimboAntiguidade,
} from "@/lib/patentes";

export const dynamic = "force-dynamic";

export default async function AntiguidadePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militares = await prisma.efetivo.findMany({
    select: {
      id: true,
      postoGrad: true,
      numeroBarra: true,
      nome: true,
      nomeGuerra: true,
      matricula: true,
      rg: true,
      cpf: true,
      situacao: true,
      lotacao: true,
      dataPromocao: true,
    },
  });

  // Ordena por antiguidade: posto -> data de promocao -> numero/barra
  const ordenados = [...militares].sort((a, b) => {
    const pa = classificarPatente(a.postoGrad).ordem;
    const pb = classificarPatente(b.postoGrad).ordem;
    if (pa !== pb) return pa - pb;
    const ca = carimboAntiguidade(a.numeroBarra, a.dataPromocao);
    const cb = carimboAntiguidade(b.numeroBarra, b.dataPromocao);
    if (ca !== cb) return ca - cb;
    const [anoA, seqA] = chaveAntiguidade(a.numeroBarra);
    const [anoB, seqB] = chaveAntiguidade(b.numeroBarra);
    if (anoA !== anoB) return anoA - anoB;
    return seqA - seqB;
  });

  // remove dataPromocao (so era para ordenar) antes de enviar ao cliente
  const linhas = ordenados.map(({ dataPromocao, ...resto }) => resto);

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-1 text-2xl font-bold text-sigep-navy">
          Efetivo por Antiguidade
        </h1>
        <p className="mb-5 text-sm text-gray-500">
          Ordenado por posto e, dentro de cada posto, por data de promoção.
        </p>
        <AntiguidadeTabela militares={linhas} />
      </div>
    </AppShell>
  );
}
