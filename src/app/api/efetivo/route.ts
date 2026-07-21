import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idsInativos, semInativos } from "@/lib/inativos";

export const dynamic = "force-dynamic";

/* =========================================================================
   GET /api/efetivo  ->  lista enxuta do efetivo para o seletor da Escala.
   Devolve so o que a escala precisa (id + campos do nome + situacao).
   Se voce JA tem uma rota que lista o efetivo com estes campos, pode
   apontar o fetch do EscalaClient/MapaClient para ela e descartar este
   arquivo. O formato esperado pelo cliente e: { efetivo: Militar[] }.

   ATENCAO a 2 imports que dependem do seu projeto:
   - "@/lib/auth"   -> onde estao seus authOptions (igual ao das pages).
   - "@/lib/prisma" -> onde voce instancia o PrismaClient. Se o seu for
     export default, troque por:  import prisma from "@/lib/prisma";
   ========================================================================= */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const linhas = await prisma.efetivo.findMany({
      select: {
        id: true,
        postoGrad: true,
        numeroBarra: true,
        dataPromocao: true,
        nome: true,
        nomeGuerra: true,
        matricula: true,
        rg: true,
        situacao: true,
        status: true,
        funcao: true,
        lotacao: true,
        quadro: true,
        cpf: true,
        telefone: true,
      },
    });

    // Remove os militares inativos (saíram da unidade) do seletor.
    const inativos = await idsInativos();
    const efetivo = semInativos(linhas, inativos).map((m) => ({
      id: m.id,
      postoGrad: m.postoGrad ?? "",
      numeroBarra: m.numeroBarra ?? "",
      dataPromocao: m.dataPromocao ?? "",
      nome: m.nome ?? "",
      nomeGuerra: m.nomeGuerra ?? "",
      matricula: m.matricula ?? "",
      rg: m.rg ?? "",
      situacao: m.situacao ?? "",
      status: m.status ?? "",
      funcao: m.funcao ?? "",
      lotacao: m.lotacao ?? "",
      quadro: m.quadro ?? "",
      cpf: m.cpf ?? "",
      telefone: m.telefone ?? "",
    }));

    return NextResponse.json({ efetivo });
  } catch (err) {
    console.error("[GET /api/efetivo]", err);
    return NextResponse.json({ error: "Falha ao consultar o efetivo" }, { status: 500 });
  }
}
