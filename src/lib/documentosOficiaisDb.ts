import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { baixarDoR2, removerDoR2 } from "@/lib/r2";
import { normalizarBusca, numeroSemZeros, type DocumentoOficial } from "@/lib/documentosOficiais";

/* =========================================================================
   O mural de documentos oficiais no banco (tabela criada em runtime — o
   deploy não roda `db push`).

   O PDF fica no R2 (sobe direto do navegador, como as certidões); aqui fica
   a ficha dele e o TEXTO, já sem acento e em caixa alta, para a busca achar
   "promocao" em "PROMOÇÃO". PDF de imagem (escaneado) entra sem texto: acha
   pelo número e pelo título.
   ========================================================================= */

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS documentos_oficiais (
        id text PRIMARY KEY,
        tipo text NOT NULL,
        numero text NOT NULL DEFAULT '',
        numero_norm text NOT NULL DEFAULT '',
        data text NOT NULL DEFAULT '',
        titulo text NOT NULL DEFAULT '',
        orgao text NOT NULL DEFAULT '',
        restrito boolean NOT NULL DEFAULT false,
        r2_key text NOT NULL,
        nome_arquivo text NOT NULL DEFAULT '',
        tamanho integer NOT NULL DEFAULT 0,
        tem_texto boolean NOT NULL DEFAULT false,
        busca text NOT NULL DEFAULT '',
        enviado_por text NOT NULL DEFAULT '',
        enviado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      .then(async () => {
        /* Índice de trigramas: com centenas de BGs, o "contém a palavra" sem
           índice leria todo o texto a cada busca. Se o banco não deixar criar,
           a busca funciona do mesmo jeito, só que mais devagar. */
        try {
          await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS documentos_oficiais_busca_trgm ON documentos_oficiais USING gin (busca gin_trgm_ops)`);
        } catch (e) { console.error("[documentos] índice de busca", e); }
      })
      .catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

// texto guardado para a busca: até ~1,5 milhão de letras (um BG grosso cabe)
const LIMITE_TEXTO = 1_500_000;

async function textoDoPdf(chave: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(await baixarDoR2(chave))), { mergePages: true });
    return String(Array.isArray(text) ? text.join("\n") : text).slice(0, LIMITE_TEXTO);
  } catch (e) {
    console.error("[documentos] texto", chave, e);
    return "";
  }
}

function cabecalho(d: { tipo: string; numero: string; titulo: string; orgao: string; data: string }) {
  return normalizarBusca(`${d.tipo} ${d.numero} ${numeroSemZeros(d.numero)} ${d.titulo} ${d.orgao} ${d.data}`);
}

const COLUNAS = `id, tipo, numero, data, titulo, orgao, restrito, nome_arquivo, tamanho, tem_texto, enviado_por, enviado_em`;

function linha(r: any, trecho?: string): DocumentoOficial {
  return {
    id: String(r.id), tipo: String(r.tipo), numero: String(r.numero), data: String(r.data),
    titulo: String(r.titulo), orgao: String(r.orgao), restrito: !!r.restrito,
    nomeArquivo: String(r.nome_arquivo), tamanho: Number(r.tamanho) || 0, temTexto: !!r.tem_texto,
    enviadoPor: String(r.enviado_por), enviadoEm: new Date(r.enviado_em).toISOString(),
    ...(trecho ? { trecho } : {}),
  };
}

export type NovoDocumento = {
  tipo: string; numero: string; data: string; titulo: string; orgao: string; restrito: boolean;
  chave: string; nomeArquivo: string; tamanho: number; enviadoPor: string;
};

export async function criarDocumento(d: NovoDocumento): Promise<DocumentoOficial> {
  await garantir();
  const texto = await textoDoPdf(d.chave);
  const id = crypto.randomUUID();
  const temTexto = texto.replace(/\s/g, "").length > 40;
  await prisma.$executeRawUnsafe(
    `INSERT INTO documentos_oficiais
       (id, tipo, numero, numero_norm, data, titulo, orgao, restrito, r2_key, nome_arquivo, tamanho, tem_texto, busca, enviado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    id, d.tipo, d.numero, numeroSemZeros(d.numero), d.data, d.titulo, d.orgao, d.restrito, d.chave,
    d.nomeArquivo, d.tamanho, temTexto, `${cabecalho(d)}\n${normalizarBusca(texto)}`, d.enviadoPor);
  return (await obterDocumento(id, true))!;
}

export async function obterDocumento(id: string, admin: boolean): Promise<(DocumentoOficial & { chave: string }) | null> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT ${COLUNAS}, r2_key FROM documentos_oficiais WHERE id = $1 AND ($2 OR NOT restrito)`, id, admin);
  return rows[0] ? { ...linha(rows[0]), chave: String(rows[0].r2_key) } : null;
}

export async function atualizarDocumento(
  id: string, d: { tipo: string; numero: string; data: string; titulo: string; orgao: string; restrito: boolean },
): Promise<boolean> {
  await garantir();
  // troca só o cabeçalho da busca; o texto do PDF (depois da 1ª quebra de linha) fica
  const n = await prisma.$executeRawUnsafe(
    `UPDATE documentos_oficiais SET tipo=$2, numero=$3, numero_norm=$4, data=$5, titulo=$6, orgao=$7, restrito=$8,
       busca = $9 || substr(busca, strpos(busca, E'\\n'))
     WHERE id = $1`,
    id, d.tipo, d.numero, numeroSemZeros(d.numero), d.data, d.titulo, d.orgao, d.restrito, cabecalho(d));
  return n > 0;
}

export async function apagarDocumento(id: string): Promise<boolean> {
  const doc = await obterDocumento(id, true);
  if (!doc) return false;
  await prisma.$executeRawUnsafe(`DELETE FROM documentos_oficiais WHERE id = $1`, id);
  try { await removerDoR2(doc.chave); } catch { /* arquivo já não estava lá */ }
  return true;
}

export type FiltroDocumentos = {
  q?: string; tipo?: string; ano?: string; bg?: string; admin: boolean; limite?: number;
};

/* Cada palavra da busca tem de aparecer (em qualquer ordem). O trecho é o
   pedaço do texto em volta da primeira palavra, para o P/1 ver o contexto. */
export async function buscarDocumentos(f: FiltroDocumentos): Promise<DocumentoOficial[]> {
  await garantir();
  const params: unknown[] = [f.admin];
  const onde: string[] = [`($1 OR NOT restrito)`];
  if (f.tipo) { params.push(f.tipo); onde.push(`tipo = $${params.length}`); }
  if (f.ano) { params.push(`${f.ano}%`); onde.push(`data LIKE $${params.length}`); }
  if (f.bg) { params.push(numeroSemZeros(f.bg)); onde.push(`tipo LIKE 'BG%' AND numero_norm = $${params.length}`); }
  const palavras = normalizarBusca(f.q || "").replace(/[%_\\]/g, " ").split(" ").filter((p) => p.length >= 2).slice(0, 6);
  for (const p of palavras) { params.push(`%${p}%`); onde.push(`busca LIKE $${params.length}`); }
  let trecho = "''";
  if (palavras.length) {
    params.push(palavras[0]);
    const w = `$${params.length}`;
    trecho = `CASE WHEN strpos(busca, ${w}) > 0
      THEN substr(busca, greatest(strpos(busca, ${w}) - 90, 1), 220) ELSE '' END`;
  }
  params.push(Math.min(Math.max(f.limite ?? 100, 1), 300));
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT ${COLUNAS}, ${trecho} AS trecho FROM documentos_oficiais
     WHERE ${onde.join(" AND ")}
     ORDER BY data DESC, enviado_em DESC LIMIT $${params.length}`,
    ...params);
  return rows.map((r) => linha(r, String(r.trecho || "").replace(/\s+/g, " ").trim() || undefined));
}
