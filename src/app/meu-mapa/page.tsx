import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import MeuMapaView from "@/components/MeuMapaView";
import { type Cadastro, construirIdDe, temPrevisaoNaSede, previsaoDoMilitar } from "@/lib/escalaMotor";

export const dynamic = "force-dynamic";

/* "Meu Mapa de Escala" — área do policial da SEDE (rodízio de serviço externo).
   O cálculo é feito NO SERVIDOR: o navegador do policial recebe apenas os
   DIAS DELE, nunca a escala dos outros (LGPD/minimização). Quem não tem
   previsão na sede vê a mensagem de "sem previsão" (sem acesso à escala). */
export default async function MeuMapaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const meuId = session.user.refEfetivo ?? null;

  let cad: Cadastro | null = null;
  let escalas: Record<string, any> = {};
  try {
    const [rc, rd] = await Promise.all([
      prisma.config.findUnique({ where: { chave: "escala_cadastro" } }),
      prisma.config.findUnique({ where: { chave: "escala_dias" } }),
    ]);
    if (rc?.valor) cad = JSON.parse(rc.valor);
    if (rd?.valor) escalas = JSON.parse(rd.valor);
  } catch { /* sem cadastro ainda */ }

  const temPrevisao = temPrevisaoNaSede(cad, meuId || "");

  let dias: { iso: string; servicos: string[] }[] = [];
  if (cad && meuId && temPrevisao) {
    const efetivo = await prisma.efetivo.findMany({ select: { id: true, numeroBarra: true, nome: true, nomeGuerra: true } });
    dias = previsaoDoMilitar(cad, escalas, meuId, construirIdDe(efetivo), 60);
  }

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <MeuMapaView meuId={meuId} temPrevisao={temPrevisao} dias={dias} />
    </AppShell>
  );
}
