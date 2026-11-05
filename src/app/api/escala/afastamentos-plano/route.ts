import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { montarAfastamentos } from "@/lib/afastamentosPlano";
import { ehAfastamento, SITUACOES_PADRAO, type SituacaoItem } from "@/lib/situacoesPadrao";
import { souAdmin } from "@/lib/guard";
import { lugarDoUsuario } from "@/lib/lugarUsuario";
import { CHAVE_BAIXADOS, lerMapaBaixados } from "@/lib/escalaBaixados";

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

   O JMS vem com tipo "jms" e NÃO tira da escala: o militar está pronto, com
   restrição, e só as telas internas o marcam. Quem foi baixado do serviço
   ativo (chave do P/1, /api/escala/baixados) vem com `baixado` e sai.
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
    // RAPIDEZ: as 8 leituras vão ao banco juntas (antes, uma atrás da outra)
    const lerJson = async (chave: string): Promise<unknown> => {
      try {
        const row = await prisma.config.findUnique({ where: { chave } });
        return row?.valor ? JSON.parse(row.valor) : null;
      } catch { return null; }
    };
    const [eqFer, mbFer, eqLic, mbLic, fichas, listaAvulsas, listaSituacoes, adiados, rowBaixados] = await Promise.all([
      q(() => prisma.equipeFerias.findMany({ where: { anoGozo: { in: anos } } })),
      q(() => prisma.membroFerias.findMany({ where: { anoGozo: { in: anos } } })),
      q(() => prisma.equipeLicencaPremio.findMany({ where: { anoGozo: { in: anos } } })),
      q(() => prisma.membroLicencaPremio.findMany({ where: { anoGozo: { in: anos } } })),
      // fichas: JMS com data (e a restrição) e a situação atual (Agregação, LTIP, Licença...)
      q(() => prisma.efetivo.findMany({
        select: { id: true, situacao: true, jmsDataInicio: true, jmsDataRetorno: true, jmsMotivo: true },
      })),
      // férias avulsas (datas soltas)
      lerJson("ferias_avulsas"),
      // lista de situações do admin (quais contam como afastamento)
      lerJson("situacoes"),
      idsFeriasAdiadas(),
      // a chave "Não escalar — baixado do serviço ativo"
      prisma.config.findUnique({ where: { chave: CHAVE_BAIXADOS } }).catch(() => null),
    ]);
    const avulsas: any[] = Array.isArray(listaAvulsas) ? listaAvulsas : [];
    const situacoes: SituacaoItem[] =
      Array.isArray(listaSituacoes) && listaSituacoes.length ? (listaSituacoes as SituacaoItem[]) : SITUACOES_PADRAO;

    /* A RESTRIÇÃO do JMS ("Motivo" da ficha) só vai para quem MONTA a escala
       (admin, ou o Cmt/sargenteante de um lugar — os mesmos que abrem as telas
       de escala). É texto livre e pode trazer dado de saúde; para os demais a
       lista sai só com "está em JMS", sem o motivo. */
    const u = session.user as any;
    const veRestricao = souAdmin(session) || !!(await lugarDoUsuario(u?.refEfetivo).catch(() => null));
    const fichasMotor = veRestricao ? fichas : (fichas as any[]).map(({ jmsMotivo: _m, ...f }) => f);

    const afastamentos = montarAfastamentos({
      equipesFerias: eqFer as any,
      membrosFerias: mbFer as any,
      equipesLicenca: eqLic as any,
      membrosLicenca: mbLic as any,
      avulsas,
      adiados,
      fichas: fichasMotor as any,
      situacaoAfasta: (s) => ehAfastamento(s, situacoes),
      hoje: hojeISO(),
      baixados: lerMapaBaixados(rowBaixados?.valor),
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
