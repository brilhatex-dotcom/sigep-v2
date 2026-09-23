import { prisma } from "@/lib/prisma";
import { idsInativos, semInativos } from "@/lib/inativos";
import { compararAntiguidade } from "@/lib/antiguidade";
import { garantirHistorico } from "@/lib/historicoDb";
import { garantirPromocoes } from "@/lib/promocaoDb";
import { normalizar, type DadosHistorico } from "@/lib/historicoPolicial";
import { lerMapaP1 } from "@/lib/promocaoStatusP1";
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
      // o que veio da planilha de um ciclo anterior: por MILITAR, não por período
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS planilha_referencia (
          efetivo_id text PRIMARY KEY,
          dados text NOT NULL DEFAULT '{}',
          fonte text,
          importado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          importado_por text
        )`);
      // quem está dentro do Limite Quantitativo do período (art. 2º, I, e art. 5º)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS promocao_limite (
          periodo_id text NOT NULL,
          efetivo_id text NOT NULL,
          incluido_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          incluido_por text,
          CONSTRAINT promocao_limite_pkey PRIMARY KEY (periodo_id, efetivo_id)
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

/* ---------------------------------------------------- planilha anterior */

export async function lerReferencias(): Promise<Map<string, Record<string, string>>> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT efetivo_id, dados FROM planilha_referencia`);
  return new Map(rows.map((r) => [String(r.efetivo_id), lerJson(r.dados)]));
}

/* Grava a referência de cada militar. O que veio agora substitui o que havia
   coluna por coluna (uma planilha nova de dezembro corrige a de agosto), mas
   coluna que a planilha nova não trouxe fica como estava. */
export async function salvarReferencias(
  itens: { efetivoId: string; dados: Record<string, string> }[], fonte: string, por: string,
): Promise<void> {
  await garantir();
  const atuais = await lerReferencias();
  for (const it of itens) {
    const dados = { ...(atuais.get(it.efetivoId) || {}), ...it.dados };
    await prisma.$executeRawUnsafe(
      `INSERT INTO planilha_referencia (efetivo_id, dados, fonte, importado_em, importado_por)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (efetivo_id) DO UPDATE
         SET dados = EXCLUDED.dados, fonte = EXCLUDED.fonte,
             importado_em = CURRENT_TIMESTAMP, importado_por = EXCLUDED.importado_por`,
      it.efetivoId, JSON.stringify(dados), fonte.slice(0, 200), por);
  }
}

/* --------------------------------------------------- limite quantitativo */

/* Quem está dentro do limite no período. Conjunto VAZIO = o P/1 ainda não
   definiu o limite, e a planilha mostra todo o efetivo de Sd a 1º Sgt. */
export async function lerLimite(periodoId: string): Promise<Set<string>> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT efetivo_id FROM promocao_limite WHERE periodo_id = $1`, periodoId);
  return new Set(rows.map((r) => String(r.efetivo_id)));
}

export async function marcarLimite(periodoId: string, efetivoIds: string[], dentro: boolean, por: string): Promise<void> {
  await garantir();
  if (!efetivoIds.length) return;
  // uma consulta só para a lista inteira: na primeira marcação são 200 militares
  if (dentro) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO promocao_limite (periodo_id, efetivo_id, incluido_em, incluido_por)
       SELECT $1, x, CURRENT_TIMESTAMP, $3 FROM unnest($2::text[]) AS x
       ON CONFLICT (periodo_id, efetivo_id) DO NOTHING`,
      periodoId, efetivoIds, por);
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM promocao_limite WHERE periodo_id = $1 AND efetivo_id = ANY($2::text[])`,
      periodoId, efetivoIds);
  }
}

export type LinhaComNome = LinhaPlanilha & { rotulo: string; dentroDoLimite: boolean };

/* Monta a planilha inteira do período, JÁ na ordem de antiguidade.

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
  const referencias = await lerReferencias();
  const limite = await lerLimite(periodoId);

  return efetivo.map((m) => {
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
      referencia: referencias.get(m.id) || {},
    });
    return {
      ...linha,
      rotulo: [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" "),
      // limite ainda não definido: todo mundo conta
      dentroDoLimite: limite.size === 0 || limite.has(m.id),
    };
  });
}
