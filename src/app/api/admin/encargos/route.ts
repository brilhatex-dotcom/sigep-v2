import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENCARGOS, lerEncargos, salvarEncargos, labelEncargo } from "@/lib/encargos";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

/* /api/admin/encargos
   GET  -> { opcoes, itens:[{efetivoId, encargo, label, nome}] }  (admin)
   POST { efetivoId, encargo }  -> define (encargo "" remove)      (admin) */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  const mapa = await lerEncargos();
  const ids = Object.keys(mapa);
  const fichas = ids.length
    ? await prisma.efetivo.findMany({ where: { id: { in: ids } }, select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true } })
    : [];
  const fMap = new Map(fichas.map((f) => [f.id, f]));
  const itens = ids.map((id) => {
    const f = fMap.get(id);
    const nome = f ? [f.postoGrad || "", (f.nomeGuerra || f.nome || "")].filter(Boolean).join(" ").trim() : id;
    return { efetivoId: id, encargo: mapa[id], label: labelEncargo(mapa[id]), nome, numeroBarra: f?.numeroBarra || "" };
  }).sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ opcoes: ENCARGOS, itens });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  try {
    const b = await req.json();
    const efetivoId = String(b?.efetivoId || "").trim();
    const encargo = String(b?.encargo || "").trim();
    if (!efetivoId) return NextResponse.json({ error: "Informe o militar" }, { status: 400 });
    if (encargo && !ENCARGOS.some((e) => e.id === encargo)) return NextResponse.json({ error: "Encargo inválido" }, { status: 400 });

    const mapa = await lerEncargos();
    if (encargo) mapa[efetivoId] = encargo;
    else delete mapa[efetivoId];
    await salvarEncargos(mapa);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/encargos]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
