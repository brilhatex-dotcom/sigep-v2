import { prisma } from "@/lib/prisma";
import { baixarDoR2 } from "@/lib/r2";
import { certidoesExigidas } from "@/lib/certidoes";
import {
  conferirCertidoes, sinaisDeAdulteracao, VERSAO_REGRAS, type ArquivoLido, type ResultadoConferencia,
} from "@/lib/conferenciaCertidoes";
import { lerPdfDeCertidao } from "@/lib/leituraPdf";

/* =========================================================================
   A conferência automática guardada por militar e período.

   Ela vale para o CONJUNTO de arquivos que leu: a "assinatura" junta item,
   arquivo e hora de envio de cada certidão. Trocou uma certidão (o P/1
   reabriu e o militar mandou outra), a assinatura muda e a conferência
   antiga deixa de valer — a tela mostra "conferir de novo", e não um ✓ de
   arquivos que já não são os mesmos.

   Roda sozinha quando o militar envia ao P/1, e pelo botão do painel.
   Tabela criada em runtime (o deploy não roda `db push`).
   ========================================================================= */

export type ConferenciaGuardada = { assinatura: string; resultado: ResultadoConferencia; conferidoEm: string };

// prazo da Planilha Padrão na CPPPM (Portaria nº 168/2026-CPPPM)
const PRAZO_ENTREGA_CPPPM = new Date(Date.UTC(2026, 10, 6));

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS conferencia_certidoes (
        periodo_id text NOT NULL,
        efetivo_id text NOT NULL,
        assinatura text NOT NULL,
        resultado text NOT NULL,
        conferido_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (periodo_id, efetivo_id)
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

type CertidaoDoBanco = { ordem: number; r2Key: string; enviadaEm: Date };

// as regras entram na assinatura: regra nova, conferência velha não vale
export function assinaturaDe(certidoes: CertidaoDoBanco[]): string {
  return `v${VERSAO_REGRAS}|` + certidoes
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => `${c.ordem}:${c.r2Key}:${new Date(c.enviadaEm).getTime()}`)
    .join("|");
}

export async function lerConferencias(periodoId: string): Promise<Map<string, ConferenciaGuardada>> {
  const mapa = new Map<string, ConferenciaGuardada>();
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT efetivo_id, assinatura, resultado, conferido_em FROM conferencia_certidoes WHERE periodo_id = $1`, periodoId);
    for (const r of rows) {
      try {
        mapa.set(String(r.efetivo_id), {
          assinatura: String(r.assinatura),
          resultado: JSON.parse(r.resultado),
          conferidoEm: new Date(r.conferido_em).toISOString(),
        });
      } catch { /* linha estragada: fica como não conferida */ }
    }
  } catch (e) { console.error("[conferencia] ler", e); }
  return mapa;
}

/* Baixa as certidões do militar, lê e confere. Devolve null se ele não
   tem certidão nenhuma no período. */
/* `segundos`: quanto desta chamada pode ir para a leitura de imagem (OCR) —
   o que não couber fica para a próxima (ver lib/leituraPdf.ts). */
export async function conferirMilitar(periodoId: string, efetivoId: string, segundos = 35): Promise<ConferenciaGuardada | null> {
  const prazo = Date.now() + segundos * 1000;
  const [participante, ficha] = await Promise.all([
    prisma.participantePromocao.findUnique({
      where: { periodoId_efetivoId: { periodoId, efetivoId } },
      select: { certidoes: { select: { ordem: true, r2Key: true, enviadaEm: true } } },
    }),
    prisma.efetivo.findUnique({ where: { id: efetivoId }, select: { nome: true, cpf: true, postoGrad: true } }),
  ]);
  const certidoes = participante?.certidoes ?? [];
  if (!certidoes.length) return null;

  // a Certidão Unificada (itens 4 a 8) é UM arquivo: lido uma vez só
  const porArquivo = new Map<string, { ordens: number[]; versao: number }>();
  for (const c of certidoes) {
    const a = porArquivo.get(c.r2Key) || { ordens: [], versao: 0 };
    porArquivo.set(c.r2Key, { ordens: [...a.ordens, c.ordem], versao: Math.max(a.versao, new Date(c.enviadaEm).getTime()) });
  }

  const arquivos: ArquivoLido[] = [];
  for (const [chave, { ordens, versao }] of Array.from(porArquivo.entries())) {
    const ordenadas = ordens.sort((a, b) => a - b);
    try {
      const l = await lerPdfDeCertidao(chave, String(versao), () => baixarDoR2(chave), prazo);
      arquivos.push({
        ordens: ordenadas, paginas: l.paginas, porImagem: l.porImagem, incompleto: l.incompleto,
        sinais: sinaisDeAdulteracao(l.meta),
      });
    } catch (e) {
      console.error("[conferencia] leitura", chave, e);
      arquivos.push({ ordens: ordenadas, paginas: [], erroLeitura: true });
    }
  }

  const exigidas = certidoesExigidas(ficha?.postoGrad ?? null).map((c) => c.ordem);
  const resultado = conferirCertidoes(
    arquivos, { nome: ficha?.nome ?? null, cpf: ficha?.cpf ?? null }, exigidas, new Date(), PRAZO_ENTREGA_CPPPM,
  );
  const guardada: ConferenciaGuardada = {
    assinatura: assinaturaDe(certidoes), resultado, conferidoEm: new Date().toISOString(),
  };

  await garantir();
  await prisma.$executeRawUnsafe(
    `INSERT INTO conferencia_certidoes (periodo_id, efetivo_id, assinatura, resultado, conferido_em)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (periodo_id, efetivo_id)
     DO UPDATE SET assinatura = EXCLUDED.assinatura, resultado = EXCLUDED.resultado, conferido_em = CURRENT_TIMESTAMP`,
    periodoId, efetivoId, guardada.assinatura, JSON.stringify(resultado));
  return guardada;
}
