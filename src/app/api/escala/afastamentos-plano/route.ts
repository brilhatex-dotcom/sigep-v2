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

function addDiasISO(iso: string, n: number): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Deriva o FIM do período: usa o fim explícito; senão a apresentação menos 1
// dia (o militar volta na apresentação); senão assume 30 dias a partir do
// início. Assim, uma equipe com só a data de saída ainda remove o militar.
function fimPeriodo(inicio: string, fim: string, apres: string): string {
  if (fim) return fim;
  if (apres) return addDiasISO(apres, -1);
  if (inicio) return addDiasISO(inicio, 29);
  return "";
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const anoParam = url.searchParams.get("ano");
  const atual = new Date().getFullYear();
  const anos = anoParam ? [anoParam] : [String(atual - 1), String(atual), String(atual + 1)];

  // Cada fonte é lida de forma independente: se uma tabela falhar (ex.: LP ainda
  // não criada), as outras continuam funcionando.
  const q = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => { try { return await fn(); } catch { return []; } };

  try {
    const eqFer = await q(() => prisma.equipeFerias.findMany({ where: { anoGozo: { in: anos } } }));
    const mbFer = await q(() => prisma.membroFerias.findMany({ where: { anoGozo: { in: anos } } }));
    const eqLic = await q(() => prisma.equipeLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }));
    const mbLic = await q(() => prisma.membroLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }));

    const afast: { militar: string; tipo: string; inicio: string; fim: string }[] = [];

    // Férias — cada equipe pode ter 2 períodos. Guardamos o período por
    // "numeroEquipe|anoGozo" E por "numeroEquipe" (fallback), pois o membro nem
    // sempre traz o mesmo anoGozo da equipe.
    const perFer = new Map<string, { inicio: string; fim: string }[]>();
    for (const e of eqFer) {
      const arr: { inicio: string; fim: string }[] = [];
      const p1i = toISO(e.periodo1Inicio);
      if (p1i) arr.push({ inicio: p1i, fim: fimPeriodo(p1i, toISO(e.periodo1Fim), toISO(e.periodo1Apres)) });
      const p2i = toISO(e.periodo2Inicio);
      if (p2i) arr.push({ inicio: p2i, fim: fimPeriodo(p2i, toISO(e.periodo2Fim), toISO(e.periodo2Apres)) });
      if (arr.length) { perFer.set(`${e.numeroEquipe}|${e.anoGozo}`, arr); perFer.set(String(e.numeroEquipe), arr); }
    }
    for (const m of mbFer)
      for (const p of (perFer.get(`${m.numeroEquipe}|${m.anoGozo}`) || perFer.get(String(m.numeroEquipe)) || []))
        afast.push({ militar: m.idPmma, tipo: "ferias", inicio: p.inicio, fim: p.fim });

    // Licença-prêmio — um período por equipe.
    const perLic = new Map<string, { inicio: string; fim: string }>();
    for (const e of eqLic) {
      const i = toISO(e.periodoInicio);
      if (i) { const v = { inicio: i, fim: fimPeriodo(i, toISO(e.periodoFim), "") }; perLic.set(`${e.numeroEquipe}|${e.anoGozo}`, v); perLic.set(String(e.numeroEquipe), v); }
    }
    for (const m of mbLic) {
      const p = perLic.get(`${m.numeroEquipe}|${m.anoGozo}`) || perLic.get(String(m.numeroEquipe));
      if (p) afast.push({ militar: m.idPmma, tipo: "licenca_premio", inicio: p.inicio, fim: p.fim });
    }

    // Férias AVULSAS (datas soltas, Config "ferias_avulsas") — também removem.
    try {
      const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
      const lista = row?.valor ? JSON.parse(row.valor) : [];
      if (Array.isArray(lista)) {
        for (const a of lista) {
          const i = toISO(a?.inicio || null), f = toISO(a?.fim || null);
          if (a?.idPmma && i && f) afast.push({ militar: String(a.idPmma), tipo: "ferias", inicio: i, fim: f });
        }
      }
    } catch {}

    return NextResponse.json({
      afastamentos: afast,
      _debug: {
        anos,
        equipesFerias: eqFer.length,
        membrosFerias: mbFer.length,
        equipesLP: eqLic.length,
        membrosLP: mbLic.length,
        totalAfastamentos: afast.length,
        amostra: afast.slice(0, 8),
      },
    });
  } catch (err) {
    console.error("[GET afastamentos-plano]", err);
    return NextResponse.json({ afastamentos: [], _erro: String(err) });
  }
}
