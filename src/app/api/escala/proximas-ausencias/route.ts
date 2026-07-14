import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hojeLocal } from "@/lib/situacao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala/proximas-ausencias
   Avisa o ESCALANTE quem vai entrar de ferias / licenca-premio nos proximos
   dias, SOMENTE para quem esta lotado na SEDE do batalhao (as CIAs fazem as
   proprias escalas). Le o plano real (EquipeFerias / EquipeLicencaPremio).
   GET ?dias=15 -> { ausencias: [{ nome, lotacao, tipo, inicio, dias }] }
   ========================================================================= */

function parseData(v: string | null): Date | null {
  if (!v || !String(v).trim()) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function ehSede(lotacao: string | null): boolean {
  return !/\bcia\b|companhia/i.test(lotacao || "");
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const dias = Math.min(60, Math.max(1, Number(url.searchParams.get("dias")) || 15));
  const hoje = hojeLocal();
  const limite = new Date(hoje); limite.setDate(hoje.getDate() + dias);
  const ano = String(hoje.getFullYear());

  try {
    const [efetivo, eqFer, mbFer, eqLic, mbLic] = await Promise.all([
      prisma.efetivo.findMany({ select: { id: true, nome: true, nomeGuerra: true, postoGrad: true, lotacao: true } }),
      prisma.equipeFerias.findMany({ where: { anoGozo: ano } }),
      prisma.membroFerias.findMany({ where: { anoGozo: ano } }),
      prisma.equipeLicencaPremio.findMany({ where: { anoGozo: ano } }),
      prisma.membroLicencaPremio.findMany({ where: { anoGozo: ano } }),
    ]);

    const efMap = new Map(efetivo.map((e) => [e.id, e]));
    const diasAte = (d: Date) => Math.round((d.getTime() - hoje.getTime()) / 86400000);

    type Aus = { nome: string; lotacao: string; tipo: string; inicio: string; dias: number };
    const out: Aus[] = [];
    const jaTem = new Set<string>();

    const empurrar = (idPmma: string, inicio: Date | null, tipo: string) => {
      if (!inicio) return;
      if (inicio < hoje || inicio > limite) return; // so o que comeca daqui pra frente, dentro da janela
      const ef = efMap.get(idPmma);
      if (!ef || !ehSede(ef.lotacao)) return; // so SEDE
      const chave = `${idPmma}|${tipo}|${inicio.toISOString().slice(0, 10)}`;
      if (jaTem.has(chave)) return;
      jaTem.add(chave);
      out.push({
        nome: [ef.postoGrad, ef.nomeGuerra || ef.nome].filter(Boolean).join(" "),
        lotacao: ef.lotacao || "",
        tipo, inicio: inicio.toISOString().slice(0, 10), dias: diasAte(inicio),
      });
    };

    // Ferias: cada equipe pode ter 2 periodos
    const inicioFerias = new Map<string, Date[]>();
    for (const e of eqFer) {
      const arr: Date[] = [];
      const p1 = parseData(e.periodo1Inicio); if (p1) arr.push(p1);
      const p2 = parseData(e.periodo2Inicio); if (p2) arr.push(p2);
      if (arr.length) inicioFerias.set(e.numeroEquipe, arr);
    }
    for (const m of mbFer) for (const ini of inicioFerias.get(m.numeroEquipe) || []) empurrar(m.idPmma, ini, "Férias");

    // Licenca-premio: 1 periodo por equipe
    const inicioLic = new Map<string, Date>();
    for (const e of eqLic) { const i = parseData(e.periodoInicio); if (i) inicioLic.set(e.numeroEquipe, i); }
    for (const m of mbLic) empurrar(m.idPmma, inicioLic.get(m.numeroEquipe) || null, "Licença-Prêmio");

    out.sort((a, b) => a.dias - b.dias);
    return NextResponse.json({ ausencias: out, dias });
  } catch (err) {
    console.error("[GET /api/escala/proximas-ausencias]", err);
    return NextResponse.json({ ausencias: [] });
  }
}
