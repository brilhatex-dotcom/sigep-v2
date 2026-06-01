// ==========================================================
//  /api/efetivo/[id]  — Fase 4
//  GET    -> le um militar
//  PUT    -> atualiza (com TRAVA de permissao no servidor)
//  DELETE -> remove (somente admin)
//
//  Regra:
//   - admin     : edita TODOS os campos (pessoais + funcionais)
//   - policial  : edita SO os campos pessoais, e SO na propria
//                 ficha (session.refEfetivo === id)
//   - demais    : 403
//
//  A trava vale aqui no servidor: mesmo que o navegador mande
//  um campo proibido, ele e descartado pela lista de permitidos.
// ==========================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CAMPOS_PESSOAIS = [
  "cpf", "rg", "dataNasc", "sexo", "estadoCivil", "naturalidade",
  "naturalidadeUF", "nomePai", "nomeMae", "tipoSanguineo", "fatorRH",
  "grauEscolaridade", "cursosPMMA", "telefone", "email", "endereco",
  "bairro", "cidade", "cep", "banco", "agencia", "conta", "tipoConta",
  "possuiDependentes", "emergenciaNome", "emergenciaTelefone",
  "emergenciaGrau", "cnh", "cnhCategoria", "cnhVencimento",
];

const CAMPOS_FUNCIONAIS = [
  "nome", "nomeGuerra", "postoGrad", "numeroBarra", "matricula", "quadro",
  "funcao", "lotacao", "situacao", "status", "dataIncorp", "dataPromocao",
  "equipeFerias", "jmsDataInicio", "jmsDataRetorno", "jmsMotivo",
  "observacoes", "fotoURL",
];

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil ?? "").toLowerCase() === "admin";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }
  const id = decodeURIComponent(params.id);
  const m = await prisma.efetivo.findUnique({ where: { id } });
  if (!m) return NextResponse.json({ erro: "Nao encontrado" }, { status: 404 });
  return NextResponse.json(m);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  const alvo = await prisma.efetivo.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!alvo) {
    return NextResponse.json({ erro: "Nao encontrado" }, { status: 404 });
  }

  const admin = ehAdmin(session.user.perfil);
  const dono = session.user.refEfetivo === id;

  let permitidos: string[];
  if (admin) {
    permitidos = [...CAMPOS_PESSOAIS, ...CAMPOS_FUNCIONAIS];
  } else if (dono) {
    permitidos = CAMPOS_PESSOAIS;
  } else {
    return NextResponse.json(
      { erro: "Você não tem permissão para editar esta ficha." },
      { status: 403 }
    );
  }

  try {
    const corpo = await req.json();
    const data: Record<string, string | null> = {};
    for (const campo of permitidos) {
      if (campo in corpo) {
        const v = corpo[campo];
        data[campo] = v === undefined || v === "" ? null : String(v);
      }
    }
    // carimbo de atualizacao
    data.ultimaAtualizacao = new Date().toISOString();

    const atualizado = await prisma.efetivo.update({ where: { id }, data });
    return NextResponse.json(atualizado);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { erro: "Não foi possível salvar." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  }
  if (!ehAdmin(session.user.perfil)) {
    return NextResponse.json(
      { erro: "Somente o administrador pode excluir." },
      { status: 403 }
    );
  }
  const id = decodeURIComponent(params.id);
  try {
    await prisma.efetivo.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { erro: "Não foi possível excluir." },
      { status: 400 }
    );
  }
}
