import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import OrganogramaArvore, { Contagens } from "@/components/OrganogramaArvore";
import { ORGANOGRAMA, NoOrg, pertenceAoNo } from "@/lib/organograma";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsInativos, semInativos } from "@/lib/inativos";
import { COORDS_UNIDADE } from "@/lib/coordsUnidades";
import MapaEfetivoWrapper from "@/components/MapaEfetivoWrapper";
import type { UnidadeMapa } from "@/components/MapaEfetivo";
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
  // (militares inativos — que saíram da unidade — ficam de fora)
  const militares = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true,
        lotacao: true,
        situacao: true,
        jmsDataInicio: true,
        jmsDataRetorno: true,
      },
    }),
    await idsInativos(),
  );

  // ferias de hoje
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje);
  for (const id of await idsFeriasAvulsasHoje(hoje)) idsFerias.add(id); // ferias em datas soltas

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  // contagem total por no (efetivo lotado, como antes)
  const lotacoes = militares.map((m) => m.lotacao);
  const contagens: Contagens = {};
  contar(ORGANOGRAMA, lotacoes, contagens);

  // situacao calculada de cada militar (Pronto / Ferias / JMS / Licença-Prêmio / ...)
  const comSituacao = militares.map((m) => ({
    id: m.id,
    lotacao: m.lotacao,
    situacao: m.situacao,
    jmsDataInicio: m.jmsDataInicio,
    jmsDataRetorno: m.jmsDataRetorno,
    situacaoCalc: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
  }));

  // status de efetivo minimo por unidade controlada
  const statusUnidades: StatusUnidade[] = calcularStatusUnidades(ORGANOGRAMA, comSituacao);
  const criticas = statusUnidades.filter((u) => u.critico);

  // mapa noId -> minimo (para o componente destacar e mostrar o status)
  const minimos = mapaMinimos();

  // mapa noId -> status, para o componente da arvore consultar rapido
  const statusPorNo: Record<string, StatusUnidade> = {};
  for (const s of statusUnidades) statusPorNo[s.noId] = s;

  // pontos do mapa: sede (dourado) + pelotoes controlados (verde/vermelho)
  const unidadesMapa: UnidadeMapa[] = [];
  const cSede = COORDS_UNIDADE["18bpm"];
  if (cSede) {
    const sedeCount = (contagens["adm"] || 0) + (contagens["especializado"] || 0) + (contagens["1cia"] || 0);
    unidadesMapa.push({ noId: "18bpm", rotulo: "18º BPM (Sede)", cidade: "Presidente Dutra - MA", lat: cSede.lat, lng: cSede.lng, disponiveis: sedeCount, efetivoTotal: sedeCount, minimo: 0, faltam: 0, critico: false, sede: true });
  }
  for (const u of statusUnidades) {
    const c = COORDS_UNIDADE[u.noId];
    if (!c) continue;
    unidadesMapa.push({ noId: u.noId, rotulo: u.rotulo, cidade: u.cidade || "", lat: c.lat, lng: c.lng, disponiveis: u.disponiveis, efetivoTotal: u.efetivoTotal, minimo: u.minimo, faltam: u.faltam, critico: u.critico });
  }

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

        {/* Mapa das unidades: verde = efetivo OK, vermelho = efetivo baixo */}
        <div className="mt-8">
          <h2 className="mb-1 text-xl font-bold text-white">Mapa do efetivo</h2>
          <p className="mb-3 text-sm text-[#94A3B8]">Cidades das unidades no Maranhão. <span className="text-emerald-400">Verde</span> = efetivo OK; <span className="text-red-400">vermelho</span> = efetivo abaixo do mínimo.</p>
          <MapaEfetivoWrapper unidades={unidadesMapa} />
        </div>
      </div>
    </AppShell>
  );
}
