import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import JoeClient from "./JoeClient";

export const dynamic = "force-dynamic";

export default async function JoePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const perfil = (session.user as any).perfil ?? "";

  return (
    <AppShell userName={session.user.name ?? ""} perfil={perfil}>
      <JoeClient perfil={perfil} />
    </AppShell>
  );
}
