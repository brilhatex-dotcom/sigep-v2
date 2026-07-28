import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { Palmtree } from "lucide-react";

export const dynamic = "force-dynamic";

/* "Minhas Férias" — área do policial. Mostra SOMENTE as férias do próprio
   militar (equipe onde ele é membro + avulsas dele). LGPD: minimização — ele
   não vê as férias dos outros. */

function dBR(iso: string | null): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const br = (iso || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[1]}/${br[2]}/${br[3]}` : (iso || "—");
}

type Periodo = { rotulo: string; inicio: string | null; fim: string | null; apres: string | null; origem: "plano" | "avulsa" };
type Colega = { id: string; postoGrad: string | null; nome: string | null; nomeGuerra: string | null; eu: boolean; postergado: boolean };
type MinhaEquipe = {
  numeroEquipe: string; anoGozo: string;
  periodos: { rotulo: string; inicio: string | null; fim: string | null; apres: string | null }[];
  colegas: Colega[];
};

export default async function MinhasFeriasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const meuId = session.user.refEfetivo;

  const periodos: Periodo[] = [];
  const minhasEquipes: MinhaEquipe[] = [];

  // Quem postergou / não vai gozar agora (só marcador de controle).
  let postergados = new Set<string>();
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_postergados" } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    if (Array.isArray(lista)) postergados = new Set(lista.map((p: any) => String(p?.idPmma || "")));
  } catch { /* ignora */ }

  if (meuId) {
    // férias do PLANO (equipes onde o militar é membro)
    const membros = await prisma.membroFerias.findMany({ where: { idPmma: meuId } });
    for (const m of membros) {
      const eq = await prisma.equipeFerias.findFirst({ where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo } });
      if (!eq) continue;

      // Plano da MINHA equipe: os colegas que saem de férias junto comigo.
      const doGrupo = await prisma.membroFerias.findMany({ where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo } });
      const fichas = await prisma.efetivo.findMany({
        where: { id: { in: doGrupo.map((x) => x.idPmma) } },
        select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
      });
      const porId = new Map(fichas.map((f) => [f.id, f]));
      const pers: MinhaEquipe["periodos"] = [];
      if (eq.periodo1Inicio || eq.periodo1Fim) pers.push({ rotulo: "1º período", inicio: eq.periodo1Inicio, fim: eq.periodo1Fim, apres: eq.periodo1Apres });
      if (eq.periodo2Inicio || eq.periodo2Fim) pers.push({ rotulo: "2º período", inicio: eq.periodo2Inicio, fim: eq.periodo2Fim, apres: eq.periodo2Apres });
      minhasEquipes.push({
        numeroEquipe: m.numeroEquipe,
        anoGozo: m.anoGozo,
        periodos: pers,
        colegas: doGrupo
          .map((x) => {
            const f = porId.get(x.idPmma);
            return {
              id: x.idPmma,
              postoGrad: f?.postoGrad ?? null,
              nome: f?.nome ?? null,
              nomeGuerra: f?.nomeGuerra ?? null,
              eu: x.idPmma === meuId,
              postergado: postergados.has(x.idPmma),
            };
          })
          .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "")),
      });

      if (eq.periodo1Inicio || eq.periodo1Fim) periodos.push({ rotulo: `Plano ${m.anoGozo} · Equipe ${m.numeroEquipe} · 1º período`, inicio: eq.periodo1Inicio, fim: eq.periodo1Fim, apres: eq.periodo1Apres, origem: "plano" });
      if (eq.periodo2Inicio || eq.periodo2Fim) periodos.push({ rotulo: `Plano ${m.anoGozo} · Equipe ${m.numeroEquipe} · 2º período`, inicio: eq.periodo2Inicio, fim: eq.periodo2Fim, apres: eq.periodo2Apres, origem: "plano" });
    }
    // férias avulsas (datas soltas) do próprio militar
    try {
      const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
      const lista = row?.valor ? JSON.parse(row.valor) : [];
      if (Array.isArray(lista)) {
        for (const a of lista) {
          if (String(a?.idPmma || "") !== meuId) continue;
          periodos.push({ rotulo: `Férias avulsa${a?.obs ? " · " + a.obs : ""}`, inicio: a?.inicio || null, fim: a?.fim || null, apres: null, origem: "avulsa" });
        }
      }
    } catch { /* ignora */ }
  }

  periodos.sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-2xl text-[#cdd9ea]">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
          <Palmtree className="h-6 w-6 text-teal-300" /> Minhas Férias
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">Suas férias registradas — plano por equipe e datas soltas. Você vê apenas as suas.</p>

        {!meuId ? (
          <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Seu login não está vinculado a uma ficha. Procure o P/1.</div>
        ) : periodos.length === 0 ? (
          <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Nenhuma férias registrada para você no momento.</div>
        ) : (
          <ul className="space-y-3">
            {periodos.map((p, i) => (
              <li key={i} className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">{p.rotulo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.origem === "avulsa" ? "bg-[#3a2f10] text-[#f3df9d]" : "bg-teal-950/60 text-teal-300"}`}>{p.origem}</span>
                </div>
                <p className="text-sm text-[#cdd9ea]">
                  <b>{dBR(p.inicio)}</b> a <b>{dBR(p.fim)}</b>
                  {p.apres ? <span className="text-[#94A3B8]"> · apresentação: {dBR(p.apres)}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Plano de férias da MINHA equipe — quem sai junto comigo. */}
        {minhasEquipes.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-1 text-lg font-bold text-white">Plano de férias da minha equipe</h2>
            <p className="mb-4 text-sm text-[#94A3B8]">A equipe em que você está lotado no plano e os militares que saem no mesmo período.</p>
            {minhasEquipes.map((eq, i) => (
              <div key={i} className="mb-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">Equipe {eq.numeroEquipe}</span>
                  <span className="rounded-full bg-teal-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-300">ano {eq.anoGozo}</span>
                  <span className="text-xs text-[#94A3B8]">{eq.colegas.length} militar(es)</span>
                </div>
                {eq.periodos.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {eq.periodos.map((p, j) => (
                      <li key={j} className="text-sm text-[#cdd9ea]">
                        <span className="text-[#94A3B8]">{p.rotulo}:</span> <b>{dBR(p.inicio)}</b> a <b>{dBR(p.fim)}</b>
                        {p.apres ? <span className="text-[#94A3B8]"> · apresentação: {dBR(p.apres)}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {eq.colegas.map((c) => (
                    <span
                      key={c.id}
                      title={c.postergado ? "Postergou as férias (não vai gozar agora)" : undefined}
                      className={
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " +
                        (c.eu
                          ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 font-bold text-[#D4AF37]"
                          : "border-white/10 bg-white/5 text-[#cdd9ea]")
                      }
                    >
                      {[c.postoGrad, c.nomeGuerra || c.nome].filter(Boolean).join(" ") || "—"}
                      {c.eu && <span className="text-[10px] uppercase">(você)</span>}
                      {c.postergado && <span className="rounded bg-amber-500/20 px-1 text-[9px] font-bold uppercase text-amber-300">postergado</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
