import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { ArrowLeft, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

function corSituacao(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("pronto")) return "bg-emerald-100 text-emerald-700";
  if (v.includes("jms")) return "bg-red-100 text-red-700";
  if (v.includes("licen") || v === "lp" || v === "ltip")
    return "bg-amber-100 text-amber-700";
  if (v.includes("reserva")) return "bg-gray-200 text-gray-600";
  return "bg-slate-100 text-slate-600";
}

// Formata datas para dd/mm/aaaa (e dd/mm/aaaa hh:mm quando comHora).
// - ISO so-data (2016-01-15) e formatado direto, sem fuso (evita
//   o dia "escorregar").
// - O formato cru do Sheets (Fri Jan 15 2016 ... GMT-0300) e a hora
//   sao convertidos no fuso de Brasilia.
// - O que nao for data reconhecivel volta como veio.
function formatarData(valor: string | null, comHora = false): string {
  if (!valor) return "";
  const s = String(valor).trim();
  if (!s) return "";

  const soData = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;

  const base: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  };
  const opts: Intl.DateTimeFormatOptions = comHora
    ? { ...base, hour: "2-digit", minute: "2-digit" }
    : base;

  return new Intl.DateTimeFormat("pt-BR", opts).format(d);
}

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-sigep-navy">
        {valor && String(valor).trim() ? String(valor) : "—"}
      </dd>
    </div>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sigep-navy">
        <span className="h-4 w-1 rounded bg-sigep-dourado" />
        {titulo}
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

export default async function FichaPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const id = decodeURIComponent(params.id);
  const m = await prisma.efetivo.findUnique({ where: { id } });

  if (!m) {
    return (
      <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
        <div className="mx-auto max-w-3xl">
          <Link
            href="/efetivo"
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-sigep-navy"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm ring-1 ring-gray-100">
            Militar não encontrado.
          </div>
        </div>
      </AppShell>
    );
  }

  const isAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const isDono = session.user.refEfetivo === id;
  const podeEditar = isAdmin || isDono;

  const iniciais = (m.nomeGuerra || m.nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/efetivo"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-sigep-navy"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao efetivo
          </Link>
          {podeEditar && (
            <Link
              href={`/efetivo/${encodeURIComponent(id)}/editar`}
              className="inline-flex items-center gap-2 rounded-lg bg-sigep-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-sigep-azul"
            >
              <Pencil className="h-4 w-4" /> Editar
            </Link>
          )}
        </div>

        <div className="flex flex-col items-start gap-4 rounded-xl bg-sigep-navy p-6 text-white sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-sigep-dourado">
            {iniciais}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">
              {m.nome ?? "(sem nome)"}
            </h1>
            <p className="text-sm text-white/70">
              {[m.postoGrad, m.nomeGuerra].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-medium ${corSituacao(
                m.situacao
              )}`}
            >
              {m.situacao && m.situacao.trim() ? m.situacao : "—"}
            </span>
            <span className="text-xs text-white/50">ID PMMA {m.id}</span>
          </div>
        </div>

        <Secao titulo="Dados funcionais">
          <Campo label="Posto/Graduação" valor={m.postoGrad} />
          <Campo label="Número/Barra" valor={m.numeroBarra} />
          <Campo label="Matrícula" valor={m.matricula} />
          <Campo label="Quadro" valor={m.quadro} />
          <Campo label="Função" valor={m.funcao} />
          <Campo label="Lotação" valor={m.lotacao} />
          <Campo label="Situação" valor={m.situacao} />
          <Campo label="Status" valor={m.status} />
          <Campo label="Data de incorporação" valor={formatarData(m.dataIncorp)} />
          <Campo label="Data da promoção" valor={formatarData(m.dataPromocao)} />
          <Campo label="Equipe de férias" valor={m.equipeFerias} />
        </Secao>

        <Secao titulo="Dados pessoais">
          <Campo label="CPF" valor={m.cpf} />
          <Campo label="RG" valor={m.rg} />
          <Campo label="Data de nascimento" valor={formatarData(m.dataNasc)} />
          <Campo label="Sexo" valor={m.sexo} />
          <Campo label="Estado civil" valor={m.estadoCivil} />
          <Campo label="Naturalidade" valor={m.naturalidade} />
          <Campo label="UF naturalidade" valor={m.naturalidadeUF} />
          <Campo label="Nome do pai" valor={m.nomePai} />
          <Campo label="Nome da mãe" valor={m.nomeMae} />
          <Campo label="Tipo sanguíneo" valor={m.tipoSanguineo} />
          <Campo label="Fator RH" valor={m.fatorRH} />
          <Campo label="Escolaridade" valor={m.grauEscolaridade} />
          <Campo label="Cursos PMMA" valor={m.cursosPMMA} />
        </Secao>

        <Secao titulo="Contato e endereço">
          <Campo label="Telefone" valor={m.telefone} />
          <Campo label="E-mail" valor={m.email} />
          <Campo label="Endereço" valor={m.endereco} />
          <Campo label="Bairro" valor={m.bairro} />
          <Campo label="Cidade" valor={m.cidade} />
          <Campo label="CEP" valor={m.cep} />
        </Secao>

        <Secao titulo="Dados bancários">
          <Campo label="Banco" valor={m.banco} />
          <Campo label="Agência" valor={m.agencia} />
          <Campo label="Conta" valor={m.conta} />
          <Campo label="Tipo de conta" valor={m.tipoConta} />
        </Secao>

        <Secao titulo="Emergência e dependentes">
          <Campo label="Contato de emergência" valor={m.emergenciaNome} />
          <Campo label="Telefone de emergência" valor={m.emergenciaTelefone} />
          <Campo label="Grau de parentesco" valor={m.emergenciaGrau} />
          <Campo label="Possui dependentes" valor={m.possuiDependentes} />
        </Secao>

        <Secao titulo="CNH">
          <Campo label="CNH" valor={m.cnh} />
          <Campo label="Categoria" valor={m.cnhCategoria} />
          <Campo label="Vencimento" valor={formatarData(m.cnhVencimento)} />
        </Secao>

        <Secao titulo="Junta Médica de Saúde (JMS)">
          <Campo label="Início JMS" valor={formatarData(m.jmsDataInicio)} />
          <Campo label="Retorno JMS" valor={formatarData(m.jmsDataRetorno)} />
          <Campo label="Motivo" valor={m.jmsMotivo} />
        </Secao>

        <Secao titulo="Registro">
          <Campo label="Observações" valor={m.observacoes} />
          <Campo label="Foto (URL)" valor={m.fotoURL} />
          <Campo label="Cadastrado em" valor={formatarData(m.dataCadastro, true)} />
          <Campo
            label="Última atualização"
            valor={formatarData(m.ultimaAtualizacao, true)}
          />
        </Secao>
      </div>
    </AppShell>
  );
}
