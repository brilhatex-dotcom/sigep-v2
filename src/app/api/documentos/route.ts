import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { TIPOS_DOCUMENTO } from "@/lib/documentosOficiais";
import { buscarDocumentos, criarDocumento } from "@/lib/documentosOficiaisDb";

export const dynamic = "force-dynamic";
// lê o texto do PDF (um BG pode ter centenas de páginas)
export const maxDuration = 60;

/* =========================================================================
   /api/documentos — o mural de documentos oficiais (BG, portaria, edital...)
   GET  ?q=&tipo=&ano=&bg=   lista/busca; o restrito só o admin vê
   POST {chave, nomeArquivo, tamanho, tipo, numero, data, titulo, orgao, restrito}
        o admin registra o PDF que acabou de subir (ver /api/documentos/upload)
   ========================================================================= */

const txt = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";
  const u = new URL(req.url).searchParams;
  try {
    const documentos = await buscarDocumentos({
      q: txt(u.get("q"), 120), tipo: txt(u.get("tipo"), 40), ano: txt(u.get("ano"), 4).replace(/\D/g, ""),
      bg: txt(u.get("bg"), 10).replace(/\D/g, ""), admin,
    });
    return NextResponse.json({ documentos }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/documentos]", err);
    return NextResponse.json({ error: "Falha ao buscar os documentos." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const chave = txt(b?.chave, 200);
  // só a chave que o upload deste mural gerou (não aponta para arquivo de outro módulo)
  if (!/^documentos\/[0-9a-f-]{36}\.pdf$/.test(chave)) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  }
  const tipo = txt(b?.tipo, 40);
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) {
    return NextResponse.json({ error: "Escolha o tipo do documento." }, { status: 400 });
  }
  const data = txt(b?.data, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Informe a data do documento." }, { status: 400 });
  const numero = txt(b?.numero, 30);
  const titulo = txt(b?.titulo, 300);
  if (!numero && !titulo) return NextResponse.json({ error: "Informe o número ou o assunto." }, { status: 400 });

  try {
    const login = String((session.user as any).login || session.user.name || "");
    const doc = await criarDocumento({
      tipo, numero, data, titulo, orgao: txt(b?.orgao, 80), restrito: b?.restrito === true,
      chave, nomeArquivo: txt(b?.nomeArquivo, 200), tamanho: Number(b?.tamanho) || 0, enviadoPor: login,
    });
    await registrar({
      acao: "documento_oficial_enviar", alvo: doc.id, alvoNome: `${tipo} ${numero}`.trim(),
      detalhe: `Pôs no mural: ${tipo}${numero ? ` nº ${numero}` : ""} de ${data}${titulo ? ` — ${titulo.slice(0, 80)}` : ""}${doc.restrito ? " (restrito)" : ""}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, documento: doc });
  } catch (err) {
    console.error("[POST /api/documentos]", err);
    return NextResponse.json({ error: "Falha ao guardar o documento." }, { status: 503 });
  }
}
