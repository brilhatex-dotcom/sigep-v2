import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { segredoApp } from "@/lib/segredo";

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

export type AssinaturaSigep = {
  id: string;            // ex.: "AS-2026-000042"
  tipo: string;          // "memorando_ferias" | "memorando_lp" | "escala" ...
  ref: string;           // identificador do documento (ex.: "849988:2026")
  papel: string;         // "chefe_p1" | "cmt"
  nome: string;          // nome do signatário
  cargo: string;         // cargo (ex.: "Chefe do P/1 do 18º BPM")
  efetivoId: string | null;
  hash: string;          // sha256 do conteúdo assinado (detecta alteração)
  resumo?: string;       // o QUE foi assinado (texto legível, não sensível)
  em: string;            // ISO
  /* DE ONDE partiu o ato. Não identificam pessoa por si só, mas compõem o auto
     de assinatura: numa contestação ("não fui eu"), o registro mostra que o
     ato saiu de tal endereço, em tal aparelho, naquele instante. */
  ip?: string;
  dispositivo?: string;  // navegador/sistema (user-agent resumido)
};

function segredo(): string {
  return segredoApp();
}

/* DE ONDE partiu o ato de assinar, lido dos cabeçalhos da requisição.

   O IP vem do proxy (a Vercel entrega em x-forwarded-for); o primeiro da
   lista é o do cliente. O user-agent inteiro é longo e ilegível, então vira
   "Chrome 141 · Windows" — o que serve para o auto de assinatura é o aparelho
   reconhecível, não a string técnica. */
export function origemDaRequisicao(req: Request): { ip: string; dispositivo: string } {
  const h = req.headers;
  const ip = (h.get("x-sigep-ip") || h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
  const ua = h.get("user-agent") || "";

  const navegador =
    /Edg\//.test(ua) ? `Edge ${(ua.match(/Edg\/(\d+)/) || [])[1] || ""}`
    : /OPR\//.test(ua) ? `Opera ${(ua.match(/OPR\/(\d+)/) || [])[1] || ""}`
    : /Firefox\//.test(ua) ? `Firefox ${(ua.match(/Firefox\/(\d+)/) || [])[1] || ""}`
    : /Chrome\//.test(ua) ? `Chrome ${(ua.match(/Chrome\/(\d+)/) || [])[1] || ""}`
    : /Safari\//.test(ua) ? "Safari"
    : "";
  const sistema =
    /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  const dispositivo = [navegador.trim(), sistema].filter(Boolean).join(" · ");
  return { ip, dispositivo };
}
export function hashConteudo(conteudo: string): string {
  return crypto.createHash("sha256").update(String(conteudo || "")).digest("hex");
}
function lacre(base: string): string {
  const h = crypto.createHmac("sha256", segredo()).update(base).digest();
  return h.subarray(0, 16).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* O lacre COBRE o IP e o dispositivo, e não só acompanha: assim o auto de
   assinatura também não pode ser reescrito sem quebrar a verificação.

   Duas versões de propósito. A v1 é a base original; a v2 acrescenta origem e
   aparelho. Registro sem essas informações (tudo que foi assinado antes desta
   mudança) continua na v1 — incluí-las na conta de todos invalidaria, de uma
   vez, todas as assinaturas já emitidas, que é justamente o que uma assinatura
   não pode fazer. Qual versão vale se decide pelo próprio registro, então as
   duas pontas sempre chegam à mesma conclusão. */
const temOrigem = (a: AssinaturaSigep) => !!(a.ip || a.dispositivo);

function baseV1(a: AssinaturaSigep): string {
  return [a.id, a.tipo, a.ref, a.papel, a.efetivoId || "", a.hash, a.em].join("\x1f");
}
function baseV2(a: AssinaturaSigep): string {
  return [baseV1(a), a.ip || "", a.dispositivo || ""].join("\x1f");
}

export function tokenAssinatura(a: AssinaturaSigep): string {
  return lacre(temOrigem(a) ? baseV2(a) : baseV1(a));
}

const igual = (esperado: string, token: string): boolean => {
  const x = Buffer.from(esperado), y = Buffer.from(token || "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* A verificação diz TAMBÉM se a origem (IP/dispositivo) está coberta pelo
   lacre, e não só se o documento é autêntico.

   Isso existe por honestidade probatória. Assinatura emitida ANTES desta
   mudança foi lacrada sem origem; se alguém preencher esses campos depois, o
   token antigo continua conferindo — o documento é autêntico, mas a origem
   NÃO tem a mesma garantia. A página de verificação usa este sinal para não
   apresentar como provado algo que o lacre não prova. */
export function conferirDetalhado(a: AssinaturaSigep, token: string): { ok: boolean; origemLacrada: boolean } {
  if (igual(lacre(baseV2(a)), token)) return { ok: true, origemLacrada: true };
  if (igual(lacre(baseV1(a)), token)) return { ok: true, origemLacrada: false };
  return { ok: false, origemLacrada: false };
}

export function conferirAssinatura(a: AssinaturaSigep, token: string): boolean {
  return conferirDetalhado(a, token).ok;
}

/* Tabela PRÓPRIA (uma linha por assinatura), em vez de um array JSON num único
   Config. Criada em runtime (o deploy não roda db push) e o Config antigo é
   migrado 1x. Motivo: consulta indexada, sem sobrescrita concorrente e escala. */
const FLAG_MIGRADO = "assinaturas_sigep_migrado_tabela";
let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) pronto = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS assinatura_sigep (
        id text PRIMARY KEY,
        tipo text NOT NULL DEFAULT '',
        ref text NOT NULL DEFAULT '',
        papel text NOT NULL DEFAULT '',
        nome text NOT NULL DEFAULT '',
        cargo text NOT NULL DEFAULT '',
        efetivo_id text,
        hash text NOT NULL DEFAULT '',
        resumo text NOT NULL DEFAULT '',
        em text NOT NULL DEFAULT ''
      )`);
    /* Colunas do auto de assinatura. ADD COLUMN IF NOT EXISTS porque a tabela
       já existe em produção e o deploy não roda migração. */
    await prisma.$executeRawUnsafe(`ALTER TABLE assinatura_sigep ADD COLUMN IF NOT EXISTS ip text NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE assinatura_sigep ADD COLUMN IF NOT EXISTS dispositivo text NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_assinatura_sigep_tiporef ON assinatura_sigep (tipo, ref)`);
    // Migração única do Config antigo (se existir e ainda não migrado).
    try {
      const flag = await prisma.config.findUnique({ where: { chave: FLAG_MIGRADO } });
      if (!flag) {
        const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
        const antigas: AssinaturaSigep[] = row?.valor ? (JSON.parse(row.valor) || []) : [];
        for (const a of antigas) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO assinatura_sigep (id, tipo, ref, papel, nome, cargo, efetivo_id, hash, resumo, em)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
            a.id, a.tipo, a.ref, a.papel, a.nome, a.cargo, a.efetivoId, a.hash, a.resumo || "", a.em);
        }
        await prisma.config.upsert({ where: { chave: FLAG_MIGRADO }, update: { valor: "1" }, create: { chave: FLAG_MIGRADO, valor: "1", descricao: "Assinaturas SIGEP migradas para tabela" } });
      }
    } catch (e) { console.error("[assinaturaSigep] migracao", e); }
  })();
  return pronto;
}

function mapear(r: any): AssinaturaSigep {
  return { id: r.id, tipo: r.tipo, ref: r.ref, papel: r.papel, nome: r.nome, cargo: r.cargo, efetivoId: r.efetivo_id ?? null, hash: r.hash, resumo: r.resumo || "", em: r.em, ip: r.ip || "", dispositivo: r.dispositivo || "" };
}

async function proxId(): Promise<string> {
  const ano = new Date().getFullYear();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `INSERT INTO disciplinar_contador (chave, valor) VALUES ($1, 1)
     ON CONFLICT (chave) DO UPDATE SET valor = disciplinar_contador.valor + 1 RETURNING valor`,
    `assinatura_sigep_${ano}`);
  const seq = Number(rows[0]?.valor ?? 1);
  return `AS-${ano}-${String(seq).padStart(6, "0")}`;
}

/* Cria uma OU várias assinaturas (lote). Uma por (tipo, ref, papel): re-assinar
   substitui a anterior. Devolve os registros com o token (para o QR). */
export async function criarAssinaturas(
  itens: { tipo: string; ref: string; conteudo: string; resumo?: string }[],
  meta: { papel: string; nome: string; cargo: string; efetivoId: string | null; ip?: string; dispositivo?: string },
): Promise<{ id: string; ref: string; token: string; em: string }[]> {
  await garantir();
  const em = new Date().toISOString();
  const criadas: { id: string; ref: string; token: string; em: string }[] = [];
  for (const it of itens) {
    const rec: AssinaturaSigep = {
      id: await proxId(), tipo: it.tipo, ref: it.ref, papel: meta.papel,
      nome: meta.nome, cargo: meta.cargo, efetivoId: meta.efetivoId,
      hash: hashConteudo(it.conteudo), resumo: (it.resumo || "").slice(0, 200), em,
      ip: (meta.ip || "").slice(0, 60), dispositivo: (meta.dispositivo || "").slice(0, 120),
    };
    await prisma.$executeRawUnsafe(`DELETE FROM assinatura_sigep WHERE tipo=$1 AND ref=$2 AND papel=$3`, rec.tipo, rec.ref, rec.papel);
    await prisma.$executeRawUnsafe(
      `INSERT INTO assinatura_sigep (id, tipo, ref, papel, nome, cargo, efetivo_id, hash, resumo, em, ip, dispositivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      rec.id, rec.tipo, rec.ref, rec.papel, rec.nome, rec.cargo, rec.efetivoId, rec.hash, rec.resumo || "", rec.em, rec.ip || "", rec.dispositivo || "");
    criadas.push({ id: rec.id, ref: rec.ref, token: tokenAssinatura(rec), em });
  }
  return criadas;
}

export async function acharAssinatura(id: string): Promise<AssinaturaSigep | null> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM assinatura_sigep WHERE id=$1 LIMIT 1`, id);
  return rows[0] ? mapear(rows[0]) : null;
}

// Assinaturas atuais de um documento (por tipo+ref), para o carimbo/QR.
export async function assinaturasDoDoc(tipo: string, ref: string): Promise<(AssinaturaSigep & { token: string })[]> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM assinatura_sigep WHERE tipo=$1 AND ref=$2`, tipo, ref);
  return rows.map((r) => { const a = mapear(r); return { ...a, token: tokenAssinatura(a) }; });
}
