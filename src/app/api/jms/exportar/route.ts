import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarDocumentoJms } from "@/lib/jmsDocumento";

export const dynamic = "force-dynamic";

/* /api/jms/exportar
   POST { tipo: "oficio" | "guia", fmt: "docx" | "pdf", dados } -> devolve o
   documento pronto para baixar.

   Mesma ideia da Escala de Serviço (/api/escala/docx e /api/escala/pdf): a
   tela manda os campos como estão na folha e o servidor monta o arquivo. Os
   brasões e a assinatura do Comandante NÃO vêm da tela — saem da mesma
   configuração que a escala usa (ver lib/jmsDocumento), para o arquivo
   baixado ficar igual ao impresso mesmo se a página estiver desatualizada. */

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

    const { bytes, contentType } = await gerarDocumentoJms(tipo, fmt, d);
    const numero = typeof d.numero === "string" ? d.numero : "";
    const ano = typeof d.ano === "string" ? d.ano : "";
    const nome = `${tipo === "oficio" ? "oficio" : "guia"}-jms-${(numero || "sn").replace(/\W+/g, "") || "sn"}-${ano}.${fmt}`;

    return new NextResponse(bytes as any, {
      status: 200,
      headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${nome}"` },
    });
  } catch (err) {
    console.error("[POST /api/jms/exportar]", err);
    return NextResponse.json({ error: "Falha ao gerar o arquivo." }, { status: 500 });
  }
}
