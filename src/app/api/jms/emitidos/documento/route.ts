import { NextResponse } from "next/server";
import { nomeDocumento, disposicaoArquivo } from "@/lib/nomeArquivo";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarDocumentoJms, lerCopia, refazer, type RegistroJms } from "@/lib/jmsDocumento";

export const dynamic = "force-dynamic";

/* GET /api/jms/emitidos/documento?id=...&fmt=pdf|docx[&ver=1]

   Abre de novo um ofício ou uma guia da aba Emitidos.
   - Com cópia guardada (emitidos depois que o sistema passou a guardar):
     sai EXATAMENTE como foi emitido, com as edições feitas na folha.
   - Sem cópia (os mais antigos): a folha é refeita com o que o registro
     guardou — militar, número, datas — e o cadastro dele.
   ver=1 -> abre o PDF no navegador em vez de baixar. Só o P/1. */

type Oficio = { id: string; idPmma: string; nome: string; numero: string; ano: string; dataJms: string; criadoEm: string };
type Guia = { id: string; numero: number; ano: string; idPmma: string; nome: string; dataVisita: string; criadoEm: string };

async function lista<T>(chave: string): Promise<T[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave }, select: { valor: true } });
    const a = row?.valor ? JSON.parse(row.valor) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (((session.user as any).perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") || "");
  const fmt = url.searchParams.get("fmt") === "docx" ? "docx" : "pdf";
  const ver = url.searchParams.get("ver") === "1" && fmt === "pdf";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const [oficios, guias] = await Promise.all([lista<Oficio>("jms_oficios"), lista<Guia>("jms_guias")]);
    const o = oficios.find((x) => x.id === id);
    const g = o ? null : guias.find((x) => x.id === id);
    if (!o && !g) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });

    const registro: RegistroJms = o
      ? { tipo: "oficio", idPmma: o.idPmma, nome: o.nome, numero: o.numero || "", ano: o.ano || "", dataJms: o.dataJms || "", criadoEm: o.criadoEm || "" }
      : { tipo: "guia", idPmma: g!.idPmma, nome: g!.nome, numero: String(g!.numero).padStart(3, "0"), ano: g!.ano || "", dataJms: g!.dataVisita || "", criadoEm: g!.criadoEm || "" };

    const dados = (await lerCopia(id)) || (await refazer(registro));
    // o número da guia é o registrado, mesmo que a cópia diga outro
    if (registro.tipo === "guia") dados.numero = registro.numero;

    const { bytes, contentType } = await gerarDocumentoJms(registro.tipo, fmt, dados);

    // "Ofício JMS 097 2026 - 2º Sargento Arodo.pdf"
    const ficha = await prisma.efetivo.findUnique({
      where: { id: registro.idPmma },
      select: { postoGrad: true, nomeGuerra: true, nome: true },
    }).catch(() => null);
    const num = String(dados.numero || "").trim();
    const nome = nomeDocumento(
      `${registro.tipo === "oficio" ? "Ofício JMS" : "Guia de Encaminhamento JMS"}${num ? ` ${num}` : ""} ${registro.ano || ""}`.trim(),
      { postoGrad: ficha?.postoGrad, nomeGuerra: ficha?.nomeGuerra, nome: ficha?.nome || registro.nome },
    );

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposicaoArquivo(nome, fmt, ver),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/jms/emitidos/documento]", err);
    return NextResponse.json({ error: "Falha ao gerar o documento." }, { status: 500 });
  }
}
