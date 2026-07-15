import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/centro-comando
   Controle de entrada e saída de policiais no Centro de Comando. Cada registro
   é uma MOVIMENTAÇÃO: o policial SAI (destino/motivo) e depois RETORNA (entrada).
   Guardado na tabela Config (chave "cc_acessos"), valendo em todos os PCs.
   GET ?ano=2026 -> { itens }   POST -> nova saída (admin)
   PUT ?id=&acao=retorno|editar -> registra retorno / edita (admin)
   DELETE ?id= -> remove (admin)
   ========================================================================= */

const CHAVE = "cc_acessos";

type Mov = {
  id: string; efetivoId: string; nome: string;
  data: string; horaSaida: string; destino: string; motivo: string;
  horaEntrada: string; dataEntrada: string; status: "fora" | "retornou";
  obs: string; registradoPor: string; criadoEm: string;
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}
function ler(valor?: string | null): Mov[] {
  try { const a = valor ? JSON.parse(valor) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Mov[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Controle de entrada e saida (Centro de Comando)" },
  });
}
function s(v: any) { return String(v ?? "").trim(); }
function normaliza(b: any, base?: Mov): Mov {
  return {
    id: base?.id || crypto.randomUUID(),
    efetivoId: s(b.efetivoId) || base?.efetivoId || "",
    nome: s(b.nome) || base?.nome || "",
    data: s(b.data) || base?.data || new Date().toISOString().slice(0, 10),
    horaSaida: s(b.horaSaida) || base?.horaSaida || "",
    destino: s(b.destino) || base?.destino || "",
    motivo: s(b.motivo) || base?.motivo || "",
    horaEntrada: b.horaEntrada !== undefined ? s(b.horaEntrada) : (base?.horaEntrada || ""),
    dataEntrada: b.dataEntrada !== undefined ? s(b.dataEntrada) : (base?.dataEntrada || ""),
    status: (b.status === "retornou" || b.status === "fora") ? b.status : (base?.status || "fora"),
    obs: b.obs !== undefined ? s(b.obs) : (base?.obs || ""),
    registradoPor: base?.registradoPor || "",
    criadoEm: base?.criadoEm || new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });

  const ano = new URL(req.url).searchParams.get("ano") || "";
  const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
  let itens = ler(row?.valor);
  if (ano) itens = itens.filter((m) => (m.data || "").slice(0, 4) === ano);
  // mais recentes primeiro (por data + hora de saída)
  itens.sort((a, b) => `${b.data} ${b.horaSaida}`.localeCompare(`${a.data} ${a.horaSaida}`));
  // anos disponíveis para o filtro
  const anos = Array.from(new Set(ler(row?.valor).map((m) => (m.data || "").slice(0, 4)).filter(Boolean))).sort().reverse();
  return NextResponse.json({ itens, anos });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    if (!s(b.efetivoId) && !s(b.nome)) return NextResponse.json({ error: "Informe o policial" }, { status: 400 });
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const mov = normaliza(b);
    mov.registradoPor = String((session.user as any).name || (session.user as any).login || "—");
    lista.unshift(mov);
    await salvar(lista);
    return NextResponse.json({ ok: true, id: mov.id });
  } catch (err) {
    console.error("[POST /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const acao = sp.get("acao") || "editar";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const i = lista.findIndex((m) => m.id === id);
    if (i < 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    if (acao === "retorno") {
      const agora = new Date();
      lista[i].horaEntrada = s(b.horaEntrada) || `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
      lista[i].dataEntrada = s(b.dataEntrada) || agora.toISOString().slice(0, 10);
      lista[i].status = "retornou";
    } else {
      lista[i] = normaliza(b, lista[i]);
    }
    await salvar(lista);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor).filter((m) => m.id !== id);
  await salvar(lista);
  return NextResponse.json({ ok: true });
}
