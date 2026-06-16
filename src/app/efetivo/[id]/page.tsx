import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirLogin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import CopiarDados from "./CopiarDados";
import { ArrowLeft, Pencil, User } from "lucide-react";
import { hojeLocal, montarIdsEmFerias, situacaoCalculada } from "@/lib/situacao";

export const dynamic = "force-dynamic";

type Campo = { label: string; valor: string | null; data?: boolean };
type Bloco = { titulo: string; campos: Campo[] };

function fmtData(valor: string | null): string {
  if (!valor || !String(valor).trim()) return "—";
  const s = String(valor).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return s;
}

function valorCampo(c: Campo): string {
  if (c.data) return fmtData(c.valor);
  return c.valor && String(c.valor).trim() ? String(c.valor) : "—";
}

export default async function FichaEfetivoPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await exigirLogin();

  const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | undefined;

  // >>> SEGURANCA: policial so pode ver a PROPRIA ficha. <<<
  // admin ve qualquer uma; policial que tentar abrir outra vai para a propria.
  if (!ehAdmin) {
    if (!meuEfetivo) redirect("/ficha");
    if (params.id !== meuEfetivo) redirect(`/efetivo/${encodeURIComponent(String(meuEfetivo))}`);
  }

  const m = await prisma.efetivo.findUnique({ where: { id: params.id } });
  if (!m) redirect(ehAdmin ? "/efetivo" : "/ficha");

  const ehDono = meuEfetivo === m.id;
  const podeEditar = ehAdmin || ehDono;

  // situacao calculada
  const hoje = hojeLocal();
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);
  const sitCalc = situacaoCalculada(m, idsFerias, hoje);
  const sitDifere = sitCalc !== (m.situacao ?? "").trim() && sitCalc !== "—";

  const blocos: Bloco[] = [
    {
      titulo: "Dados funcionais",
      campos: [
        { label: "Nome completo", valor: m.nome },
        { label: "Nome de guerra", valor: m.nomeGuerra },
        { label: "Posto/Graduação", valor: m.postoGrad },
        { label: "Número/Barra", valor: m.numeroBarra },
        { label: "Matrícula", valor: m.matricula },
        { label: "ID PMMA", valor: m.id },
        { label: "Quadro", valor: m.quadro },
        { label: "Função", valor: m.funcao },
        { label: "Lotação", valor: m.lotacao },
        { label: "Situação (atual)", valor: sitCalc },
        { label: "Situação (cadastro)", valor: m.situacao },
        { label: "Data de incorporação", valor: m.dataIncorp, data: true },
        { label: "Data da promoção", valor: m.dataPromocao, data: true },
        { label: "Equipe de férias", valor: m.equipeFerias },
      ],
    },
    {
      titulo: "Dados pessoais",
      campos: [
        { label: "CPF", valor: m.cpf },
        { label: "RG", valor: m.rg },
        { label: "Data de nascimento", valor: m.dataNasc, data: true },
        { label: "Sexo", valor: m.sexo },
        { label: "Estado civil", valor: m.estadoCivil },
        { label: "Naturalidade", valor: m.naturalidade },
        { label: "UF", valor: m.naturalidadeUF },
        { label: "Nome do pai", valor: m.nomePai },
        { label: "Nome da mãe", valor: m.nomeMae },
        { label: "Tipo sanguíneo", valor: m.tipoSanguineo },
        { label: "Fator RH", valor: m.fatorRH },
        { label: "Escolaridade", valor: m.grauEscolaridade },
        { label: "Cursos PMMA", valor: m.cursosPMMA },
      ],
    },
    {
      titulo: "Contato e endereço",
      campos: [
        { label: "Telefone", valor: m.telefone },
        { label: "E-mail", valor: m.email },
        { label: "Endereço", valor: m.endereco },
        { label: "Bairro", valor: m.bairro },
        { label: "Cidade", valor: m.cidade },
        { label: "CEP", valor: m.cep },
      ],
    },
    {
      titulo: "Dados bancários",
      campos: [
        { label: "Banco", valor: m.banco },
        { label: "Agência", valor: m.agencia },
        { label: "Conta", valor: m.conta },
        { label: "Tipo de conta", valor: m.tipoConta },
      ],
    },
    {
      titulo: "Emergência e dependentes",
      campos: [
        { label: "Possui dependentes", valor: m.possuiDependentes },
        { label: "Contato de emergência", valor: m.emergenciaNome },
        { label: "Telefone de emergência", valor: m.emergenciaTelefone },
        { label: "Grau de parentesco", valor: m.emergenciaGrau },
      ],
    },
    {
      titulo: "CNH",
      campos: [
        { label: "CNH", valor: m.cnh },
        { label: "Categoria", valor: m.cnhCategoria },
        { label: "Vencimento", valor: m.cnhVencimento, data: true },
      ],
    },
    {
      titulo: "JMS",
      campos: [
        { label: "Início JMS", valor: m.jmsDataInicio, data: true },
        { label: "Retorno JMS", valor: m.jmsDataRetorno, data: true },
        { label: "Motivo", valor: m.jmsMotivo },
      ],
    },
  ];

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl">
        <Link
          href={ehAdmin ? "/efetivo" : "/ficha"}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-[#D4AF37]">
              <User className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{m.nome ?? "—"}</h1>
              <p className="text-sm text-[#94A3B8]">
                {m.postoGrad ?? ""} {m.nomeGuerra ? `· ${m.nomeGuerra}` : ""}{" "}
                {m.matricula ? `· Mat. ${m.matricula}` : ""}
              </p>
              <span className="mt-1 inline-block rounded-full bg-[#D4AF37]/15 px-2.5 py-0.5 text-xs font-semibold text-[#D4AF37]">
                {sitCalc}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CopiarDados
              dados={{
                postoGrad: m.postoGrad,
                numeroBarra: m.numeroBarra,
                nomeGuerra: m.nomeGuerra,
                nome: m.nome,
                matricula: m.matricula,
                id: m.id,
                quadro: m.quadro,
                lotacao: m.lotacao,
              }}
            />
            {podeEditar && (
              <Link
                href={`/efetivo/${encodeURIComponent(m.id)}/editar`}
                className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
              >
                <Pencil className="h-4 w-4" /> Editar
              </Link>
            )}
          </div>
        </div>

        {sitDifere && (
          <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">
            Situação atual <strong>{sitCalc}</strong> calculada automaticamente (férias/JMS de hoje).
            O cadastro permanece como <strong>{m.situacao || "—"}</strong> e volta sozinho ao fim do afastamento.
          </div>
        )}

        <div className="space-y-4">
          {blocos.map((b) => (
            <section key={b.titulo} className="ui-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold uppercase tracking-wider text-[#D4AF37]">
                <span className="h-5 w-1.5 rounded bg-[#D4AF37]" />
                {b.titulo}
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
                {b.campos.map((c) => (
                  <div key={c.label} className="border-b border-white/5 pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                      {c.label}
                    </p>
                    <p className="mt-0.5 text-[15px] font-medium text-white">
                      {valorCampo(c)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
