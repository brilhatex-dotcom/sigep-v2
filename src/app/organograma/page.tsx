import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import OrganogramaArvore, { Contagens } from "@/components/OrganogramaArvore";
import { ORGANOGRAMA, NoOrg, pertenceAoNo } from "@/lib/organograma";
import { hojeLocal, montarIdsEmFerias, situacaoCalculada } from "@/lib/situacao";
import {
  calcularStatusUnidades,
  mapaMinimos,
  type StatusUnidade,
} from "@/lib/efetivoMinimo";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

function contar(no: NoOrg, lotacoes: (string | null)[], acc: Contagens) {
  acc[no.id] = lotacoes.filter((l) => pertenceAoNo(l, no)).length;
  for (const f of no.filhos ?? []) contar(f, lotacoes, acc);
}

export default async function OrganogramaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const hoje = hojeLocal();

  // efetivo com os campos necessarios para a situacao calculada
  const militares = await prisma.efetivo.findMany({
    select: {
      id: true,
      lotacao: true,
      situacao: true,
      jmsDataInicio: true,
      jmsDataRetorno: true,
    },
  });

  // ferias de hoje
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);

  // contagem total por no (efetivo lotado, como antes)
  const lotacoes = militares.map((m) => m.lotacao);
  const contagens: Contagens = {};
  contar(ORGANOGRAMA, lotacoes, contagens);

  // situacao calculada de cada militar (Pronto / Ferias / JMS / ...)
  const comSituacao = militares.map((m) => ({
    id: m.id,
    lotacao: m.lotacao,
    situacao: m.situacao,
    jmsDataInicio: m.jmsDataInicio,
    jmsDataRetorno: m.jmsDataRetorno,
    situacaoCalc: situacaoCalculada(m, idsFerias, hoje),
  }));

  // status de efetivo minimo por unidade controlada
  const statusUnidades: StatusUnidade[] = calcularStatusUnidades(ORGANOGRAMA, comSituacao);
  const criticas = statusUnidades.filter((u) => u.critico);

  // mapa noId -> minimo (para o componente destacar e mostrar o status)
  const minimos = mapaMinimos();

  // mapa noId -> status, para o componente da arvore consultar rapido
  const statusPorNo: Record<string, StatusUnidade> = {};
  for (const s of statusUnidades) statusPorNo[s.noId] = s;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Organograma — 18º BPM</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Estrutura do batalhão (Memorando 116/2022). Clique em uma CIA ou pelotão para ver o efetivo.
        </p>

        {/* ALERTA DE EFETIVO CRITICO */}
        {criticas.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className="font-bold text-red-300">
                Efetivo crítico — {criticas.length}{" "}
                {criticas.length === 1 ? "unidade" : "unidades"} abaixo do mínimo
              </h2>
            </div>
            <ul className="space-y-1.5">
              {criticas.map((u) => (
                <li key={u.noId} className="text-sm text-red-100/90">
                  <span className="font-semibold">{u.rotulo}</span>
                  {u.cidade ? <span className="text-red-200/70"> · {u.cidade}</span> : null}
                  {" — "}
                  <span className="font-semibold">{u.disponiveis}</span> disponíveis
                  {" de mínimo "}
                  <span className="font-semibold">{u.minimo}</span>
                  {" "}
                  <span className="text-red-200/70">
                    (faltam {u.faltam}; {u.afastados} afastado{u.afastados === 1 ? "" : "s"} de {u.efetivoTotal})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <OrganogramaArvore
          raiz={ORGANOGRAMA}
          contagens={contagens}
          minimos={minimos}
          statusPorNo={statusPorNo}
        />
      </div>
    </AppShell>
  );
}
