import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  gerarOficioJmsDocx, gerarOficioJmsPdf, gerarGuiaJmsDocx, gerarGuiaJmsPdf,
  type Brasoes, type ModoAss, type OficioJmsInput, type GuiaJmsInput,
} from "@/lib/jmsExport";

export const dynamic = "force-dynamic";

/* /api/jms/exportar
   POST { tipo: "oficio" | "guia", fmt: "docx" | "pdf", dados } -> devolve o
   documento pronto para baixar.

   Mesma ideia da Escala de Serviço (/api/escala/docx e /api/escala/pdf): a
   tela manda os campos como estão na folha e o servidor monta o arquivo. Os
   brasões e a assinatura do Comandante NÃO vêm da tela — saem da mesma
   configuração que a escala usa, para o arquivo baixado ficar igual ao
   impresso mesmo se a página estiver desatualizada. */

const PADRAO_BRASOES: Brasoes = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};
const ASSINATURA_PADRAO = "/brasoes/assinatura-cmt.png";
const MODOS: ModoAss[] = ["imagem", "sigep", "gov", "branco"];

async function config(chave: string): Promise<any> {
  try {
    const row = await prisma.config.findUnique({ where: { chave } });
    return row?.valor ? JSON.parse(row.valor) : null;
  } catch { return null; }
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  // A aba Guia JMS e Ofício é do P/1; o arquivo sai com os dados do militar.
  if ((u.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Só o P/1 pode gerar este documento." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const tipo = b?.tipo === "guia" ? "guia" : "oficio";
    const fmt = b?.fmt === "pdf" ? "pdf" : "docx";
    const d = (b?.dados || {}) as Record<string, unknown>;

    const salvos = await config("escala_brasoes");
    const brasoes: Brasoes = { ...PADRAO_BRASOES, ...(salvos || {}) };
    const chefe = await config("escala_chefe_p1");
    const assinaturaCmt = texto(chefe?.cmtAssinatura) || ASSINATURA_PADRAO;
    const modoAss = MODOS.includes(d.modoAss as ModoAss) ? (d.modoAss as ModoAss) : "imagem";

    const comum = {
      numero: texto(d.numero), ano: texto(d.ano),
      comandante: texto(d.comandante), cargo: texto(d.cargo) || "CMT DO 18º BPM",
      modoAss, brasoes, assinaturaCmt,
    };

    let bytes: Buffer | Uint8Array;
    let nome: string;
    if (tipo === "oficio") {
      const dados: OficioJmsInput = {
        ...comum,
        dataDoc: texto(d.dataDoc), setor: texto(d.setor),
        de: texto(d.de), para: texto(d.para), assunto: texto(d.assunto),
        corpo: texto(d.corpo),
      };
      bytes = fmt === "pdf" ? await gerarOficioJmsPdf(dados) : await gerarOficioJmsDocx(dados);
      nome = `oficio-jms-${(dados.numero || "sn").replace(/\W+/g, "") || "sn"}-${dados.ano || ""}.${fmt}`;
    } else {
      const dados: GuiaJmsInput = {
        ...comum,
        dataVisita: texto(d.dataVisita),
        nome: texto(d.nome), grad: texto(d.grad), matricula: texto(d.matricula), idPm: texto(d.idPm),
        informacao: texto(d.informacao), cidadeParecer: texto(d.cidadeParecer),
      };
      bytes = fmt === "pdf" ? await gerarGuiaJmsPdf(dados) : await gerarGuiaJmsDocx(dados);
      nome = `guia-jms-${(dados.numero || "sn").replace(/\W+/g, "") || "sn"}-${dados.ano || ""}.${fmt}`;
    }

    return new NextResponse(bytes as any, {
      status: 200,
      headers: {
        "Content-Type": fmt === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (err) {
    console.error("[POST /api/jms/exportar]", err);
    return NextResponse.json({ error: "Falha ao gerar o arquivo." }, { status: 500 });
  }
}
