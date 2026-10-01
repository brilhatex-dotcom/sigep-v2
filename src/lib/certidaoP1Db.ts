import { prisma } from "@/lib/prisma";
import {
  PORTARIA_PADRAO, nomeArquivoDoMilitar, numeroCertidao, postoPorExtenso, descricaoQuadro,
  type DadosCertidaoP1,
} from "@/lib/certidaoP1";
import { certidoesExigidas, ehCpopm, rotuloCertidao } from "@/lib/certidoes";
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

/* O que foi mudado na tela em relação à ficha. Só se guarda o que DIFERE
   (vazio/ausente = vem da ficha), para que "voltar aos dados da ficha"
   seja só apagar os ajustes. String vazia é valor de propósito (ex.: tirar
   a matrícula do texto). */
export type Ajustes = {
  nome?: string;
  nomeGuerra?: string;
  postoExtenso?: string;
  matricula?: string;
  idPmma?: string;
  quadro?: string;
  quadroDescricao?: string;
  seisRegioes?: boolean;
  portaria?: string;
};
export type Emitida = {
  numero: number; ano: number; data: string;
  ajustes?: Ajustes; editadoPor?: string; editadoEm?: string;
};

// a ficha, do jeito que a certidão precisa dela
export type FichaCertidao = {
  id: string; nome: string | null; nomeGuerra: string | null; postoGrad: string | null;
  matricula: string | null; quadro: string | null;
};

/* Os campos da tela de edição, já com o valor que VAI SAIR no documento
   (ajuste, se houver; senão o que vem da ficha). */
export type CamposCertidao = {
  nome: string; nomeGuerra: string; postoExtenso: string; matricula: string; idPmma: string;
  quadro: string; quadroDescricao: string; seisRegioes: boolean; portaria: string;
  data: string; numero: number;
};
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

// o que sai da ficha, sem ajuste nenhum
function padraoDaFicha(f: FichaCertidao, e: EstadoCertidaoP1): Omit<CamposCertidao, "data" | "numero"> {
  return {
    nome: f.nome || f.nomeGuerra || "",
    nomeGuerra: f.nomeGuerra ?? "",
    postoExtenso: postoPorExtenso(f.postoGrad),
    matricula: f.matricula ?? "",
    idPmma: f.id,
    quadro: f.quadro ?? "",
    quadroDescricao: descricaoQuadro(f.quadro),
    seisRegioes: ehCpopm(f.postoGrad),
    portaria: e.portaria,
  };
}

export function camposDaCertidao(f: FichaCertidao, em: Emitida, e: EstadoCertidaoP1): CamposCertidao {
  const c: CamposCertidao = { ...padraoDaFicha(f, e), ...(em.ajustes ?? {}), data: em.data, numero: em.numero };
  // trocou a sigla do quadro e não escreveu a descrição: completa pela sigla
  if (!c.quadroDescricao.trim()) c.quadroDescricao = descricaoQuadro(c.quadro);
  return c;
}

// o que o gerador (Word/PDF) recebe
export function dadosDaCertidao(f: FichaCertidao, em: Emitida, e: EstadoCertidaoP1): DadosCertidaoP1 {
  const c = camposDaCertidao(f, em, e);
  return {
    numero: em.numero,
    ano: em.ano,
    data: em.data,
    portaria: c.portaria,
    nome: c.nome,
    nomeGuerra: c.nomeGuerra,
    postoGrad: f.postoGrad,
    postoExtenso: c.postoExtenso,
    matricula: c.matricula,
    idPmma: c.idPmma,
    quadro: c.quadro,
    quadroDescricao: c.quadroDescricao,
    seisRegioes: c.seisRegioes,
  };
}

/* Grava o que foi mudado na tela. `podeNumero`: só o P/1 troca o número (e
   nunca para um que outra certidão do mesmo ano já usa). O militar que gera
   a própria certidão ajusta os dados e a data, não a numeração. */
export async function editar(
  periodoId: string,
  f: FichaCertidao,
  campos: Partial<CamposCertidao>,
  opcoes: { podeNumero: boolean; quem: string },
): Promise<{ ok: true } | { erro: string }> {
  const e = await lerEstado();
  const k = chaveDe(periodoId, f.id);
  const em = e.emitidas[k];
  if (!em) return { erro: "Certidão ainda não emitida." };

  if (campos.data !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.data)) return { erro: "Data inválida." };
    em.data = campos.data;
  }
  if (opcoes.podeNumero && campos.numero !== undefined && campos.numero !== em.numero) {
    const n = Number(campos.numero);
    if (!Number.isInteger(n) || n < 1) return { erro: "Número inválido." };
    const ocupado = Object.entries(e.emitidas).some(([outra, x]) => outra !== k && x.ano === em.ano && x.numero === n);
    if (ocupado) return { erro: `O nº ${numeroCertidao(n, em.ano)} já é de outra certidão.` };
    em.numero = n;
    if (n >= proximoNumero(e, em.ano)) e.proximo[String(em.ano)] = n + 1;
  }

  // guarda só o que difere do que viria da ficha
  const padrao = padraoDaFicha(f, e);
  const ajustes: Ajustes = { ...(em.ajustes ?? {}) };
  const textos = ["nome", "nomeGuerra", "postoExtenso", "matricula", "idPmma", "quadro", "quadroDescricao", "portaria"] as const;
  for (const c of textos) {
    const v = campos[c];
    if (v === undefined) continue;
    const limpo = String(v).replace(/\s+/g, " ").trim().slice(0, 300);
    if (limpo === padrao[c]) delete ajustes[c]; else ajustes[c] = limpo;
  }
  if (typeof campos.seisRegioes === "boolean") {
    if (campos.seisRegioes === padrao.seisRegioes) delete ajustes.seisRegioes;
    else ajustes.seisRegioes = campos.seisRegioes;
  }
  em.ajustes = Object.keys(ajustes).length ? ajustes : undefined;
  em.editadoPor = opcoes.quem;
  em.editadoEm = new Date().toISOString();
  await salvar(e);
  return { ok: true };
}

// "voltar aos dados da ficha": apaga os ajustes (número e data ficam)
export async function restaurar(periodoId: string, efetivoId: string): Promise<void> {
  const e = await lerEstado();
  const em = e.emitidas[chaveDe(periodoId, efetivoId)];
  if (!em) return;
  delete em.ajustes;
  await salvar(e);
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
  oficial: boolean;             // concorre pela CPOPM (oficial ou subtenente)
  arquivo: string;              // nome do arquivo final (sem extensão)
  numero: string | null;        // "002/2026"
  data: string | null;          // aaaa-mm-dd
  exigidas: { ordem: number; rotulo: string }[];
  enviadas: number[];
  campos: CamposCertidao | null; // o que vai sair no documento (null = não emitida)
  ajustado: boolean;             // tem algum dado mudado em relação à ficha
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
        oficial: ehCpopm(f.postoGrad),
        arquivo: nomeArquivoDoMilitar(f.postoGrad, f.nome || f.nomeGuerra || f.id),
        numero: em ? numeroCertidao(em.numero, em.ano) : null,
        data: em?.data ?? null,
        exigidas: exigidas.map((c) => ({ ordem: c.ordem, rotulo: rotuloCertidao(c.ordem) })),
        enviadas: (enviadasDe.get(f.id) ?? []).filter((o) => exigidas.some((c) => c.ordem === o)).sort((a, b) => a - b),
        campos: em ? camposDaCertidao(f, em, e) : null,
        ajustado: !!(em?.ajustes && Object.keys(em.ajustes).length),
      };
    });
}
