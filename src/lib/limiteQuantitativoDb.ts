import { prisma } from "@/lib/prisma";
import { cruzarComEfetivo, type LinhaLimite } from "@/lib/limiteQuantitativo";
import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   Limite Quantitativo guardado — um registro por PDF (ciclo + graduação).

   Guarda as LINHAS do PDF inteiras, não só "quem é nosso": o cruzamento com
   o efetivo é refeito a cada abertura. Assim, um PM cadastrado no SIGEP
   depois do upload aparece sozinho, e quem saiu do batalhão deixa de contar,
   sem precisar subir o PDF de novo.

   Tabela criada em runtime (o deploy não roda `db push`).
   ========================================================================= */

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS limite_quantitativo (
        chave text PRIMARY KEY,
        ciclo text NOT NULL DEFAULT '',
        grad_origem text NOT NULL DEFAULT '',
        grad_destino text NOT NULL DEFAULT '',
        titulo text NOT NULL DEFAULT '',
        rotulo_data text NOT NULL DEFAULT '',
        arquivo text NOT NULL DEFAULT '',
        linhas text NOT NULL DEFAULT '[]',
        furos text NOT NULL DEFAULT '[]',
        enviado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        enviado_por text
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export type RegistroLimite = {
  chave: string; ciclo: string; gradOrigem: string; gradDestino: string; titulo: string;
  rotuloData: string; arquivo: string; linhas: LinhaLimite[]; furos: { quadro: string; faltam: number[] }[];
  enviadoEm: string; enviadoPor: string;
};

const json = <T,>(v: unknown, padrao: T): T => { try { return JSON.parse(String(v)) as T; } catch { return padrao; } };

// O mesmo PDF subido de novo (ou corrigido pela CPPPM) SUBSTITUI o anterior.
export const chaveLimite = (ciclo: string, gradOrigem: string) => `${ciclo || "sem-ciclo"}|${gradOrigem}`;

export async function salvarLimite(r: Omit<RegistroLimite, "chave" | "enviadoEm">): Promise<string> {
  await garantir();
  const chave = chaveLimite(r.ciclo, r.gradOrigem);
  await prisma.$executeRawUnsafe(
    `INSERT INTO limite_quantitativo (chave, ciclo, grad_origem, grad_destino, titulo, rotulo_data, arquivo, linhas, furos, enviado_em, enviado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,$10)
     ON CONFLICT (chave) DO UPDATE SET
       ciclo = EXCLUDED.ciclo, grad_origem = EXCLUDED.grad_origem, grad_destino = EXCLUDED.grad_destino,
       titulo = EXCLUDED.titulo, rotulo_data = EXCLUDED.rotulo_data, arquivo = EXCLUDED.arquivo,
       linhas = EXCLUDED.linhas, furos = EXCLUDED.furos, enviado_em = CURRENT_TIMESTAMP, enviado_por = EXCLUDED.enviado_por`,
    chave, r.ciclo, r.gradOrigem, r.gradDestino, r.titulo, r.rotuloData, r.arquivo,
    JSON.stringify(r.linhas), JSON.stringify(r.furos), r.enviadoPor);
  return chave;
}

export async function listarLimites(): Promise<RegistroLimite[]> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM limite_quantitativo ORDER BY enviado_em DESC`);
  return rows.map((r) => ({
    chave: r.chave, ciclo: r.ciclo, gradOrigem: r.grad_origem, gradDestino: r.grad_destino, titulo: r.titulo,
    rotuloData: r.rotulo_data, arquivo: r.arquivo, linhas: json(r.linhas, []), furos: json(r.furos, []),
    enviadoEm: r.enviado_em ? new Date(r.enviado_em).toISOString() : "", enviadoPor: r.enviado_por || "",
  }));
}

export async function apagarLimite(chave: string): Promise<void> {
  await garantir();
  await prisma.$executeRawUnsafe(`DELETE FROM limite_quantitativo WHERE chave = $1`, chave);
}

/* =========================================================================
   QUEM ESTÁ (OU NÃO) NO LIMITE — para o P/1 ver de cara quem mandou
   certidão sem estar na lista da CPPPM (pedido do P/1: "acusar destacando
   quem é").

     dentro         aparece numa lista do ciclo atual
     fora           é praça de graduação com lista carregada e NÃO aparece
     sem_lista      a lista da graduação dele não foi carregada: não dá para
                    conferir (não acusa à toa)
     nao_se_aplica  oficial ou subtenente: não há Limite de praça para eles

   Mesmo cruzamento da aba Limite Quantitativo (cruzarComEfetivo) e a mesma
   regra de ciclo dos parabéns: só vale o ciclo mais recente.
   ========================================================================= */
export type SituacaoNoLimite = "dentro" | "fora" | "sem_lista" | "nao_se_aplica";

const MESES_LQ = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ordemCicloLQ = (c: string) => {
  const m = (c || "").match(/^(\S+) de (\d{4})$/);
  return m ? Number(m[2]) * 100 + (MESES_LQ.indexOf(m[1]) + 1) : 0;
};
// a graduação da ficha na sigla das listas da CPPPM (1º Sgt a Soldado)
const SIGLA_DA_ORDEM: Record<number, string> = { 9: "1SGT", 10: "2SGT", 11: "3SGT", 12: "CB", 13: "SD" };

export async function situacaoNoLimite(efetivoIds: string[]): Promise<Map<string, SituacaoNoLimite>> {
  const out = new Map<string, SituacaoNoLimite>();
  const ids = Array.from(new Set(efetivoIds.filter(Boolean)));
  if (!ids.length) return out;

  const [listas, fichas] = await Promise.all([
    listarLimites(),
    prisma.efetivo.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, nomeGuerra: true, matricula: true, numeroBarra: true, postoGrad: true, lotacao: true },
    }),
  ]);
  const atual = Math.max(0, ...listas.map((l) => ordemCicloLQ(l.ciclo)));
  const doCiclo = listas.filter((l) => {
    const oc = ordemCicloLQ(l.ciclo);
    return !(oc && oc < atual && oc >= 202001);
  });
  const comLista = new Set(doCiclo.map((l) => l.gradOrigem));
  const achados = new Set(
    cruzarComEfetivo(doCiclo.flatMap((l) => l.linhas), fichas).map((n) => n.efetivoId).filter(Boolean),
  );

  for (const f of fichas) {
    const sigla = SIGLA_DA_ORDEM[classificarPatente(f.postoGrad).ordem];
    out.set(f.id,
      !sigla ? "nao_se_aplica"
        : achados.has(f.id) ? "dentro"
        : comLista.has(sigla) ? "fora"
        : "sem_lista");
  }
  return out;
}
