import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerPermutas } from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/* /api/permutas/notificacoes -> lista de notificacoes que exigem ACAO deste
   usuario (para o sininho): { notificacoes: [{ id, texto, em }] }.
   - policial: permutas aguardando a assinatura dele (como solicitado)
   - admin (P/1): permutas aguardando o parecer do P/1 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";

  try {
    const pedidos = await lerPermutas();
    const nots: { id: string; texto: string; em: string }[] = [];
    for (const p of pedidos) {
      if (meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado") {
        nots.push({
          id: "assinar:" + p.id,
          texto: `${p.solicitante.linha} pediu permuta com você — dia ${dBR(p.dataPermuta)}. Assine o "concordo".`,
          em: p.criadoEm,
        });
      } else if (admin && p.estado === "aguardando_p1") {
        nots.push({
          id: "p1:" + p.id,
          texto: `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o parecer do P/1.`,
          em: p.criadoEm,
        });
      }
    }
    nots.sort((a, b) => (b.em || "").localeCompare(a.em || ""));
    return NextResponse.json({ notificacoes: nots });
  } catch {
    return NextResponse.json({ notificacoes: [] });
  }
}
