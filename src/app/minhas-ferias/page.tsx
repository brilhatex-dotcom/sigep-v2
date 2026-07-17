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

export default async function MinhasFeriasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const meuId = session.user.refEfetivo;

  const periodos: Periodo[] = [];

  if (meuId) {
    // férias do PLANO (equipes onde o militar é membro)
    const membros = await prisma.membroFerias.findMany({ where: { idPmma: meuId } });
    for (const m of membros) {
      const eq = await prisma.equipeFerias.findFirst({ where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo } });
      if (!eq) continue;
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
      </div>
    </AppShell>
  );
}
