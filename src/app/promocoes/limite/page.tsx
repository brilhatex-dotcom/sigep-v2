import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import { podeVerP1 } from "@/lib/encargos";
import LimiteClient from "./LimiteClient";

export const dynamic = "force-dynamic";

/* Limite Quantitativo da CPPPM: o P/1 joga os PDFs (um por graduação, do
   site da PMMA) e o sistema mostra quem ali é do 18º BPM. */
export default async function LimiteQuantitativoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const u = session.user as any;
  const admin = (u.perfil || "").toLowerCase() === "admin";
  if (!(await podeVerP1(u.refEfetivo || null, admin))) redirect("/promocoes");

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <Link href="/promocoes" className="nao-imprimir mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Promoções
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">Limite Quantitativo</h1>
        <p className="nao-imprimir mb-5 text-sm text-[#94A3B8]">
          Jogue aqui os PDFs do Limite Quantitativo publicados pela CPPPM (site da PMMA) — um por graduação, quantos
          quiser de uma vez. O sistema lê cada um e mostra quem é do 18º BPM, na ordem do PDF.
        </p>
        <LimiteClient />
      </div>
    </AppShell>
  );
}
