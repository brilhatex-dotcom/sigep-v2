import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/foto/ajuste — posicionamento da foto no circulo (zoom + deslocamento).
   Guardado na Config "foto_ajustes": { [efetivoId]: { zoom, x, y } }.
   GET ?efetivoId= -> { ajuste }    POST { efetivoId, zoom, x, y } -> salva.
   admin: qualquer um; policial: so a propria. */

const CHAVE = "foto_ajustes";
type Ajuste = { zoom: number; x: number; y: number };
const PADRAO: Ajuste = { zoom: 1, x: 0, y: 0 };

function ehAdmin(perfil?: string | null): boolean { return (perfil || "").toLowerCase() === "admin"; }

async function ler(): Promise<Record<string, Ajuste>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const o = row?.valor ? JSON.parse(row.valor) : {};
    return o && typeof o === "object" ? o : {};
  } catch { return {}; }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ ajuste: PADRAO });
  const { searchParams } = new URL(req.url);
  const efetivoId = String(searchParams.get("efetivoId") || (session.user as any).refEfetivo || "");
  if (!efetivoId) return NextResponse.json({ ajuste: PADRAO });
  const mapa = await ler();
  return NextResponse.json({ ajuste: mapa[efetivoId] || PADRAO });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const admin = ehAdmin((session.user as any).perfil);
  const meu = (session.user as any).refEfetivo as string | undefined;

  try {
    const b = await req.json().catch(() => ({}));
    const efetivoId = String(b?.efetivoId || "");
    if (!efetivoId) return NextResponse.json({ error: "Informe o militar" }, { status: 400 });
    if (!admin && efetivoId !== meu) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

    const zoom = Math.min(4, Math.max(1, Number(b?.zoom) || 1));
    const x = Math.min(100, Math.max(-100, Number(b?.x) || 0));
    const y = Math.min(100, Math.max(-100, Number(b?.y) || 0));

    const mapa = await ler();
    mapa[efetivoId] = { zoom, x, y };
    const valor = JSON.stringify(mapa);
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Ajuste (zoom/posicao) da foto de perfil no circulo" },
    });
    return NextResponse.json({ ok: true, ajuste: mapa[efetivoId] });
  } catch (err) {
    console.error("[POST /api/foto/ajuste]", err);
    return NextResponse.json({ error: "Falha ao salvar o ajuste" }, { status: 500 });
  }
}
