import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RequerimentoForm from "@/components/RequerimentoForm";
import { lerPce } from "@/lib/gerarRequerimento";
import { ehModeloAquisicao } from "@/lib/requerimentos";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/* Edicao de um requerimento ja criado — mesma tela do "novo", so que os
   valores vem do que esta gravado, e o salvar faz PUT em vez de POST.

   Quem pode: o admin, em qualquer um; o policial, so nos proprios e enquanto
   estiverem em rascunho (a API confere isso de novo ao salvar). */

// "Nº do BG" e "Data do BG" nao tem coluna propria: ficam como JSON dentro de
// p2SituacaoJur. Aqui desfazemos para o formulario mostrar os dois campos.
function lerBg(p2SituacaoJur: string | null): { bgNumero: string; bgData: string } {
  if (!p2SituacaoJur) return { bgNumero: "", bgData: "" };
  try {
    const v = JSON.parse(p2SituacaoJur);
    return { bgNumero: String(v?.bgNumero || ""), bgData: String(v?.bgData || "") };
  } catch {
    return { bgNumero: "", bgData: "" };
  }
}

export default async function EditarRequerimentoPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | null;

  const r = await prisma.requerimento.findUnique({ where: { id: params.id } });
  if (!r) redirect("/requerimentos");
  if (!ehAdmin && r.efetivoId !== meuEfetivo) redirect("/requerimentos");
  if (!ehAdmin && r.status !== "rascunho") redirect(`/requerimentos/${r.id}`);

  const bg = lerBg(r.p2SituacaoJur);
  // Aquisicao de uso restrito: os dados do produto ficam como JSON dentro de
  // p2Complementares — desfazemos aqui para o formulario mostrar campo a campo.
  const pce = ehModeloAquisicao(r.modelo) ? lerPce(r.p2Complementares) : null;

  const inicial: Record<string, string> = {
    nomeCompleto: r.nomeCompleto ?? "",
    endereco: r.endereco ?? "",
    complemento: r.complemento ?? "",
    bairro: r.bairro ?? "",
    municipio: r.municipio ?? "",
    fone: r.fone ?? "",
    dataNasc: r.dataNasc ?? "",
    dataInclusao: r.dataInclusao ?? "",
    matricula: r.matricula ?? "",
    idPmmaTxt: r.idPmmaTxt ?? "",
    postoGrad: r.postoGrad ?? "",
    numeroPm: r.numeroPm ?? "",
    tempoServico: r.tempoServico ?? "",
    cargoFuncao: r.cargoFuncao ?? "",
    estadoCivil: r.estadoCivil ?? "",
    opmClassificado: r.opmClassificado ?? "",
    opmExercicio: r.opmExercicio ?? "",
    cpf: r.cpf ?? "",
    email: r.email ?? "",
    amparoLegal: r.amparoLegal ?? "",
    infoAdicional: r.infoAdicional ?? "",
    modalidadeOutros: r.modalidadeOutros ?? "",
    p2Conceito: r.p2Conceito ?? "",
    p2UltimaPromocao: r.p2UltimaPromocao ?? "",
    p2BgNumero: bg.bgNumero,
    p2BgData: bg.bgData,
    p2Complementares: pce ? "" : (r.p2Complementares ?? ""),
    ...(pce
      ? {
          produto: pce.produto,
          marca: pce.marca,
          modeloArma: pce.modeloArma,
          calibre: pce.calibre,
          quantidade: pce.quantidade,
        }
      : {}),
  };

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/requerimentos/${r.id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-white">Editar requerimento</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Modalidade: <span className="font-semibold text-[#D4AF37]">{r.modalidade}</span>
          {r.postoGrad || r.nomeCompleto ? ` · ${[r.postoGrad, r.nomeCompleto].filter(Boolean).join(" ")}` : ""}
        </p>

        <RequerimentoForm
          modalidade={r.modalidade}
          modelo={r.modelo}
          inicial={inicial}
          editandoId={r.id}
        />
      </div>
    </AppShell>
  );
}
