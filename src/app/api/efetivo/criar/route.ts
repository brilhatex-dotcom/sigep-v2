import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Cria um novo militar. Apenas admin. O ID (ID PMMA) e obrigatorio e unico.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ erro: "Somente o administrador." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ erro: "Informe o ID PMMA (obrigatório)." }, { status: 400 });
    }

    const existe = await prisma.efetivo.findUnique({ where: { id } });
    if (existe) {
      return NextResponse.json({ erro: `Já existe militar com o ID ${id}.` }, { status: 409 });
    }

    const campos = [
      "postoGrad","numeroBarra","nome","nomeGuerra","cpf","matricula","rg","situacao",
      "lotacao","telefone","dataNasc","dataIncorp","dataPromocao","estadoCivil","email",
      "equipeFerias","funcao","status","sexo","endereco","bairro","cidade","cep",
      "naturalidade","naturalidadeUF","nomePai","nomeMae","tipoSanguineo","fatorRH",
      "quadro","grauEscolaridade","cursosPMMA","banco","agencia","conta","tipoConta",
      "possuiDependentes","emergenciaNome","emergenciaTelefone","emergenciaGrau",
      "cnh","cnhCategoria","cnhVencimento","fotoURL","observacoes",
      "jmsDataInicio","jmsDataRetorno","jmsMotivo",
    ];
    const dados: Record<string, string> = { id };
    for (const c of campos) {
      if (body[c] !== undefined && body[c] !== null && String(body[c]).trim() !== "") {
        dados[c] = String(body[c]);
      }
    }

    const novo = await prisma.efetivo.create({ data: dados });
    return NextResponse.json({ ok: true, id: novo.id }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Falha ao criar o militar." }, { status: 500 });
  }
}
