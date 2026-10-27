import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import DocumentosClient from "@/components/DocumentosClient";

export const dynamic = "force-dynamic";

/* Mural de documentos oficiais: BG, portarias, editais... num lugar só, com
   busca no texto. Todos consultam; só o P/1 (admin) põe, corrige e tira. O
   documento "restrito" (ex.: BG reservado) só o admin vê.
   ?bg=134&ano=2022 — vem do link "BG nº 134" da ficha. */
export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: { q?: string; bg?: string; ano?: string; tipo?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <DocumentosClient
        admin={admin}
        inicial={{
          q: (searchParams.q || "").slice(0, 120),
          bg: (searchParams.bg || "").replace(/\D/g, "").slice(0, 6),
          ano: (searchParams.ano || "").replace(/\D/g, "").slice(0, 4),
          tipo: (searchParams.tipo || "").slice(0, 40),
        }}
      />
    </AppShell>
  );
}
