import { prisma } from "@/lib/prisma";
import { PORTARIA_PADRAO, nomeArquivoDoMilitar, numeroCertidao } from "@/lib/certidaoP1";
import { certidoesExigidas, ehOficial, rotuloCertidao } from "@/lib/certidoes";
import { compararAntiguidade } from "@/lib/antiguidade";

/* =========================================================================
   NUMERAÇÃO DAS CERTIDÕES DO P/1 — guardada na tabela Config, sem mexer no
   schema (mesmo padrão do status do P/1, em promocaoStatusP1).

   Config.chave = "promocao_certidao_p1"
   Config.valor = JSON {
     portaria: "Portaria nº 040/2026 – GCG",
     proximo:  { "2026": 3 },                     // próximo número de cada ano
     emitidas: { "<periodoId>:<efetivoId>": { numero, ano, data } }
   }

   Uma vez emitida, a certidão de um militar guarda o número e a data: gerar
   de novo (Word, PDF, unificado) sai sempre IGUAL — o número não anda a cada
   download. O P/1 acerta o "próximo número" quando já emitiu alguma à mão
   (ex.: a 002 foi feita no Word, o sistema continua da 003).
   ========================================================================= */

const CHAVE = "promocao_certidao_p1";

export type Emitida = { numero: number; ano: number; data: string };
export type EstadoCertidaoP1 = {
  portaria: string;
  proximo: Record<string, number>;
  emitidas: Record<string, Emitida>;
};

const chaveDe = (periodoId: string, efetivoId: string) => `${periodoId}:${efetivoId}`;

export function anoAtual(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function lerEstado(): Promise<EstadoCertidaoP1> {
  const vazio: EstadoCertidaoP1 = { portaria: PORTARIA_PADRAO, proximo: {}, emitidas: {} };
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const v = row?.valor ? JSON.parse(row.valor) : null;
    if (!v || typeof v !== "object") return vazio;
    return {
      portaria: typeof v.portaria === "string" && v.portaria.trim() ? v.portaria : PORTARIA_PADRAO,
      proximo: v.proximo && typeof v.proximo === "object" ? v.proximo : {},
      emitidas: v.emitidas && typeof v.emitidas === "object" ? v.emitidas : {},
    };
  } catch {
    return vazio;
  }
}

async function salvar(e: EstadoCertidaoP1) {
  const valor = JSON.stringify(e);
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor },
    create: { chave: CHAVE, valor, descricao: "Numeração das certidões do P/1 para a promoção (oficiais)" },
  });
}

// próximo número do ano: o guardado, ou 1 + o maior já emitido no ano
export function proximoNumero(e: EstadoCertidaoP1, ano: number): number {
  const guardado = e.proximo[String(ano)];
  if (Number.isInteger(guardado) && guardado > 0) return guardado;
  const maior = Object.values(e.emitidas).filter((x) => x.ano === ano).reduce((m, x) => Math.max(m, x.numero), 0);
  return maior + 1;
}

export function emitidaDe(e: EstadoCertidaoP1, periodoId: string, efetivoId: string): Emitida | null {
  return e.emitidas[chaveDe(periodoId, efetivoId)] ?? null;
}

/* Numera, NA ORDEM RECEBIDA, quem ainda não tem certidão neste período. Quem
   já tem fica com o número e a data que já tinha. */
export async function emitir(periodoId: string, efetivoIds: string[], data: string): Promise<EstadoCertidaoP1> {
  const e = await lerEstado();
  const ano = Number(data.slice(0, 4)) || anoAtual();
  let n = proximoNumero(e, ano);
  for (const id of efetivoIds) {
    const k = chaveDe(periodoId, id);
    if (e.emitidas[k]) continue;
    e.emitidas[k] = { numero: n, ano, data };
    n++;
  }
  e.proximo[String(ano)] = n;
  await salvar(e);
  return e;
}

// tira o militar da lista (o número não volta a ser usado)
export async function remover(periodoId: string, efetivoId: string): Promise<void> {
  const e = await lerEstado();
  delete e.emitidas[chaveDe(periodoId, efetivoId)];
  await salvar(e);
}

export async function configurar(patch: { portaria?: string; proximo?: number; ano?: number }): Promise<EstadoCertidaoP1> {
  const e = await lerEstado();
  if (typeof patch.portaria === "string" && patch.portaria.trim()) e.portaria = patch.portaria.trim();
  if (Number.isInteger(patch.proximo) && (patch.proximo as number) > 0) {
    e.proximo[String(patch.ano || anoAtual())] = patch.proximo as number;
  }
  await salvar(e);
  return e;
}

// quem já tem certidão emitida no período (para a lista abrir preenchida)
export function emitidasDoPeriodo(e: EstadoCertidaoP1, periodoId: string): string[] {
  const prefixo = `${periodoId}:`;
  return Object.keys(e.emitidas).filter((k) => k.startsWith(prefixo)).map((k) => k.slice(prefixo.length));
}

/* ---------------------------------------------------------------- linhas
   O que a tela precisa de cada militar: identificação, se é oficial (a lista
   de certidões muda), o número já emitido e quais certidões ele já mandou
   pelo sistema. Em ordem de antiguidade, como o resto do painel. */

export type LinhaCertidaoP1 = {
  efetivoId: string;
  postoGrad: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
  quadro: string;
  oficial: boolean;
  arquivo: string;              // nome do arquivo final (sem extensão)
  numero: string | null;        // "002/2026"
  data: string | null;          // aaaa-mm-dd
  exigidas: { ordem: number; rotulo: string }[];
  enviadas: number[];
};

export async function linhasCertidaoP1(
  periodoId: string, ids: string[], e: EstadoCertidaoP1,
): Promise<LinhaCertidaoP1[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (!unicos.length) return [];

  const [fichas, participantes] = await Promise.all([
    prisma.efetivo.findMany({
      where: { id: { in: unicos } },
      select: {
        id: true, postoGrad: true, nome: true, nomeGuerra: true, matricula: true, quadro: true,
        dataPromocao: true, numeroBarra: true,
      },
    }),
    prisma.participantePromocao.findMany({
      where: { periodoId, efetivoId: { in: unicos } },
      select: { efetivoId: true, certidoes: { select: { ordem: true } } },
    }),
  ]);
  const enviadasDe = new Map(participantes.map((p) => [p.efetivoId, p.certidoes.map((c) => c.ordem)]));

  return fichas
    .sort((a, b) => compararAntiguidade(
      { postoGrad: a.postoGrad, nome: a.nome, dataPromocao: a.dataPromocao, numeroBarra: a.numeroBarra },
      { postoGrad: b.postoGrad, nome: b.nome, dataPromocao: b.dataPromocao, numeroBarra: b.numeroBarra },
    ))
    .map((f) => {
      const em = emitidaDe(e, periodoId, f.id);
      const exigidas = certidoesExigidas(f.postoGrad);
      return {
        efetivoId: f.id,
        postoGrad: f.postoGrad ?? "",
        nome: f.nome ?? "",
        nomeGuerra: f.nomeGuerra ?? "",
        matricula: f.matricula ?? "",
        quadro: f.quadro ?? "",
        oficial: ehOficial(f.postoGrad),
        arquivo: nomeArquivoDoMilitar(f.postoGrad, f.nome || f.nomeGuerra || f.id),
        numero: em ? numeroCertidao(em.numero, em.ano) : null,
        data: em?.data ?? null,
        exigidas: exigidas.map((c) => ({ ordem: c.ordem, rotulo: rotuloCertidao(c.ordem) })),
        enviadas: (enviadasDe.get(f.id) ?? []).filter((o) => exigidas.some((c) => c.ordem === o)).sort((a, b) => a - b),
      };
    });
}
