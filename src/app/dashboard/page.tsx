import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { Users, Cake, HeartPulse } from "lucide-react";

export const dynamic = "force-dynamic";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function mesDia(valor: string | null): { mes: number; dia: number } | null {
  if (!valor || !String(valor).trim()) return null;
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { mes: parseInt(iso[2], 10), dia: parseInt(iso[3], 10) };
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return { mes: d.getMonth() + 1, dia: d.getDate() };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const militares = await prisma.efetivo.findMany({
    select: {
      id: true,
      postoGrad: true,
      nome: true,
      nomeGuerra: true,
      situacao: true,
      dataNasc: true,
      jmsDataInicio: true,
      jmsDataRetorno: true,
      jmsMotivo: true,
    },
  });

  const total = militares.length;

  // Efetivo por situacao
  const porSituacao = new Map<string, number>();
  militares.forEach((m) => {
    const s = m.situacao && m.situacao.trim() ? m.situacao.trim() : "(sem situação)";
    porSituacao.set(s, (porSituacao.get(s) ?? 0) + 1);
  });
  const situacoes = Array.from(porSituacao.entries())
    .map(([situacao, qtd]) => ({ situacao, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  // Aniversariantes do mes
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const mesAtual = agora.getMonth() + 1;
  const aniversariantes = militares
    .map((m) => ({ m, md: mesDia(m.dataNasc) }))
    .filter((x) => x.md && x.md.mes === mesAtual)
    .sort((a, b) => a.md!.dia - b.md!.dia)
    .map((x) => ({ ...x.m, dia: x.md!.dia }));

  // Em JMS
  const emJms = militares.filter((m) => {
    const temInicio = !!(m.jmsDataInicio && m.jmsDataInicio.trim());
    const semRetorno = !(m.jmsDataRetorno && m.jmsDataRetorno.trim());
    const situacaoJms = (m.situacao ?? "").toLowerCase().includes("jms");
    return (temInicio && semRetorno) || situacaoJms;
  });

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-sigep-navy">
            Painel — 18º BPM
          </h1>
          <p className="text-sm text-gray-500">Visão geral do efetivo.</p>
        </div>

        {/* Total + situacao */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl bg-sigep-navy p-6 text-white shadow-sm">
            <Users className="mb-2 h-7 w-7 text-sigep-dourado" />
            <p className="text-4xl font-bold">{total}</p>
            <p className="text-sm text-white/70">Efetivo total</p>
          </div>

          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100 lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sigep-navy">
              <span className="h-4 w-1 rounded bg-sigep-dourado" />
              Efetivo por situação
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {situacoes.map((l) => (
                <div
                  key={l.situacao}
                  className="flex items-center justify-between border-b border-gray-50 py-1"
                >
                  <span className="text-sm text-gray-600">{l.situacao}</span>
                  <span className="text-sm font-semibold text-sigep-navy">
                    {l.qtd}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Aniversariantes + JMS */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sigep-navy">
              <Cake className="h-4 w-4 text-sigep-dourado" />
              Aniversariantes de {MESES[mesAtual - 1]} ({aniversariantes.length})
            </h2>
            {aniversariantes.length === 0 ? (
              <p className="text-sm text-gray-400">
                Nenhum aniversariante este mês (ou sem data de nascimento
                cadastrada).
              </p>
            ) : (
              <ul className="space-y-2">
                {aniversariantes.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sigep-cinza text-xs font-bold text-sigep-navy">
                      {String(m.dia).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/efetivo/${encodeURIComponent(m.id)}`}
                      className="text-sigep-navy hover:underline"
                    >
                      {m.postoGrad ? `${m.postoGrad} ` : ""}
                      {m.nomeGuerra || m.nome}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sigep-navy">
              <HeartPulse className="h-4 w-4 text-red-500" />
              Em JMS ({emJms.length})
            </h2>
            {emJms.length === 0 ? (
              <p className="text-sm text-gray-400">
                Nenhum militar em JMS no momento.
              </p>
            ) : (
              <ul className="space-y-2">
                {emJms.map((m) => (
                  <li key={m.id} className="text-sm">
                    <Link
                      href={`/efetivo/${encodeURIComponent(m.id)}`}
                      className="font-medium text-sigep-navy hover:underline"
                    >
                      {m.postoGrad ? `${m.postoGrad} ` : ""}
                      {m.nomeGuerra || m.nome}
                    </Link>
                    {m.jmsMotivo && m.jmsMotivo.trim() && (
                      <span className="text-gray-500"> — {m.jmsMotivo}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
