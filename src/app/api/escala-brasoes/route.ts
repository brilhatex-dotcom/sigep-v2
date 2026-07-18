import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada } from "@/lib/escalaEscopo";

export const dynamic = "force-dynamic";

/* /api/escala-brasoes — brasões da Escala Diária (clicáveis, sincronizados).
   Padrão do 18º BPM: esquerda 190 anos PMMA · centro Governo do Estado (armas
   do MA) · direita 18º BPM. Guardado na Config "escala_brasoes" (data URL ou
   caminho public), então trocar um brasão reflete em todos os computadores. */
const CHAVE = "escala_brasoes";
const PADRAO = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  try {
    const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
    if (!row?.valor) return NextResponse.json({ brasoes: PADRAO });
    const v = JSON.parse(row.valor);
    return NextResponse.json({
      brasoes: {
        pmma: typeof v.pmma === "string" && v.pmma ? v.pmma : PADRAO.pmma,
        ma: typeof v.ma === "string" && v.ma ? v.ma : PADRAO.ma,
        bpm: typeof v.bpm === "string" && v.bpm ? v.bpm : PADRAO.bpm,
      },
    });
  } catch {
    return NextResponse.json({ brasoes: PADRAO });
  }
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  try {
    const b = await req.json();
    const br = b?.brasoes || {};
    const valor = JSON.stringify({
      pmma: String(br.pmma || PADRAO.pmma),
      ma: String(br.ma || PADRAO.ma),
      bpm: String(br.bpm || PADRAO.bpm),
    });
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Brasoes da Escala Diaria" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-brasoes]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
