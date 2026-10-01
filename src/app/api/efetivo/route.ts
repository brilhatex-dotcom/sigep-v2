import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idsInativos, semInativos } from "@/lib/inativos";
import { cabecalhosVersao, respostaNaoMudou } from "@/lib/escalaVersao";

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

/* Versão da lista: md5 calculado NO BANCO sobre os mesmos campos que a rota
   devolve, mais quem está inativo. A Escala e o Mapa baixam esta lista a cada
   abertura; com a versão como ETag, o navegador reusa a que já tem quando
   nada mudou (304) — e a lista nem sai do banco. */
async function versaoDoEfetivo(inativos: Set<string>): Promise<string | null> {
  try {
    const r = await prisma.$queryRaw<{ h: string | null }[]>`
      SELECT md5(COALESCE(string_agg(concat(
        "ID", '|', "Posto_Grad", '|', "Numero_Barra", '|', "DataPromocao", '|', "Nome", '|',
        "NomeGuerra", '|', "Matricula", '|', "RG", '|', "Situacao", '|', "Status", '|',
        "Funcao", '|', "Lotacao", '|', "Quadro", '|', "CPF", '|', "Telefone"
      ), E'\\n' ORDER BY "ID"), '')) AS h
      FROM efetivo`;
    const base = r[0]?.h || "";
    return crypto.createHash("md5").update(base + "|" + Array.from(inativos).sort().join(",")).digest("hex");
  } catch {
    return null; // sem versão: responde a lista inteira, como antes
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const inativos = await idsInativos();
    const versao = await versaoDoEfetivo(inativos);
    if (versao && (req.headers.get("if-none-match") || "").includes(versao)) return respostaNaoMudou(versao);

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

    return NextResponse.json({ efetivo }, versao ? { headers: cabecalhosVersao(versao) } : undefined);
  } catch (err) {
    console.error("[GET /api/efetivo]", err);
    return NextResponse.json({ error: "Falha ao consultar o efetivo" }, { status: 500 });
  }
}
