import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerHistorico } from "@/lib/historicoDb";
import { normalizar, daFicha, VAZIO, type FichaHistorico } from "@/lib/historicoPolicial";
import { gerarHistoricoDocx, gerarHistoricoPdf } from "@/lib/historicoExport";

export const dynamic = "force-dynamic";

/* /api/historico/exportar?id=...&fmt=docx|pdf
   Monta o HISTÓRICO POLICIAL MILITAR no modelo do 18º BPM.

   O conteúdo vem do que está SALVO, não da tela: assim o arquivo baixado é
   sempre o histórico gravado, e não um rascunho que ficou aberto no
   navegador de alguém. */

const PADRAO_BRASOES = {
  pmma: "/brasoes/armas-ma.png",       // emblema da PMMA, à esquerda
  ma: "/brasao-estado-ma.png",         // armas do Estado, ao centro
  bpm: "/brasoes/brasao-18bpm.png",
};
const CONTATO = "TELEFAX: (99) 3663-3892 – 11ciapmma@gmail.com";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
async function config(chave: string): Promise<any> {
  try {
    const row = await prisma.config.findUnique({ where: { chave } });
    return row?.valor ? JSON.parse(row.valor) : null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const fmt = url.searchParams.get("fmt") === "pdf" ? "pdf" : "docx";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const f = await prisma.efetivo.findUnique({
      where: { id },
      select: {
        id: true, nome: true, nomeGuerra: true, postoGrad: true, numeroBarra: true, quadro: true,
        matricula: true, rg: true, cpf: true, dataNasc: true, dataIncorp: true, estadoCivil: true,
        naturalidade: true, naturalidadeUF: true, nomePai: true, nomeMae: true, tipoSanguineo: true,
        fatorRH: true, grauEscolaridade: true, funcao: true, lotacao: true,
      },
    });
    if (!f) return NextResponse.json({ error: "Militar não encontrado." }, { status: 404 });

    const linha = await lerHistorico(id);
    const dados = linha ? normalizar(JSON.parse(linha.dados || "{}")) : VAZIO;

    const brasoes = { ...PADRAO_BRASOES, ...((await config("escala_brasoes")) || {}) };
    const chefeCfg = await config("escala_chefe_p1");

    const entrada = {
      dados,
      ficha: daFicha(f as FichaHistorico),
      postoGrad: f.postoGrad || "",
      brasoes,
      chefe: (dados.chefe || chefeCfg?.nome || "").trim(),
      cargoChefe: (chefeCfg?.funcao || "CHEFE DO P/1 DO 18º BPM").trim(),
      dataDoc: dados.dataDoc || "",
      contato: CONTATO,
    };

    const bytes = fmt === "pdf" ? await gerarHistoricoPdf(entrada) : await gerarHistoricoDocx(entrada);
    const quem = (f.nomeGuerra || f.nome || "militar").trim().replace(/\W+/g, "_");
    return new NextResponse(bytes as any, {
      status: 200,
      headers: {
        "Content-Type": fmt === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="historico-${quem}.${fmt}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/historico/exportar]", err);
    return NextResponse.json({ error: "Falha ao gerar o histórico." }, { status: 500 });
  }
}
