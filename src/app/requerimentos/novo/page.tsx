import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentoForm from "@/components/RequerimentoForm";
import { modeloDaModalidade, AMPARO_PADRAO } from "@/lib/requerimentos";
import { ArrowLeft } from "lucide-react";

// alguns registros antigos foram gravados como Date.toString() do JS
// (ex: "Mon Aug 12 1991 00:00:00 GMT-0300..."); aqui normalizamos pra dd/mm/aaaa
function dataBR(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return valor; // se não for uma data válida, devolve como veio
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
export const dynamic = "force-dynamic";

export default async function NovoRequerimentoPage({
  searchParams,
}: {
  searchParams: { modalidade?: string; modelo?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const efetivoId = (session.user as any).refEfetivo as string | null;
  if (!efetivoId) redirect("/requerimentos");

  const modalidade = (searchParams.modalidade || "").trim();
  if (!modalidade) redirect("/requerimentos");
  const modelo = modeloDaModalidade(modalidade);

  // dados da ficha do policial
  const m = await prisma.efetivo.findUnique({ where: { id: efetivoId } });
  if (!m) redirect("/requerimentos");

  // perfil salvo (dados extras que ele ja preencheu antes)
  const perfil = await prisma.perfilRequerente.findUnique({ where: { efetivoId } });

  // monta os valores iniciais: ficha + perfil (perfil tem prioridade no que ele ja ajustou)
  const inicial = {
    nomeCompleto: m.nome || "",
    endereco: perfil?.endereco || m.endereco || "",
    complemento: perfil?.complemento || "",
    bairro: perfil?.bairro || m.bairro || "",
    municipio: perfil?.municipio || m.cidade || "",
    fone: perfil?.fone || m.telefone || "",
    dataNasc: dataBR(m.dataNasc),
    dataInclusao: dataBR(m.dataIncorp),
    matricula: m.matricula || "",
    idPmmaTxt: m.id || "",
    postoGrad: m.postoGrad || "",
    numeroPm: m.numeroBarra || "",
    tempoServico: "",
    cargoFuncao: perfil?.cargoFuncao || m.funcao || "",
    estadoCivil: perfil?.estadoCivil || m.estadoCivil || "",
    // OPM em que o militar e classificado: fixo do batalhao (sempre CPA I/2)
    opmClassificado: "CPA I/2",
    opmExercicio: perfil?.opmExercicio || "18º BPM",
    cpf: perfil?.cpf || m.cpf || "",
    email: perfil?.email || m.email || "",
    amparoLegal: AMPARO_PADRAO[modalidade] || "",
    infoAdicional: "",
    modalidadeOutros: "",
    p2Conceito: "",
    p2SituacaoJur: "",
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
          {modelo === "cursos" ? " · modelo de cursos" : ""}
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
