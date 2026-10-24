import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { periodoAtivo } from "@/lib/promocoes";
import { conferirMilitar } from "@/lib/conferenciaCertidoesDb";

export const dynamic = "force-dynamic";
// leitura de até nove PDFs de uma vez
export const maxDuration = 60;

/* POST /api/promocoes/conferencia { efetivoId }
   Confere as certidões de UM militar (ver lib/conferenciaCertidoes.ts) e
   guarda o resultado. Um por chamada: o painel do P/1 passa a lista um a um,
   mostrando o andamento, em vez de uma chamada só que estouraria o tempo da
   função com quarenta militares. Só o P/1 (admin), como o resto do painel. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Apenas o P/1." }, { status: 403 });
  }
  const periodo = await periodoAtivo();
  if (!periodo) return NextResponse.json({ error: "Nenhum período de promoção aberto." }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const efetivoId = String(b?.efetivoId || "").trim();
  if (!efetivoId) return NextResponse.json({ error: "Sem o militar." }, { status: 400 });

  try {
    const r = await conferirMilitar(periodo.id, efetivoId);
    if (!r) return NextResponse.json({ error: "Este militar não tem certidão no período." }, { status: 400 });
    return NextResponse.json({ ok: true, conferencia: r });
  } catch (err) {
    console.error("[POST /api/promocoes/conferencia]", err);
    return NextResponse.json({ error: "Falha ao conferir as certidões." }, { status: 503 });
  }
}
