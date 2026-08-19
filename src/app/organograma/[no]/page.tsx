import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { classificarPatente } from "@/lib/patentes";
import { acharNo, pertenceAoNo } from "@/lib/organograma";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsInativos, semInativos } from "@/lib/inativos";
import { exigirAdminOuLugar } from "@/lib/guard";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function corSituacao(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("pronto")) return "bg-emerald-500/15 text-emerald-300";
  if (v.includes("jms")) return "bg-red-500/15 text-red-300";
  if (v.includes("féria") || v.includes("feria")) return "bg-sky-500/15 text-sky-300";
  if (v.includes("licen") || v === "lp" || v === "ltip") return "bg-amber-500/15 text-amber-300";
  return "bg-white/5 text-[#94A3B8]";
}

export default async function NoOrganogramaPage({
  params,
}: {
  params: { no: string };
}) {
  const { session, lugar } = await exigirAdminOuLugar();

  const no = acharNo(params.no);
  if (!no) redirect("/organograma");
  // Comando de lugar só abre nós dentro da PRÓPRIA unidade.
  if (lugar && !acharNo(params.no, lugar.no)) redirect("/organograma");

  const hoje = hojeLocal();

  const todos = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, nome: true, nomeGuerra: true,
        matricula: true, situacao: true, lotacao: true,
        jmsDataInicio: true, jmsDataRetorno: true,
      },
    }),
    await idsInativos(),
  );

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje, await idsFeriasAdiadas());
  // As férias avulsas também respeitam o adiamento: sem isto, quem o P/1
  // acabou de adiar voltava a aparecer de férias por esta linha.
  const idsAdiadosAvulsas = await idsFeriasAdiadas();
  for (const id of await idsFeriasAvulsasHoje(hoje)) if (!idsAdiadosAvulsas.has(id)) idsFerias.add(id);

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  const lista = todos
    .filter((m) => pertenceAoNo(m.lotacao, no))
    .map((m) => ({ ...m, sit: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio) }))
    .sort((a, b) => {
      const pa = classificarPatente(a.postoGrad).ordem;
      const pb = classificarPatente(b.postoGrad).ordem;
      if (pa !== pb) return pa - pb;
      return (a.nome ?? "").localeCompare(b.nome ?? "");
    });

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/organograma"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#94A3B8] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao organograma
        </Link>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">{no.rotulo}</h1>
          <p className="text-sm text-[#94A3B8]">
            {no.cidade ? `${no.cidade} · ` : ""}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {lista.length} militares
            </span>
          </p>
        </div>

        {lista.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0F1B2D] p-8 text-center text-sm text-[#94A3B8]">
            Nenhum militar com lotação correspondente a esta unidade.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0F1B2D]">
            <ul className="divide-y divide-white/5">
              {lista.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/efetivo/${encodeURIComponent(m.id)}`}
                    className="group flex items-center gap-3 px-5 py-2.5 transition hover:bg-white/5"
                  >
                    <span className="w-24 shrink-0 text-xs text-[#94A3B8]">{m.postoGrad ?? "—"}</span>
                    <span className="flex-1 text-sm text-white">
                      {m.nome ?? "—"}
                      {m.nomeGuerra && <span className="ml-2 text-xs text-[#94A3B8]">({m.nomeGuerra})</span>}
                    </span>
                    <span className="hidden text-xs text-[#94A3B8] sm:inline">{m.lotacao ?? ""}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${corSituacao(m.sit)}`}>
                      {m.sit}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/20 transition group-hover:text-[#D4AF37]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}