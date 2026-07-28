import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/permutas
   Painel central de permutas. Reaproveita os dados que ja existem em cada dia
   da escala (tabela Config, chave "escala_dias"): cada vaga (Slot) guarda
   { titular, permuta (substituto), status }. Aqui a gente JUNTA todas as vagas
   com substituto num lugar so e deixa o admin aprovar/negar.
   GET  -> { permutas: Linha[] }
   POST -> { data, campo, idx, status } muda o status de UMA permuta (admin)
   ========================================================================= */

const CHAVE = "escala_dias";

// Campos de um dia da escala que carregam Slot(s). lista=true quando e um array.
const CAMPOS: { campo: string; label: string; lista: boolean }[] = [
  { campo: "cpuDeDia", label: "CPU de dia", lista: false },
  { campo: "rpAdjunto", label: "RP · Adjunto", lista: false },
  { campo: "rpMotorista", label: "RP · Motorista", lista: false },
  { campo: "rpPatrulheiro", label: "RP · Patrulheiro", lista: true },
  { campo: "ftGraduado", label: "FT · Graduado", lista: false },
  { campo: "ftMotorista", label: "FT · Motorista", lista: false },
  { campo: "ftPatrulheiro", label: "FT · Armeiro/Patrulheiro", lista: true },
  { campo: "guardaPermanente", label: "Permanência", lista: true },
  { campo: "inteligencia", label: "Inteligência", lista: true },
  { campo: "rotemMilitares", label: "ROTEM", lista: true },
];

type Slot = { titular?: string; permuta?: string | null; status?: string | null };
type Linha = {
  data: string; campo: string; idx: number; label: string;
  titular: string; substituto: string; status: string;
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

function temSubstituto(sl: Slot | null | undefined): boolean {
  return !!(sl && typeof sl.permuta === "string" && sl.permuta.trim() !== "");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const escalas: Record<string, any> = row?.valor ? safeParse(row.valor) : {};
    const permutas: Linha[] = [];

    for (const [data, esc] of Object.entries(escalas)) {
      if (!esc || typeof esc !== "object") continue;
      for (const { campo, label, lista } of CAMPOS) {
        const val = (esc as any)[campo];
        if (lista) {
          // ftPatrulheiro virou lista; dias salvos antigos podem ter Slot único.
          const arr: Slot[] = Array.isArray(val) ? val : (val && typeof val === "object" ? [val] : []);
          arr.forEach((sl, idx) => {
            if (temSubstituto(sl)) permutas.push(mkLinha(data, campo, idx, label, sl));
          });
        } else if (temSubstituto(val)) {
          permutas.push(mkLinha(data, campo, -1, label, val));
        }
      }
    }

    // Pendentes primeiro; depois por data.
    const peso = (s: string) => (s === "pendente" || s === "" ? 0 : s === "aprovada" ? 1 : 2);
    permutas.sort((a, b) => peso(a.status) - peso(b.status) || a.data.localeCompare(b.data));

    return NextResponse.json({ permutas });
  } catch (err) {
    console.error("[GET /api/permutas]", err);
    return NextResponse.json({ permutas: [] });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P1/admin pode aprovar permutas" }, { status: 403 });
  }

  try {
    const b = await req.json();
    const data = String(b?.data || "");
    const campo = String(b?.campo || "");
    const idx = Number.isInteger(b?.idx) ? b.idx : -1;
    const status = String(b?.status || "");
    const VALIDOS = ["pendente", "aprovada", "negada"];
    if (!data || !campo || !VALIDOS.includes(status)) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
    }
    if (!CAMPOS.some((c) => c.campo === campo)) {
      return NextResponse.json({ error: "Campo invalido" }, { status: 400 });
    }

    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const escalas: Record<string, any> = row?.valor ? safeParse(row.valor) : {};
    const dia = escalas[data];
    if (!dia) return NextResponse.json({ error: "Dia nao encontrado" }, { status: 404 });

    const campoVal = dia[campo];
    const alvo: Slot | undefined = idx >= 0
      ? (Array.isArray(campoVal) ? campoVal[idx] : (campoVal && typeof campoVal === "object" && idx === 0 ? campoVal : undefined))
      : campoVal;
    if (!temSubstituto(alvo)) {
      return NextResponse.json({ error: "Permuta nao encontrada" }, { status: 404 });
    }
    alvo!.status = status;

    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor: JSON.stringify(escalas) },
      create: { chave: CHAVE, valor: JSON.stringify(escalas), descricao: "Dias gerados/editados da Escala de Servico" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/permutas]", err);
    return NextResponse.json({ error: "Falha ao atualizar" }, { status: 500 });
  }
}

function mkLinha(data: string, campo: string, idx: number, label: string, sl: Slot): Linha {
  return {
    data, campo, idx, label,
    titular: (sl.titular || "").trim(),
    substituto: (sl.permuta || "").trim(),
    status: (sl.status || "pendente") as string,
  };
}

function safeParse(s: string): Record<string, any> {
  try { const o = JSON.parse(s); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
