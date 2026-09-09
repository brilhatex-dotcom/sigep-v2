import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { assinaturas } from "@/lib/escalaVersao";
import { aplicarPermutasSeVencido } from "@/lib/permutaPedidos";
import { todasNotificacoes } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/pulso — O RELÓGIO ÚNICO DO SISTEMA

   Antes cada canto da tela tinha o seu próprio relógio batendo no servidor:
   a escala de 15 em 15s, o sino de 60 em 60s (com QUATRO chamadas de uma
   vez), o chat de 6 em 6s. Cada um chegava na sua hora, então o sino podia
   estar 50 segundos atrás da escala — e cada aba aberta repetia tudo isso.

   Agora é uma batida só, e apenas a aba LÍDER a executa (ver lib/sincronia):
   ela pergunta, recebe, e reparte com as outras abas na hora, de graça.

   DOIS NÍVEIS, de propósito — porque nem tudo custa o mesmo:

   - RÁPIDO (padrão, de 2 em 2s): só as assinaturas da escala. Uma consulta
     indexada, ~70 bytes. Pode bater nesse ritmo à vontade.
   - COMPLETO (?notif=1, de 60 em 60s): traz também as notificações do sino,
     que precisam varrer permutas, auditoria, chat e assinaturas. Caro, e
     ninguém precisa disso de 2 em 2 segundos.

   Juntar os dois num tique só faria o barato pagar o preço do caro — que é
   exatamente o problema que este arquivo existe para resolver.
   ========================================================================= */

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const comNotif = url.searchParams.get("notif") === "1";

  /* Escopo da escala: admin na sede, ou o lugar do Cmt/Sargenteante. Quem não
     tem escala nenhuma (policial comum) simplesmente não recebe esta parte. */
  const ctx = await chaveEscopada(req, "escala_dias");

  const [escala, notificacoes] = await Promise.all([
    (async () => {
      if (!ctx) return null;
      /* As permutas autorizadas entram na escala aqui, no máximo uma vez por
         minuto (o freio está em aplicarPermutasSeVencido). Quando entram, a
         assinatura muda sozinha e todas as abas puxam a escala nova. */
      if (ctx.escopo === null) {
        try { await aplicarPermutasSeVencido(); } catch { /* nao bloqueia */ }
      }
      const chaveCad = ctx.escopo ? `escala_cadastro__${ctx.escopo}` : "escala_cadastro";
      try {
        const a = await assinaturas(ctx.chave, chaveCad);
        return { dias: a[ctx.chave] ?? "", cad: a[chaveCad] ?? "" };
      } catch { return null; }
    })(),
    comNotif ? todasNotificacoes(session.user as any).catch(() => []) : Promise.resolve(null),
  ]);

  /* escala: null significa "não consegui/não se aplica" — nunca assinatura
     vazia, que a tela leria como "mudou" e baixaria tudo de novo. */
  return NextResponse.json({ escala, ...(comNotif ? { notificacoes } : {}) });
}
