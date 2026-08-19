import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { montarAfastamentos } from "@/lib/afastamentosPlano";
import { ehAfastamento, SITUACOES_PADRAO, type SituacaoItem } from "@/lib/situacoesPadrao";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala/afastamentos-plano
   Devolve TODOS os afastamentos conhecidos já no formato do motor da escala:
     { afastamentos: [{ militar, tipo, inicio, fim }] }   (datas em ISO)

   Assim o motor (mapa mensal, diária e todas as abas) tira da escala quem
   está ausente, sem o escalante precisar cadastrar à mão.

   Fontes: plano de férias, plano de licença-prêmio, férias avulsas, JMS com
   data na ficha, e a situação da ficha que conta como afastamento
   (Agregação, LTIP, Licença, Reserva...). A regra de montagem fica em
   src/lib/afastamentosPlano.ts, para poder ser testada sem banco.
   ========================================================================= */

function hojeISO(): string {
  // fuso do Batalhão: o "hoje" tem que ser o de Bacabal, não o do servidor
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date()); // aaaa-mm-dd
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const anoParam = url.searchParams.get("ano");
  const atual = new Date().getFullYear();
  const anos = anoParam ? [anoParam] : [String(atual - 1), String(atual), String(atual + 1)];

  // Cada fonte é lida de forma independente: se uma tabela falhar (ex.: LP ainda
  // não criada), as outras continuam funcionando.
  const q = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => { try { return await fn(); } catch { return []; } };

  try {
    const eqFer = await q(() => prisma.equipeFerias.findMany({ where: { anoGozo: { in: anos } } }));
    const mbFer = await q(() => prisma.membroFerias.findMany({ where: { anoGozo: { in: anos } } }));
    const eqLic = await q(() => prisma.equipeLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }));
    const mbLic = await q(() => prisma.membroLicencaPremio.findMany({ where: { anoGozo: { in: anos } } }));

    // fichas: JMS com data e a situação atual (Agregação, LTIP, Licença...)
    const fichas = await q(() => prisma.efetivo.findMany({
      select: { id: true, situacao: true, jmsDataInicio: true, jmsDataRetorno: true },
    }));

    // férias avulsas (datas soltas)
    let avulsas: any[] = [];
    try {
      const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
      const lista = row?.valor ? JSON.parse(row.valor) : [];
      if (Array.isArray(lista)) avulsas = lista;
    } catch {}

    // lista de situações do admin (quais contam como afastamento)
    let situacoes: SituacaoItem[] = SITUACOES_PADRAO;
    try {
      const row = await prisma.config.findUnique({ where: { chave: "situacoes" } });
      const parsed = row?.valor ? JSON.parse(row.valor) : null;
      if (Array.isArray(parsed) && parsed.length) situacoes = parsed as SituacaoItem[];
    } catch {}

    const adiados = await idsFeriasAdiadas();

    const afastamentos = montarAfastamentos({
      equipesFerias: eqFer as any,
      membrosFerias: mbFer as any,
      equipesLicenca: eqLic as any,
      membrosLicenca: mbLic as any,
      avulsas,
      adiados,
      fichas: fichas as any,
      situacaoAfasta: (s) => ehAfastamento(s, situacoes),
      hoje: hojeISO(),
    });

    return NextResponse.json({
      afastamentos,
      _debug: {
        anos,
        equipesFerias: eqFer.length,
        membrosFerias: mbFer.length,
        equipesLP: eqLic.length,
        membrosLP: mbLic.length,
        fichas: fichas.length,
        totalAfastamentos: afastamentos.length,
        porTipo: afastamentos.reduce<Record<string, number>>((acc, a) => {
          acc[a.tipo] = (acc[a.tipo] || 0) + 1; return acc;
        }, {}),
        amostra: afastamentos.slice(0, 8),
      },
    });
  } catch (err) {
    console.error("[GET afastamentos-plano]", err);
    return NextResponse.json({ afastamentos: [], _erro: String(err) });
  }
}
