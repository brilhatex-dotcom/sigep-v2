import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/* =========================================================================
   Assinatura AVANÇADA do SIGEP (reutilizável para escalas e memorandos).
   Igual ao lacre da permuta: quando o signatário confirma com a SENHA
   (reautenticação), grava-se um registro com carimbo de data/hora e um TOKEN
   HMAC-SHA256 sobre o conteúdo do documento. O QR aponta para a verificação
   pública, que recalcula o token: bateu = autêntico e íntegro; não bateu =
   alterado. Base: MP 2.200-2/2001 e Lei 14.063/2020 (assinatura avançada).
   Guardado na tabela Config (chave "assinaturas_sigep"), sem mexer no schema.
   ========================================================================= */

const CHAVE = "assinaturas_sigep";
const LIMITE = 20000;

export type AssinaturaSigep = {
  id: string;            // ex.: "AS-2026-000042"
  tipo: string;          // "memorando_ferias" | "memorando_lp" | "escala" ...
  ref: string;           // identificador do documento (ex.: "849988:2026")
  papel: string;         // "chefe_p1" | "cmt"
  nome: string;          // nome do signatário
  cargo: string;         // cargo (ex.: "Chefe do P/1 do 18º BPM")
  efetivoId: string | null;
  hash: string;          // sha256 do conteúdo assinado (detecta alteração)
  em: string;            // ISO
};

function segredo(): string {
  return process.env.NEXTAUTH_SECRET || process.env.DADOS_SENSIVEIS_KEY || "sigep-18bpm-chave-local";
}
export function hashConteudo(conteudo: string): string {
  return crypto.createHash("sha256").update(String(conteudo || "")).digest("hex");
}
export function tokenAssinatura(a: AssinaturaSigep): string {
  const base = [a.id, a.tipo, a.ref, a.papel, a.efetivoId || "", a.hash, a.em].join("\x1f");
  const h = crypto.createHmac("sha256", segredo()).update(base).digest();
  return h.subarray(0, 16).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function conferirAssinatura(a: AssinaturaSigep, token: string): boolean {
  const esperado = tokenAssinatura(a);
  const x = Buffer.from(esperado), y = Buffer.from(token || "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function lerTodas(): Promise<AssinaturaSigep[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const v = row?.valor ? JSON.parse(row.valor) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
async function salvarTodas(lista: AssinaturaSigep[]): Promise<void> {
  const valor = JSON.stringify(lista.slice(-LIMITE));
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor },
    create: { chave: CHAVE, valor, descricao: "Assinaturas eletronicas SIGEP (escalas/memorandos)" },
  });
}

function novoId(seq: number): string {
  return `AS-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;
}

/* Cria uma OU várias assinaturas (lote). Cada item traz o conteúdo a lacrar.
   Devolve os registros com o token (para montar o QR). */
export async function criarAssinaturas(
  itens: { tipo: string; ref: string; conteudo: string }[],
  meta: { papel: string; nome: string; cargo: string; efetivoId: string | null },
): Promise<{ id: string; ref: string; token: string; em: string }[]> {
  const lista = await lerTodas();
  let seq = lista.length;
  const em = new Date().toISOString();
  const criadas: { id: string; ref: string; token: string; em: string }[] = [];
  for (const it of itens) {
    seq += 1;
    const rec: AssinaturaSigep = {
      id: novoId(seq), tipo: it.tipo, ref: it.ref, papel: meta.papel,
      nome: meta.nome, cargo: meta.cargo, efetivoId: meta.efetivoId,
      hash: hashConteudo(it.conteudo), em,
    };
    // Uma assinatura por (tipo, ref, papel): re-assinar substitui a anterior.
    const idx = lista.findIndex((a) => a.tipo === rec.tipo && a.ref === rec.ref && a.papel === rec.papel);
    if (idx >= 0) lista[idx] = rec; else lista.push(rec);
    criadas.push({ id: rec.id, ref: rec.ref, token: tokenAssinatura(rec), em });
  }
  await salvarTodas(lista);
  return criadas;
}

export async function acharAssinatura(id: string): Promise<AssinaturaSigep | null> {
  const lista = await lerTodas();
  return lista.find((a) => a.id === id) || null;
}

// Assinaturas atuais de um documento (por tipo+ref), para o carimbo/QR.
export async function assinaturasDoDoc(tipo: string, ref: string): Promise<(AssinaturaSigep & { token: string })[]> {
  const lista = await lerTodas();
  return lista.filter((a) => a.tipo === tipo && a.ref === ref).map((a) => ({ ...a, token: tokenAssinatura(a) }));
}
