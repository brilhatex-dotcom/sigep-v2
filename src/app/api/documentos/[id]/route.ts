import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { TIPOS_DOCUMENTO } from "@/lib/documentosOficiais";
import { apagarDocumento, atualizarDocumento } from "@/lib/documentosOficiaisDb";

export const dynamic = "force-dynamic";

/* PATCH {tipo, numero, data, titulo, orgao, restrito} corrige a ficha do documento
   DELETE                                              tira do mural (e o PDF do R2)
   Só o admin. */
async function admin() {
  const session = await getServerSession(authOptions);
  return session?.user && (session.user.perfil ?? "").toLowerCase() === "admin";
}
const txt = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await admin())) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const tipo = txt(b?.tipo, 40);
  const data = txt(b?.data, 10);
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "Tipo e data são obrigatórios." }, { status: 400 });
  }
  try {
    const ok = await atualizarDocumento(params.id, {
      tipo, data, numero: txt(b?.numero, 30), titulo: txt(b?.titulo, 300), orgao: txt(b?.orgao, 80), restrito: b?.restrito === true,
    });
    if (!ok) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    await registrar({ acao: "documento_oficial_editar", alvo: params.id, detalhe: `Corrigiu a ficha de ${tipo} ${txt(b?.numero, 30)}` }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/documentos/[id]]", err);
    return NextResponse.json({ error: "Falha ao gravar." }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await admin())) return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  try {
    if (!(await apagarDocumento(params.id))) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    await registrar({ acao: "documento_oficial_apagar", alvo: params.id, detalhe: "Tirou um documento do mural" }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/documentos/[id]]", err);
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 503 });
  }
}
