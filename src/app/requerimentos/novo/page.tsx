import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentoForm from "@/components/RequerimentoForm";
import {
  modeloDaModalidade,
  amparoDaModalidade,
  especificacaoDaModalidade,
  infoPadraoDaModalidade,
} from "@/lib/requerimentos";
import { ArrowLeft } from "lucide-react";

// Normaliza qualquer data para dd/mm/aaaa SEM deslocar o dia por fuso horario.
// IMPORTANTE: "1991-08-12" (so data) e interpretado pelo `new Date()` como
// meia-noite UTC; ao converter para America/Sao_Paulo (GMT-3) voltava um dia
// (saia "11/08/1991"). Por isso tratamos ISO e dd/mm/aaaa por regex, e so
// caimos no `new Date()` para formatos soltos (ex.: "Mon Aug 12 1991 ... GMT-0300").
function dataBR(valor: string | null | undefined): string {
  if (!valor) return "";
  const s = String(valor).trim();
  if (!s) return "";
  // ja em dd/mm/aaaa
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  // ISO aaaa-mm-dd (com ou sem hora) -> sem passar pelo fuso
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // outros formatos que o Date entenda (ex.: Date.toString() antigo)
  const d = new Date(s);
  if (isNaN(d.getTime())) return s; // nao reconheceu: devolve como veio
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
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
    amparoLegal: amparoDaModalidade(modalidade),
    // pedidos de armamento/colete ja vem com o texto padrao do protocolo
    infoAdicional: infoPadraoDaModalidade(modalidade),
    modalidadeOutros: especificacaoDaModalidade(modalidade),
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
