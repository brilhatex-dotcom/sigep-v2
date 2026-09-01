import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import RequerimentoForm from "@/components/RequerimentoForm";
import RequerimentoLoteForm from "@/components/RequerimentoLoteForm";
import { modeloDaModalidade } from "@/lib/requerimentos";
import { textoDaModalidade, dadosPessoais } from "@/lib/requerimentoDados";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NovoRequerimentoPage({
  searchParams,
}: {
  searchParams: { modalidade?: string; modelo?: string; lote?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const modalidade = (searchParams.modalidade || "").trim();
  if (!modalidade) redirect("/requerimentos");
  const modelo = modeloDaModalidade(modalidade);

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  // Lote: o P/1 monta o MESMO requerimento para varios militares de uma vez.
  // Aqui nao se exige ficha propria — o requerimento e dos outros, nao dele.
  const ehLote = ehAdmin && searchParams.lote === "1";

  const textos = await textoDaModalidade(modalidade);

  if (ehLote) {
    return (
      <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
        <div className="mx-auto max-w-4xl">
          <Link
            href="/requerimentos"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="mb-1 text-2xl font-bold text-white">Requerimento em lote</h1>
          <p className="mb-5 text-sm text-[#94A3B8]">
            Modalidade: <span className="font-semibold text-[#D4AF37]">{modalidade}</span>
            {modelo === "cursos" ? " · modelo de cursos" : modelo === "aquisicao_restrito" ? " · formulário do Exército (SisFPC)" : ""}
          </p>

          <RequerimentoLoteForm modalidade={modalidade} modelo={modelo} inicial={textos} />
        </div>
      </AppShell>
    );
  }

  const efetivoId = (session.user as any).refEfetivo as string | null;
  if (!efetivoId) redirect("/requerimentos");

  const pessoais = await dadosPessoais(efetivoId);
  if (!pessoais) redirect("/requerimentos");

  const inicial = {
    ...pessoais,
    ...textos,
    p2Conceito: "",
    p2UltimaPromocao: "",
    p2BgNumero: "",
    p2BgData: "",
    p2Complementares: "",
  };

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/requerimentos"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">Novo requerimento</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Modalidade: <span className="font-semibold text-[#D4AF37]">{modalidade}</span>
          {modelo === "cursos" ? " · modelo de cursos" : modelo === "aquisicao_restrito" ? " · formulário do Exército (SisFPC)" : ""}
        </p>

        <RequerimentoForm
          modalidade={modalidade}
          modelo={modelo}
          inicial={inicial}
        />
      </div>
    </AppShell>
  );
}
