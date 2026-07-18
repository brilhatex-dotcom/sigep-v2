import { exigirAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import TentativasClient from "./TentativasClient";

export const dynamic = "force-dynamic";

/* Tela de admin: TENTATIVAS DE ACESSO (senha errada / conta bloqueada).
   Mostra data/hora, login, IP, o contexto capturado (GPS, geo por IP, fuso,
   dispositivo) e um botão para abrir a localização no mapa. */
export default async function TentativasPage() {
  const session = await exigirAdmin();

  const registros = await prisma.auditoria.findMany({
    where: { acao: { in: ["login_falha", "login_bloqueado"] } },
    orderBy: { quando: "desc" },
    take: 400,
  });

  const linhas = registros.map((r) => ({
    id: r.id,
    quando: r.quando.toISOString(),
    login: r.autorLogin ?? "",
    nome: r.autorNome ?? "",
    acao: r.acao,
    ip: (r as any).ip ?? "",
    detalhe: r.detalhe ?? "",
  }));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Tentativas de Acesso</h1>
        <p className="mb-4 text-sm text-[#94A3B8]">
          Registros de <b>senha incorreta</b> e <b>conta bloqueada</b>, com IP, localização (GPS quando permitido e aproximada por IP) e dispositivo. Exibindo os {linhas.length} eventos mais recentes.
        </p>
        <TentativasClient linhas={linhas} />
      </div>
    </AppShell>
  );
}
