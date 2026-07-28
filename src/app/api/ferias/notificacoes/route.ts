import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/ferias/notificacoes
   Para o sininho:
   - ADMIN (P/1 e auxiliares): memorandos que o militar já assinou e estão
     aguardando a assinatura da seção.
   - MILITAR: aviso de que o seu memorando foi assinado pela seção.
   Mesmo formato das permutas: { notificacoes: [{ id, texto, em, href }] } */

export async function GET() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ notificacoes: [] });

  const admin = (u.perfil || "").toLowerCase() === "admin";
  const meuId = u.refEfetivo as string | undefined;

  try {
    // assinaturas dos memorandos (tabela criada pelo módulo de assinatura)
    const linhas: any[] = await prisma.$queryRawUnsafe(
      `SELECT tipo, ref, papel, nome, em FROM assinatura_sigep
        WHERE tipo IN ('memorando_ferias','memorando_lp')
        ORDER BY em DESC LIMIT 400`
    );
    if (!linhas.length) return NextResponse.json({ notificacoes: [] });

    // agrupa por documento
    type Doc = { tipo: string; ref: string; militar?: any; chefe?: any };
    const doc = new Map<string, Doc>();
    for (const l of linhas) {
      const k = l.tipo + "|" + l.ref;
      const d: Doc = doc.get(k) || { tipo: String(l.tipo), ref: String(l.ref) };
      if (l.papel === "militar") { if (!d.militar) d.militar = l; }
      else if (!d.chefe) d.chefe = l;
      doc.set(k, d);
    }

    const nots: { id: string; texto: string; em: string; href: string }[] = [];

    if (admin) {
      // esperando a seção assinar
      const pendentes = [...doc.values()].filter((d) => d.militar && !d.chefe);
      for (const d of pendentes) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo:" + d.tipo + ":" + d.ref,
          texto: `${d.militar.nome} assinou o memorando de ${oQue}. Aguardando a assinatura da seção.`,
          em: new Date(d.militar.em).toISOString(),
          href: "/ferias",
        });
      }
    }

    if (meuId) {
      // meu memorando ficou pronto
      const meus = [...doc.values()].filter((d) => d.ref.startsWith(meuId + ":") && d.chefe);
      for (const d of meus) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo-ok:" + d.tipo + ":" + d.ref,
          texto: `Seu memorando de ${oQue} foi assinado por ${d.chefe.nome}. Já pode baixar.`,
          em: new Date(d.chefe.em).toISOString(),
          href: "/minhas-ferias",
        });
      }
    }

    nots.sort((a, b) => b.em.localeCompare(a.em));
    return NextResponse.json({ notificacoes: nots.slice(0, 40) });
  } catch {
    // tabela de assinaturas ainda não criada — o sino simplesmente não mostra
    return NextResponse.json({ notificacoes: [] });
  }
}
