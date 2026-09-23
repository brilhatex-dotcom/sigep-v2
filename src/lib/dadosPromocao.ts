import { prisma } from "@/lib/prisma";

/* =========================================================================
   DADOS PARA PROMOÇÃO — seção própria na ficha de cada praça.

   São as colunas da Planilha Padrão que não têm casa em outro lugar do
   sistema: o BG de cada promoção, os cursos de carreira com a nota, elogios,
   medalhas, ficha conceito. Antes, isso só existia na planilha que o P/1
   refazia à mão a cada ciclo. Agora fica NA FICHA: preenche-se uma vez (ou
   vem da planilha de agosto/2026, importada), e toda promoção puxa daqui.

   Tabela criada em runtime (o deploy não roda `db push`), um registro por
   militar, com os campos num JSON — somar um campo novo amanhã não exige
   migração.
   ========================================================================= */

export type CampoPromocao = { chave: string; rotulo: string; dica?: string; grupo: "promoções" | "cursos" | "outros" };

// As chaves são as MESMAS das colunas da Planilha Padrão (src/lib/planilhaPadrao.ts).
export const CAMPOS_PROMOCAO: CampoPromocao[] = [
  { chave: "promCabo", rotulo: "Promoção a Cabo", dica: "data e BG — ex.: 17/06/2019 BG nº 150 de 09/08/2019", grupo: "promoções" },
  { chave: "prom3", rotulo: "Promoção a 3º Sgt", dica: "data e BG", grupo: "promoções" },
  { chave: "prom2", rotulo: "Promoção a 2º Sgt", dica: "data e BG", grupo: "promoções" },
  { chave: "prom1", rotulo: "Promoção a 1º Sgt", dica: "data e BG", grupo: "promoções" },
  { chave: "cefc", rotulo: "CEFC", dica: "SIM/ nota, NÃO ou S/A", grupo: "cursos" },
  { chave: "cefs", rotulo: "CEFS", dica: "SIM/ nota, NÃO ou S/A", grupo: "cursos" },
  { chave: "cap", rotulo: "CAP / CAS", dica: "SIM/ nota, NÃO ou S/A", grupo: "cursos" },
  { chave: "eap", rotulo: "EAP", dica: "SIM, NÃO ou S/A", grupo: "cursos" },
  { chave: "cursos", rotulo: "Cursos (≥150h)", dica: "nome e carga horária, ou S/A", grupo: "cursos" },
  { chave: "elogios", rotulo: "Elogios (quantidade)", dica: "número ou S/A", grupo: "outros" },
  { chave: "medalhas", rotulo: "Medalhas / título (quantidade)", dica: "número ou S/A", grupo: "outros" },
  { chave: "conceito", rotulo: "Ficha conceito", dica: "MB, B, E...", grupo: "outros" },
  { chave: "comport", rotulo: "Comportamento", dica: "vale o do histórico, se houver", grupo: "outros" },
  { chave: "qpmp", rotulo: "QPMP", dica: "0 = combatente", grupo: "outros" },
];
const CHAVES = new Set(CAMPOS_PROMOCAO.map((c) => c.chave));

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS efetivo_dados_promocao (
        efetivo_id text PRIMARY KEY,
        dados text NOT NULL DEFAULT '{}',
        fonte text,
        atualizado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_por text
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

const lerJson = (v: unknown): Record<string, string> => {
  try {
    const o = JSON.parse(String(v || "{}"));
    const out: Record<string, string> = {};
    if (o && typeof o === "object") for (const [k, val] of Object.entries(o)) if (CHAVES.has(k) && typeof val === "string" && val.trim()) out[k] = val;
    return out;
  } catch { return {}; }
};

export type RegistroPromocao = { dados: Record<string, string>; fonte: string | null; atualizadoEm: string | null; atualizadoPor: string | null };

export async function lerDadosPromocao(efetivoId: string): Promise<RegistroPromocao> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT dados, fonte, atualizado_em, atualizado_por FROM efetivo_dados_promocao WHERE efetivo_id = $1`, efetivoId);
  const r = rows[0];
  return r
    ? { dados: lerJson(r.dados), fonte: r.fonte || null, atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).toISOString() : null, atualizadoPor: r.atualizado_por || null }
    : { dados: {}, fonte: null, atualizadoEm: null, atualizadoPor: null };
}

export async function lerTodosDadosPromocao(): Promise<Map<string, Record<string, string>>> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT efetivo_id, dados FROM efetivo_dados_promocao`);
  return new Map(rows.map((r) => [String(r.efetivo_id), lerJson(r.dados)]));
}

/* Grava os dados de um ou mais militares.
     modo "tudo"      -> o que veio substitui (a edição na ficha: campo
                         apagado lá fica apagado aqui);
     modo "completar" -> só entra onde o campo está vazio (importação que
                         não pode passar por cima do que o P/1 já acertou);
     modo "atualizar" -> o que veio substitui campo a campo, o resto fica
                         (importação de uma planilha mais nova). */
export async function salvarDadosPromocao(
  itens: { efetivoId: string; dados: Record<string, string> }[],
  modo: "tudo" | "completar" | "atualizar", fonte: string, por: string,
): Promise<number> {
  await garantir();
  const atuais = modo === "tudo" ? new Map<string, Record<string, string>>() : await lerTodosDadosPromocao();
  let mudou = 0;
  for (const it of itens) {
    const limpo: Record<string, string> = {};
    for (const [k, v] of Object.entries(it.dados)) if (CHAVES.has(k) && typeof v === "string" && v.trim()) limpo[k] = v.trim().slice(0, 300);
    const antes = atuais.get(it.efetivoId) || {};
    const dados = modo === "tudo" ? limpo : modo === "completar" ? { ...limpo, ...antes } : { ...antes, ...limpo };
    if (modo !== "tudo" && JSON.stringify(dados) === JSON.stringify(antes)) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO efetivo_dados_promocao (efetivo_id, dados, fonte, atualizado_em, atualizado_por)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (efetivo_id) DO UPDATE
         SET dados = EXCLUDED.dados, fonte = EXCLUDED.fonte,
             atualizado_em = CURRENT_TIMESTAMP, atualizado_por = EXCLUDED.atualizado_por`,
      it.efetivoId, JSON.stringify(dados), fonte.slice(0, 200), por);
    mudou++;
  }
  return mudou;
}
