import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listar, criar, registrarRetorno, atualizar, remover, obter } from "@/lib/ccAcessoDb";
import { inativar, reativar } from "@/lib/inativos";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/centro-comando
   Controle de entrada e saída de policiais no Centro de Comando. Cada
   MOVIMENTAÇÃO é UMA LINHA na tabela cc_acesso (via lib ccAcessoDb) — dois
   admins não se sobrescrevem mais. O formato das respostas continua igual.
   GET ?ano=2026 -> { itens, anos }   POST -> nova saída (admin)
   PUT ?id=&acao=retorno|editar -> registra retorno / edita (admin)
   DELETE ?id= -> remove (admin)
   ========================================================================= */

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}
function s(v: any) { return String(v ?? "").trim(); }

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const ano = new URL(req.url).searchParams.get("ano") || "";
  try {
    const { itens, anos } = await listar(ano || undefined);
    return NextResponse.json({ itens, anos });
  } catch (err) {
    console.error("[GET /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao consultar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    if (!s(b.efetivoId) && !s(b.nome)) return NextResponse.json({ error: "Informe o policial" }, { status: 400 });
    const quem = String((session.user as any).name || (session.user as any).login || "—");
    const mov = await criar(b, quem);
    // Saída da unidade (transferência/reforma): oculta o militar de todos os
    // indicadores na hora (a ficha fica guardada; reversível). Chegada não mexe.
    if (mov.tipo === "saida" && mov.efetivoId) {
      try { await inativar(mov.efetivoId, { motivo: mov.motivo, destino: mov.destino, por: quem }); } catch (e) { console.error("[cc inativar]", e); }
    }
    return NextResponse.json({ ok: true, id: mov.id });
  } catch (err) {
    console.error("[POST /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const acao = sp.get("acao") || "editar";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    let ok: boolean;
    if (acao === "retorno") {
      const agora = new Date();
      const hora = s(b.horaEntrada) || `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
      const data = s(b.dataEntrada) || agora.toISOString().slice(0, 10);
      ok = await registrarRetorno(id, hora, data);
    } else {
      ok = await atualizar(id, b);
    }
    if (!ok) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    // Se era uma SAÍDA, reativa o militar (desfaz a ocultação) ao remover o registro.
    const alvo = await obter(id);
    await remover(id);
    if (alvo?.tipo === "saida" && alvo.efetivoId) {
      try { await reativar(alvo.efetivoId); } catch (e) { console.error("[cc reativar]", e); }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/centro-comando]", err);
    return NextResponse.json({ error: "Falha ao remover" }, { status: 500 });
  }
}
