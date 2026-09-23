import { prisma } from "@/lib/prisma";
import { idsInativos, semInativos } from "@/lib/inativos";
import { compararAntiguidade } from "@/lib/antiguidade";
import { garantirHistorico } from "@/lib/historicoDb";
import { garantirPromocoes } from "@/lib/promocaoDb";
import { normalizar, type DadosHistorico } from "@/lib/historicoPolicial";
import { lerMapaP1 } from "@/lib/promocaoStatusP1";
import { lerTodosDadosPromocao } from "@/lib/dadosPromocao";
import {
  COLUNAS, entraNaPlanilha, montarLinha, type LinhaPlanilha, type PromocaoLancada,
} from "@/lib/planilhaPadrao";

/* =========================================================================
   Planilha Padrão — o que o P/1 escreve por cima, e a montagem com o banco.

   Tabela criada em runtime (o deploy não roda `db push`), uma linha por
   militar por período de promoção: cada ciclo tem a sua planilha, e o que o
   P/1 corrigiu em dezembro não pode vazar para o ciclo de junho.

   Só se grava o que o P/1 ESCREVEU. Tudo o que o sistema calcula (ficha,
   histórico, certidões) é recalculado a cada abertura — assim, quando uma
   certidão nova chega ou o histórico é corrigido, a planilha já sai
   atualizada sem ninguém precisar "sincronizar" nada.
   ========================================================================= */

let pronto: Promise<void> | null = null;

function garantir(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS promocao_planilha (
          periodo_id text NOT NULL,
          efetivo_id text NOT NULL,
          dados text NOT NULL DEFAULT '{}',
          atualizado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          atualizado_por text,
          CONSTRAINT promocao_planilha_pkey PRIMARY KEY (periodo_id, efetivo_id)
        )`);
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

const lerJson = (v: unknown): Record<string, string> => {
  try {
    const o = JSON.parse(String(v || "{}"));
    const out: Record<string, string> = {};
    if (o && typeof o === "object") for (const [k, val] of Object.entries(o)) if (typeof val === "string") out[k] = val;
    return out;
  } catch { return {}; }
};

export async function lerManuais(periodoId: string): Promise<Map<string, Record<string, string>>> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT efetivo_id, dados FROM promocao_planilha WHERE periodo_id = $1`, periodoId);
  return new Map(rows.map((r) => [String(r.efetivo_id), lerJson(r.dados)]));
}

// Colunas que o P/1 pode escrever: todas, menos as de identidade.
export const colunaEditavel = (chave: string) =>
  COLUNAS.some((c) => c.chave === chave && !c.identidade);

/* Grava (ou apaga) o que o P/1 escreveu numa célula.
   `valor === null` devolve a célula ao cálculo automático — é diferente de
   gravar texto vazio, que é o P/1 dizendo "aqui fica em branco mesmo". */
export async function salvarManual(
  periodoId: string, efetivoId: string, chave: string, valor: string | null, por: string,
): Promise<Record<string, string>> {
  await garantir();
  const atual = (await lerManuais(periodoId)).get(efetivoId) || {};
  if (valor === null) delete atual[chave];
  else atual[chave] = valor.slice(0, 500);
  await prisma.$executeRawUnsafe(
    `INSERT INTO promocao_planilha (periodo_id, efetivo_id, dados, atualizado_em, atualizado_por)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
     ON CONFLICT (periodo_id, efetivo_id) DO UPDATE
       SET dados = EXCLUDED.dados, atualizado_em = CURRENT_TIMESTAMP, atualizado_por = EXCLUDED.atualizado_por`,
    periodoId, efetivoId, JSON.stringify(atual), por);
  return atual;
}

/* Preenche de uma vez a mesma coluna de vários militares (ex.: FICHA
   CONCEITO "MB" ou ELOGIOS "S/A" para quem ainda está em branco). Uma leitura
   só do que já existe, e uma gravação por militar. */
export async function salvarEmLote(
  periodoId: string, efetivoIds: string[], chave: string, valor: string, por: string,
): Promise<number> {
  await garantir();
  const todos = await lerManuais(periodoId);
  for (const id of efetivoIds) {
    const atual = { ...(todos.get(id) || {}), [chave]: valor.slice(0, 500) };
    await prisma.$executeRawUnsafe(
      `INSERT INTO promocao_planilha (periodo_id, efetivo_id, dados, atualizado_em, atualizado_por)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (periodo_id, efetivo_id) DO UPDATE
         SET dados = EXCLUDED.dados, atualizado_em = CURRENT_TIMESTAMP, atualizado_por = EXCLUDED.atualizado_por`,
      periodoId, id, JSON.stringify(atual), por);
  }
  return efetivoIds.length;
}

export type LinhaComNome = LinhaPlanilha & { rotulo: string };

/* Monta a planilha do período, JÁ na ordem de antiguidade.

   Quem entra: quem já mandou documentação no período — ao menos uma
   certidão, ou o envio ao P/1. A planilha vai se alimentando conforme as
   certidões chegam, e o P/1 faz o crivo em cima dela (a coluna de
   pendências diz o que falta de cada um). Quem nunca mandou nada não
   aparece: não concorre.


   Poucas consultas, todas em lote: o efetivo, os históricos, as promoções
   lançadas, as certidões do período e o que o P/1 escreveu. Nada de uma ida
   ao banco por militar — são duzentas linhas. */
export async function carregarPlanilha(periodoId: string): Promise<LinhaComNome[]> {
  const efetivo = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true,
        grauEscolaridade: true, dataIncorp: true, dataPromocao: true, situacao: true, status: true,
      },
    }),
    await idsInativos(),
  )
    .filter((m) => entraNaPlanilha(m.postoGrad))
    .sort(compararAntiguidade);

  const historicos = new Map<string, DadosHistorico>();
  try {
    await garantirHistorico();
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT "efetivo_id", "dados" FROM "historico_policial"`);
    for (const r of rows) {
      try { historicos.set(String(r.efetivo_id), normalizar(JSON.parse(r.dados || "{}"))); } catch { /* ignora */ }
    }
  } catch (e) { console.error("[planilha] historicos", e); }

  const promocoes = new Map<string, PromocaoLancada[]>();
  try {
    await garantirPromocoes();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT "Efetivo_ID" AS id, "Posto_Novo" AS "postoNovo", "Data_Promocao" AS "dataPromocao", "Referencia" AS referencia
         FROM "promocoes_lancadas" WHERE "Desfeito_Em" IS NULL ORDER BY "Data_Promocao"`);
    for (const r of rows) {
      const k = String(r.id);
      if (!promocoes.has(k)) promocoes.set(k, []);
      promocoes.get(k)!.push({ postoNovo: r.postoNovo, dataPromocao: r.dataPromocao, referencia: r.referencia });
    }
  } catch (e) { console.error("[planilha] promocoes lancadas", e); }

  const participantes = await prisma.participantePromocao.findMany({
    where: { periodoId },
    select: { efetivoId: true, certidoes: { select: { ordem: true } } },
  });
  const enviadas = new Map(participantes.map((p) => [p.efetivoId, p.certidoes.map((c) => c.ordem)]));
  const statusP1 = await lerMapaP1();
  const manuais = await lerManuais(periodoId);
  const dadosPromocao = await lerTodosDadosPromocao();
  const mandou = (id: string) =>
    (enviadas.get(id)?.length || 0) > 0 || !!statusP1[`${periodoId}:${id}`]?.enviadoEm;

  return efetivo.filter((m) => mandou(m.id)).map((m) => {
    const st = statusP1[`${periodoId}:${m.id}`] || {};
    const linha = montarLinha({
      ficha: m,
      historico: historicos.get(m.id) || null,
      promocoes: promocoes.get(m.id) || [],
      certidoes: {
        enviadas: enviadas.get(m.id) || [],
        recebidoPeloP1: !!st.recebidoEm,
        enviadoAoP1: !!st.enviadoEm,
      },
      manual: manuais.get(m.id) || {},
      dadosPromocao: dadosPromocao.get(m.id) || {},
    });
    return { ...linha, rotulo: [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ") };
  });
}
