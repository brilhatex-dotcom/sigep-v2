import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerPermutas } from "@/lib/permutaPedidos";
import { podeComoEncargo, podeVerP1 } from "@/lib/encargos";

export const dynamic = "force-dynamic";

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/* /api/permutas/notificacoes -> notificacoes que exigem ACAO deste usuario
   (para o sininho): { notificacoes: [{ id, texto, em }] }.
   - policial: permutas aguardando a assinatura dele (como solicitado)
   - Chefe do P/1 (Silas): permutas aguardando o PARECER
   - Subcmt (Frans): permutas aguardando o VISTO (parecer nao favoravel) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notificacoes: [] });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = (session.user.perfil ?? "").toLowerCase() === "admin";

  try {
    const podeP1 = await podeComoEncargo(meuId, "chefe_p1", admin); // pode assinar
    const veP1 = await podeVerP1(meuId, admin);                     // Chefe + Auxiliares
    const podeSub = await podeComoEncargo(meuId, "subcmt", admin);
    const pedidos = await lerPermutas();
    const nots: { id: string; texto: string; em: string }[] = [];
    for (const p of pedidos) {
      if (meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado") {
        nots.push({
          id: "assinar:" + p.id,
          texto: `${p.solicitante.linha} pediu permuta com você — dia ${dBR(p.dataPermuta)}. Assine o "concordo".`,
          em: p.criadoEm,
        });
      } else if (veP1 && p.estado === "aguardando_p1") {
        // Chefe do P/1 assina; auxiliares recebem para acompanhar (não assinam).
        nots.push({
          id: "p1:" + p.id,
          texto: podeP1
            ? `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu parecer (Chefe do P/1).`
            : `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} para acompanhamento do P/1 (o parecer é do Chefe).`,
          em: p.criadoEm,
        });
      } else if (meuId && (p.solicitanteId === meuId || p.solicitadoId === meuId) && (p.estado === "autorizada" || p.estado === "nao_autorizada")
                 && !(p.solicitanteId === meuId ? p.cienciaSolicitante : p.cienciaSolicitado)) {
        // decisão saiu: avisa o policial e pede a ciência (some ao dar ciência)
        nots.push({
          id: "ciencia:" + p.id,
          texto: `Sua permuta (${p.protocolo || ""}) foi ${p.estado === "autorizada" ? "AUTORIZADA" : "NÃO autorizada"}. Toque para dar ciência da decisão.`,
          em: p.p1Em || p.criadoEm,
        });
      } else if (podeSub && p.estado === "aguardando_subcmt") {
        nots.push({
          id: "subcmt:" + p.id,
          texto: `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu visto (Subcomandante).`,
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
