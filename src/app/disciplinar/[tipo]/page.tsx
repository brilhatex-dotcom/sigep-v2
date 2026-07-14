import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import DisciplinarClient from "../DisciplinarClient";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, { label: string; descricao: string }> = {
  fatd: { label: "FATD", descricao: "Formulário de Apuração de Transgressão Disciplinar — controle e produção dos FATD." },
  sindicancia: { label: "Sindicância", descricao: "Apuração de fatos por meio de sindicância — controle e produção." },
  ips: { label: "IPS", descricao: "Investigação Preliminar Sumária — controle e produção." },
  ipm: { label: "IPM", descricao: "Inquérito Policial Militar — controle e produção." },
};

export default async function DisciplinarPage({ params }: { params: { tipo: string } }) {
  const session = await exigirAdmin();
  const info = TIPOS[params.tipo];
  if (!info) redirect("/disciplinar/fatd");
  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <DisciplinarClient tipo={params.tipo} tipoLabel={info.label} descricao={info.descricao} isAdmin={isAdmin} />
    </AppShell>
  );
}
