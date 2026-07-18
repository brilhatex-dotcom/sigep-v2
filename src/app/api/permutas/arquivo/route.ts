import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerPermutas } from "@/lib/permutaPedidos";
import { tokenPermuta } from "@/lib/permutaVerif";
import { LUGARES_COMANDO } from "@/lib/encargos";
import { acharNo, pertenceAoNo } from "@/lib/organograma";

export const dynamic = "force-dynamic";

/* /api/permutas/arquivo — ARQUIVO de permutas organizado POR LUGAR (admin).
   Junta todas as permutas (sede + localidades) e resolve o lugar de cada uma
   pela lotação do SOLICITANTE. Devolve tudo o que a tela precisa para listar,
   buscar, abrir e baixar (o visualizador já faz PDF/Word). */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

// Lugar (mais específico) de uma lotação: pelotão > CIA > Sede.
const SEDE = { id: "sede", rotulo: "Sede — 18º BPM (Presidente Dutra)" };
function localDaLotacao(lotacao: string | null): { id: string; rotulo: string } {
  const matches = LUGARES_COMANDO.filter((l) => {
    const no = acharNo(l.id);
    return no && pertenceAoNo(lotacao || "", no);
  });
  if (!matches.length) return SEDE;
  matches.sort((a, b) => b.id.length - a.id.length); // pelotão (id maior) antes da CIA
  return { id: matches[0].id, rotulo: matches[0].rotulo };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  const permutas = await lerPermutas();
  // lotação de cada solicitante (uma consulta só)
  const ids = Array.from(new Set(permutas.map((p) => p.solicitanteId).filter(Boolean)));
  const fichas = ids.length
    ? await prisma.efetivo.findMany({ where: { id: { in: ids } }, select: { id: true, lotacao: true } })
    : [];
  const lotDe = new Map(fichas.map((f) => [f.id, f.lotacao]));

  const lista = permutas.map((p) => {
    const local = localDaLotacao(lotDe.get(p.solicitanteId) ?? null);
    return {
      id: p.id,
      protocolo: p.protocolo || "",
      verifToken: tokenPermuta(p),
      localId: local.id,
      localRotulo: local.rotulo,
      lotacao: lotDe.get(p.solicitanteId) || "",
      solicitante: p.solicitante,
      solicitadoNome: p.solicitadoNome,
      solicitado: p.solicitado,
      dataPermuta: p.dataPermuta,
      dataRetorno: p.dataRetorno,
      motivo: p.motivo,
      estado: p.estado,
      parecerP1: p.parecerP1,
      p1Nome: p.p1Nome,
      p1Cargo: p.p1Cargo,
      p1Em: p.p1Em,
      visto: p.visto,
      criadoEm: (p as any).criadoEm || p.solicitante?.em || "",
    };
  });

  // lugares presentes (para os grupos), sede sempre primeiro
  const mapLocais = new Map<string, string>();
  for (const it of lista) mapLocais.set(it.localId, it.localRotulo);
  const locais = [{ id: SEDE.id, rotulo: SEDE.rotulo }, ...LUGARES_COMANDO
    .filter((l) => mapLocais.has(l.id))
    .map((l) => ({ id: l.id, rotulo: l.rotulo }))]
    .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i && (l.id === SEDE.id ? lista.some((x) => x.localId === SEDE.id) : true));

  return NextResponse.json({ locais, permutas: lista });
}
