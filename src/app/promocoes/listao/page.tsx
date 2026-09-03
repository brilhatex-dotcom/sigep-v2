import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ListaoClient from "@/app/promocoes/listao/ListaoClient";
import { garantirPromocoes } from "@/lib/promocaoDb";

export const dynamic = "force-dynamic";

/* Importar o listão de promoções: o P/1 joga o PDF da relação de promovidos,
   o sistema acha quem é do 18º BPM e promove todos de uma vez, depois da
   conferência. Só administrador — a tela mexe no posto de todo o efetivo. */
export default async function ListaoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") redirect("/promocoes/minhas-certidoes");

  // histórico dos lançamentos já feitos (para o botão de desfazer)
  let lotesIniciais: any[] = [];
  try {
    await garantirPromocoes();
    const linhas = await prisma.promocaoLancada.findMany({ orderBy: { aplicadoEm: "desc" }, take: 400 });
    const porLote = new Map<string, any>();
    for (const l of linhas) {
      const atual = porLote.get(l.lote) || {
        lote: l.lote, referencia: l.referencia || "", aplicadoPor: l.aplicadoPor || "",
        aplicadoEm: l.aplicadoEm.toISOString(), quantidade: 0, desfeito: true, militares: [],
      };
      atual.quantidade += 1;
      if (!l.desfeitoEm) atual.desfeito = false;
      porLote.set(l.lote, atual);
    }
    lotesIniciais = [...porLote.values()];
  } catch { /* tabela ainda não criada: a tela abre vazia */ }

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <Link href="/promocoes"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Promoções
        </Link>

        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
          <ShieldCheck className="h-6 w-6 text-[#D4AF37]" /> Importar listão de promoções
        </h1>
        <p className="mb-5 max-w-3xl text-sm text-[#94A3B8]">
          Jogue aqui o <b className="text-[#E8EEF6]">listão da CPPPM</b> (praças, mesmo escaneado) ou o{" "}
          <b className="text-[#E8EEF6]">Diário Oficial</b> (oficiais). O sistema reconhece o formato sozinho,
          lê o documento, acha quem é do 18º BPM e monta a lista em ordem hierárquica.{" "}
          <b className="text-[#E8EEF6]">Nada é promovido sozinho</b> — o senhor confere linha por linha
          e confirma. Depois, se precisar, dá para desfazer o lançamento inteiro.
        </p>

        <ListaoClient lotesIniciais={lotesIniciais} />
      </div>
    </AppShell>
  );
}
