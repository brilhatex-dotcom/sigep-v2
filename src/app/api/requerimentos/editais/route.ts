import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MODALIDADES_CURSOS } from "@/lib/requerimentos";

export const dynamic = "force-dynamic";

/* /api/requerimentos/editais
   Edital ATUAL de cada curso (CAS, CFS, CFC), configurado uma vez pelo admin.

   Quando o edital de um curso muda, o admin atualiza aqui e TODO requerimento
   NOVO daquele curso ja nasce com o texto certo (nome do curso, numero e data
   do edital) — os requerimentos ja enviados nao mudam, porque cada um guarda
   o texto que tinha no momento em que foi criado (nao referencia esta config).

   Cada curso tem o SEU PROPRIO edital, independente dos outros: atualizar o
   do CFS nao mexe no do CAS nem no do CFC.

   GET  -> { editais: { CAS, CFS, CFC } }     qualquer usuario logado
   PUT  { modalidade, sigla, nomeCompleto, numero, data } -> atualiza 1 (admin) */
const CHAVE = "requerimentos_editais_cursos";

type Edital = { sigla: string; nomeCompleto: string; numero: string; data: string };
type Editais = Record<string, Edital>;

const PADRAO: Editais = {
  CAS: { sigla: "CAS", nomeCompleto: "", numero: "", data: "" },
  CFS: { sigla: "CEFS", nomeCompleto: "CURSO ESPECIAL DE FORMAÇÃO DE SARGENTOS (CEFS)", numero: "", data: "" },
  CFC: { sigla: "CFC", nomeCompleto: "", numero: "", data: "" },
};

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function ler(v?: string | null): Editais {
  try {
    const o = v ? JSON.parse(v) : {};
    const out: Editais = { ...PADRAO };
    for (const m of MODALIDADES_CURSOS) {
      if (m === "OUTROS") continue;
      if (o && typeof o[m] === "object") out[m] = { ...PADRAO[m], ...o[m] };
    }
    return out;
  } catch {
    return PADRAO;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const editais = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  return NextResponse.json({ editais });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const modalidade = String(b?.modalidade || "").trim().toUpperCase();
    if (!MODALIDADES_CURSOS.includes(modalidade) || modalidade === "OUTROS") {
      return NextResponse.json({ error: "Curso inválido." }, { status: 400 });
    }
    const editais = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    editais[modalidade] = {
      sigla: String(b?.sigla || "").trim().toUpperCase() || editais[modalidade].sigla,
      nomeCompleto: String(b?.nomeCompleto || "").trim().toUpperCase(),
      numero: String(b?.numero || "").trim(),
      data: String(b?.data || "").trim(),
    };
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor: JSON.stringify(editais) },
      create: { chave: CHAVE, valor: JSON.stringify(editais), descricao: "Edital atual de cada curso (CAS/CFS/CFC)" },
    });
    return NextResponse.json({ ok: true, editais });
  } catch (err) {
    console.error("[PUT /api/requerimentos/editais]", err);
    return NextResponse.json({ error: "Falha ao salvar o edital" }, { status: 500 });
  }
}
