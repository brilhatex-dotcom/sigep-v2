import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import MinhasFeriasPainel, { type CartaoFerias, type PeriodoTela } from "@/components/MinhasFeriasPainel";
import { Palmtree } from "lucide-react";
import { dataBR, paraData } from "@/lib/datas";

export const dynamic = "force-dynamic";

/* "Minhas Férias" — área do policial. Mostra SOMENTE as férias do próprio
   militar (equipe onde ele é membro + avulsas dele). LGPD: minimização — ele
   não vê as férias dos outros, nem quem mais está na equipe dele.
   A tela (MinhasFeriasPainel) mostra cada férias UMA vez: a próxima em
   destaque, com o que fazer agora; as outras abaixo; as que já passaram
   recolhidas no fim. */

// Usa o formatador padrão do SIGEP (dd/mm/aaaa). O banco guarda datas em
// formatos variados — inclusive o texto longo do JavaScript — e o dataBR
// resolve todos; antes o valor cru vazava para a tela.
const dBR = (v: string | null) => dataBR(v);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Periodo = { rotulo: string; inicio: string | null; fim: string | null; apres: string | null; origem: "plano" | "avulsa" };
type MinhaEquipe = {
  numeroEquipe: string; anoGozo: string;
  periodos: { rotulo: string; inicio: string | null; fim: string | null; apres: string | null }[];
};

export default async function MinhasFeriasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const meuId = session.user.refEfetivo;

  const periodos: Periodo[] = [];
  const minhasEquipes: MinhaEquipe[] = [];

  // RAPIDEZ: adiados, minhas equipes e avulsas vão ao banco juntos
  const [rowPostergados, membros, rowAvulsas] = await Promise.all([
    prisma.config.findUnique({ where: { chave: "ferias_postergados" } }).catch(() => null),
    meuId ? prisma.membroFerias.findMany({ where: { idPmma: meuId } }) : Promise.resolve([]),
    meuId ? prisma.config.findUnique({ where: { chave: "ferias_avulsas" } }).catch(() => null) : Promise.resolve(null),
  ]);

  // Quem postergou / não vai gozar agora (só marcador de controle).
  let postergados = new Set<string>();
  try {
    const lista = rowPostergados?.valor ? JSON.parse(rowPostergados.valor) : [];
    if (Array.isArray(lista)) postergados = new Set(lista.map((p: any) => String(p?.idPmma || "")));
  } catch { /* ignora */ }
  const euAdiei = !!meuId && postergados.has(meuId);

  if (meuId) {
    // férias do PLANO (as equipes onde o militar está) — lidas ao mesmo tempo.
    // Só as datas: quem mais está na equipe não aparece (pedido do P/1).
    const equipesDele = await Promise.all(membros.map((m) =>
      prisma.equipeFerias.findFirst({ where: { numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo } })));
    membros.forEach((m, i) => {
      const eq = equipesDele[i];
      if (!eq) return;
      const pers: MinhaEquipe["periodos"] = [];
      if (eq.periodo1Inicio || eq.periodo1Fim) pers.push({ rotulo: "1º período", inicio: eq.periodo1Inicio, fim: eq.periodo1Fim, apres: eq.periodo1Apres });
      if (eq.periodo2Inicio || eq.periodo2Fim) pers.push({ rotulo: "2º período", inicio: eq.periodo2Inicio, fim: eq.periodo2Fim, apres: eq.periodo2Apres });
      minhasEquipes.push({
        numeroEquipe: m.numeroEquipe,
        anoGozo: m.anoGozo,
        periodos: pers,
      });

      if (eq.periodo1Inicio || eq.periodo1Fim) periodos.push({ rotulo: `Plano ${m.anoGozo} · Equipe ${m.numeroEquipe} · 1º período`, inicio: eq.periodo1Inicio, fim: eq.periodo1Fim, apres: eq.periodo1Apres, origem: "plano" });
      if (eq.periodo2Inicio || eq.periodo2Fim) periodos.push({ rotulo: `Plano ${m.anoGozo} · Equipe ${m.numeroEquipe} · 2º período`, inicio: eq.periodo2Inicio, fim: eq.periodo2Fim, apres: eq.periodo2Apres, origem: "plano" });
    });
    // férias avulsas (datas soltas) do próprio militar
    try {
      const lista = rowAvulsas?.valor ? JSON.parse(rowAvulsas.valor) : [];
      if (Array.isArray(lista)) {
        for (const a of lista) {
          if (String(a?.idPmma || "") !== meuId) continue;
          periodos.push({ rotulo: `Férias avulsa${a?.obs ? " · " + a.obs : ""}`, inicio: a?.inicio || null, fim: a?.fim || null, apres: null, origem: "avulsa" });
        }
      }
    } catch { /* ignora */ }
  }

  /* Um cartão por férias (cada equipe do plano e cada avulsa), já com as
     datas prontas e os dias contados — a tela só arruma e conta o tempo. */
  const per = (rotulo: string, inicio: string | null, fim: string | null, apres: string | null): PeriodoTela => {
    const a = paraData(inicio), b = paraData(fim);
    return {
      rotulo,
      inicioBR: dBR(inicio), fimBR: dBR(fim),
      // sem apresentação gravada, é o dia seguinte ao fim (a regra do memorando)
      apresBR: apres && dBR(apres) !== "—" ? dBR(apres) : b ? dBR(iso(new Date(b.getTime() + 86400000))) : "—",
      inicioISO: a ? iso(a) : null, fimISO: b ? iso(b) : null,
      dias: a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1) : 0,
    };
  };
  const cartoes: CartaoFerias[] = [
    ...minhasEquipes.map((eq): CartaoFerias => ({
      chave: `plano:${eq.anoGozo}:${eq.numeroEquipe}`,
      tipo: "plano",
      titulo: `Férias ${eq.anoGozo}`,
      anoGozo: eq.anoGozo, numeroEquipe: eq.numeroEquipe,
      periodos: eq.periodos.map((p) => per(p.rotulo, p.inicio, p.fim, p.apres)),
      adiado: euAdiei,
    })),
    ...periodos.filter((p) => p.origem === "avulsa").map((p, i): CartaoFerias => ({
      chave: `avulsa:${i}`,
      tipo: "avulsa",
      titulo: p.rotulo.replace(/^Férias avulsa/, "Férias avulsas"),
      anoGozo: null, numeroEquipe: null,
      periodos: [per("Período", p.inicio, p.fim, p.apres)],
      adiado: false,
    })),
  ].sort((x, y) => (x.periodos[0]?.inicioISO || "").localeCompare(y.periodos[0]?.inicioISO || ""));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-2xl text-[#cdd9ea]">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-white">
          <Palmtree className="h-6 w-6 text-teal-300" /> Minhas Férias
        </h1>
        <p className="mb-5 text-sm text-[#94A3B8]">As suas férias e o seu memorando. Só você vê as suas.</p>
        {!meuId ? (
          <div className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-6 text-center text-sm text-[#94A3B8]">Seu login não está vinculado a uma ficha. Procure o P/1.</div>
        ) : (
          <MinhasFeriasPainel cartoes={cartoes} />
        )}
      </div>
    </AppShell>
  );
}
