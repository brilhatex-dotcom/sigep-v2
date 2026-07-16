import { exigirAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { verificarCadeia, garantirColunasAuditoria } from "@/lib/auditoria";
import AppShell from "@/components/AppShell";
import AuditoriaClient from "./AuditoriaClient";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const session = await exigirAdmin();

  // Garante as colunas novas (Dispositivo/Hash) ANTES de ler — senão o findMany
  // quebra a pagina enquanto nenhuma acao tiver criado as colunas.
  await garantirColunasAuditoria();

  // ultimos 300 registros (suficiente para 8 usuarios; com paginacao simples)
  const registros = await prisma.auditoria.findMany({
    orderBy: { quando: "desc" },
    take: 300,
  });

  const linhas = registros.map((r) => ({
    id: r.id,
    quando: r.quando.toISOString(),
    autorNome: r.autorNome,
    autorLogin: r.autorLogin,
    acao: r.acao,
    alvoNome: r.alvoNome,
    alvo: r.alvo,
    detalhe: r.detalhe,
    antes: r.antes,
    depois: r.depois,
    ip: (r as any).ip ?? null,
    dispositivo: (r as any).dispositivo ?? null,
    lacrado: !!(r as any).hash,
  }));

  // Verifica o lacre (cadeia de hash) de toda a auditoria.
  const integridade = await verificarCadeia();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Auditoria</h1>
        <p className="mb-4 text-sm text-[#94A3B8]">
          Registro de quem fez o quê, quando, de qual IP e dispositivo. Exibindo os {linhas.length} eventos mais recentes.
        </p>
        <AuditoriaClient linhas={linhas} integridade={integridade} />
      </div>
    </AppShell>
  );
}
