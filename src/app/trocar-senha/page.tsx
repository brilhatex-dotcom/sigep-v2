import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TrocaSenhaClient from "./TrocaSenhaClient";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return <TrocaSenhaClient nome={session.user.name ?? ""} />;
}
