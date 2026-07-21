import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala/afastamentos-plano
   Devolve os períodos de FÉRIAS e LICENÇA-PRÊMIO do PLANO (equipes/membros)
   já no formato de afastamento do motor da escala:
     { afastamentos: [{ militar, tipo, inicio, fim }] }   (datas em ISO)
   Assim o motor da escala (mapa, diária e todas as abas) REMOVE/pula quem
   está de férias/LP naquele dia — sem o escalante precisar cadastrar à mão.
   ========================================================================= */

function toISO(v: string | null): string {
  if (!v) return "";
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const anoParam = url.searchParams.get("ano");
  const atual = new Date().getFullYear();
  const anos = anoParam ? [anoParam] : [String(atual - 1), String(atual), String(atual + 1)];

  try {
    const [eqFer, mbFer, eqLic, mbLic] = await Promise.all([
      prisma.equipeFerias.findMany({ where: { anoGozo: { in: anos } } }),
      prisma.membroFerias.findMany({ where: { anoGozo: { in: anos } } }),
      prisma.equipeLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }),
      prisma.membroLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }),
    ]);

    const afast: { militar: string; tipo: string; inicio: string; fim: string }[] = [];

    // Férias — cada equipe pode ter 2 períodos.
    const perFer = new Map<string, { inicio: string; fim: string }[]>();
    for (const e of eqFer) {
      const arr: { inicio: string; fim: string }[] = [];
      const p1i = toISO(e.periodo1Inicio), p1f = toISO(e.periodo1Fim);
      if (p1i && p1f) arr.push({ inicio: p1i, fim: p1f });
      const p2i = toISO(e.periodo2Inicio), p2f = toISO(e.periodo2Fim);
      if (p2i && p2f) arr.push({ inicio: p2i, fim: p2f });
      perFer.set(`${e.numeroEquipe}|${e.anoGozo}`, arr);
    }
    for (const m of mbFer)
      for (const p of perFer.get(`${m.numeroEquipe}|${m.anoGozo}`) || [])
        afast.push({ militar: m.idPmma, tipo: "ferias", inicio: p.inicio, fim: p.fim });

    // Licença-prêmio — um período por equipe.
    const perLic = new Map<string, { inicio: string; fim: string }>();
    for (const e of eqLic) {
      const i = toISO(e.periodoInicio), f = toISO(e.periodoFim);
      if (i && f) perLic.set(`${e.numeroEquipe}|${e.anoGozo}`, { inicio: i, fim: f });
    }
    for (const m of mbLic) {
      const p = perLic.get(`${m.numeroEquipe}|${m.anoGozo}`);
      if (p) afast.push({ militar: m.idPmma, tipo: "licenca_premio", inicio: p.inicio, fim: p.fim });
    }

    return NextResponse.json({ afastamentos: afast });
  } catch (err) {
    console.error("[GET afastamentos-plano]", err);
    return NextResponse.json({ afastamentos: [] });
  }
}
