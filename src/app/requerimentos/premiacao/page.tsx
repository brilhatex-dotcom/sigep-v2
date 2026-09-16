import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import RequerimentoPecuniaDoc from "@/components/RequerimentoPecuniaDoc";

export const dynamic = "force-dynamic";

/* Requerimento de premiação pecuniária por apreensão de arma de fogo.

   Tela própria, e não uma modalidade da folha comum, porque este requerimento
   é COLETIVO: um documento assinado por todos os policiais da mesma apreensão.
   O fluxo de /requerimentos/novo monta a folha de UM militar a partir da ficha
   dele — não há como representar vários ali sem desfigurar o resto. */
export default async function PremiacaoPecuniariaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <Link
          href="/requerimentos"
          className="nao-imprimir mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="nao-imprimir mb-1 text-2xl font-bold text-white">
          Requerimento por apreensão de arma de fogo
        </h1>
        <p className="nao-imprimir mb-5 text-sm text-[#94A3B8]">
          Premiação pecuniária — Decreto nº 31.564/2016 e Instrução Normativa nº 01/2016.
          Um único documento para todos os policiais da apreensão.
        </p>

        <RequerimentoPecuniaDoc />
      </div>
    </AppShell>
  );
}
