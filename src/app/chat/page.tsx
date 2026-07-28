import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ChatClient from "@/app/chat/ChatClient";

export const dynamic = "force-dynamic";

/* Chat interno — conversa direta entre quaisquer dois usuários do SIGEP
   (admins e policiais). Presença online, anexos até 20 MB e aviso por push. */
export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <ChatClient eu={session.user.login} meuNome={session.user.name ?? session.user.login} />
    </AppShell>
  );
}
