import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cifrar, decifrar } from "@/lib/cripto";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* /api/diarias/credores
   As FICHAS DE CADASTRO DE CREDOR já feitas (aba Diárias), para o P/1 ver o
   que já saiu e abrir de novo.

   A ficha se monta a partir do cadastro, mas a auxiliar pode ajustar campos na
   folha antes de imprimir — então a cópia guarda a folha como SAIU. CPF e
   dados bancários ficam CIFRADOS na cópia, do mesmo jeito que no cadastro do
   efetivo.

   Imprimir de novo a ficha do mesmo militar no mesmo dia não cria linha nova
   (troca a cópia pela mais recente); em outro dia é outra ficha.

   GET            -> { itens }  (mais recentes primeiro)
   GET ?id=...    -> { nome, campos }  (a cópia, decifrada)
   POST { idPmma, nome, campos } -> registra a ficha impressa
   DELETE ?id=... -> tira da lista (e apaga a cópia) */

const CHAVE = "diarias_credores";
const chaveCopia = (id: string) => `diarias_credor_${id}`;
const CAMPOS = ["matricula", "cpf", "endereco", "bairro", "cidade", "telefone", "banco", "agencia", "conta"] as const;
const SENSIVEIS = new Set(["cpf", "banco", "agencia", "conta"]);

type Registro = { id: string; idPmma: string; nome: string; criadoEm: string; criadoPor: string; horario: string };

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
async function lerLista(): Promise<Registro[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE }, select: { valor: true } });
    const a = row?.valor ? JSON.parse(row.valor) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
async function salvarLista(v: Registro[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(v) },
    create: { chave: CHAVE, valor: JSON.stringify(v), descricao: "Fichas de cadastro de credor feitas (Diárias)" },
    select: { chave: true },
  });
}
const hojeISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function autorizado() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return { erro: NextResponse.json({ error: "Nao autorizado" }, { status: 401 }) };
  if (!ehAdmin(u.perfil)) return { erro: NextResponse.json({ error: "Apenas o P/1" }, { status: 403 }) };
  return { nome: String(u.name || "").trim() };
}

export async function GET(req: Request) {
  const a = await autorizado();
  if ("erro" in a) return a.erro;
  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    try {
      const row = await prisma.config.findUnique({ where: { chave: chaveCopia(id) }, select: { valor: true } });
      const v = row?.valor ? JSON.parse(row.valor) : null;
      if (!v) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
      const campos: Record<string, string> = {};
      for (const k of CAMPOS) {
        const x = typeof v.campos?.[k] === "string" ? v.campos[k] : "";
        campos[k] = SENSIVEIS.has(k) ? String(decifrar(x) ?? "") : x;
      }
      return NextResponse.json({ idPmma: v.idPmma || "", nome: v.nome || "", campos });
    } catch (err) {
      console.error("[GET /api/diarias/credores?id]", err);
      return NextResponse.json({ error: "Falha ao abrir a ficha" }, { status: 500 });
    }
  }

  const lista = await lerLista();
  /* Posto e nome de guerra ATUAIS, para o P/1 reconhecer a pessoa hoje (o
     nome gravado é o da folha, com posto da época). */
  const ids = Array.from(new Set(lista.map((r) => r.idPmma).filter(Boolean)));
  const fichas = new Map<string, { postoGrad: string; nome: string }>();
  if (ids.length) {
    try {
      const efs = await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
      });
      for (const e of efs) fichas.set(e.id, { postoGrad: e.postoGrad || "", nome: (e.nomeGuerra || e.nome || "").trim() });
    } catch { /* sem ficha: usa o nome gravado */ }
  }
  const itens = lista
    .map((r) => ({
      id: r.id, idPmma: r.idPmma,
      postoGrad: fichas.get(r.idPmma)?.postoGrad || "",
      nome: fichas.get(r.idPmma)?.nome || r.nome || "",
      criadoEm: r.criadoEm, horario: r.horario || "", criadoPor: r.criadoPor || "",
    }))
    .sort((x, y) => `${y.criadoEm}${y.horario}`.localeCompare(`${x.criadoEm}${x.horario}`));
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  const a = await autorizado();
  if ("erro" in a) return a.erro;
  try {
    const b = await req.json().catch(() => ({}));
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
    const nome = String(b?.nome || "").trim().slice(0, 300);
    const campos: Record<string, string> = {};
    for (const k of CAMPOS) {
      const v = typeof b?.campos?.[k] === "string" ? b.campos[k].trim().slice(0, 300) : "";
      campos[k] = SENSIVEIS.has(k) && v ? String(cifrar(v) ?? "") : v;
    }

    const hoje = hojeISO();
    const horario = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const lista = await lerLista();
    let r = lista.find((x) => x.idPmma === idPmma && x.criadoEm === hoje);
    if (r) { r.nome = nome; r.horario = horario; r.criadoPor = a.nome; }
    else { r = { id: crypto.randomUUID(), idPmma, nome, criadoEm: hoje, horario, criadoPor: a.nome }; lista.push(r); }
    await salvarLista(lista);

    const valor = JSON.stringify({ idPmma, nome, campos, em: new Date().toISOString() });
    await prisma.config.upsert({
      where: { chave: chaveCopia(r.id) },
      update: { valor },
      create: { chave: chaveCopia(r.id), valor, descricao: "Cópia da ficha de cadastro de credor" },
      select: { chave: true },
    });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (err) {
    console.error("[POST /api/diarias/credores]", err);
    return NextResponse.json({ error: "Falha ao registrar a ficha" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const a = await autorizado();
  if ("erro" in a) return a.erro;
  const id = String(new URL(req.url).searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    const lista = await lerLista();
    const resto = lista.filter((r) => r.id !== id);
    if (resto.length === lista.length) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
    await salvarLista(resto);
    try { await prisma.config.deleteMany({ where: { chave: chaveCopia(id) } }); } catch { /* sem cópia */ }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/diarias/credores]", err);
    return NextResponse.json({ error: "Falha ao apagar" }, { status: 500 });
  }
}
