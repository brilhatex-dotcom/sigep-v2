import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AvisosManager from "@/components/AvisosManager";

export const dynamic = "force-dynamic";

export default async function AvisosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/dashboard");

  const avisos = await prisma.aviso.findMany({ orderBy: { criadoEm: "desc" } });

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Avisos</h1>
        <AvisosManager
          inicial={avisos.map((a) => ({
            id: a.id,
            texto: a.texto,
            cor: a.cor,
            validade: a.validade,
          }))}
        />
      </div>
    </AppShell>
  );
}
