import { prisma } from "@/lib/prisma";
import {
  CIDADE_PADRAO, nomeArquivoDoMilitar, postoPorExtenso, descricaoQuadro, type DadosCertidaoP1,
} from "@/lib/certidaoP1";
import { certidoesExigidas, ehCpopm, rotuloCertidao } from "@/lib/certidoes";
import { compararAntiguidade } from "@/lib/antiguidade";

/* =========================================================================
   DECLARAÇÕES INDIVIDUAIS GERADAS — guardadas na tabela Config, sem mexer no
   schema (mesmo padrão do status do P/1, em promocaoStatusP1).

   Config.chave = "promocao_certidao_p1"   (nome da época da certidão do P/1)
   Config.valor = JSON {
     emitidas: { "<periodoId>:<efetivoId>": { data, ajustes?, editadoPor?, editadoEm? } }
   }

   A declaração não tem número (quem declara é o próprio militar). Uma vez
   gerada, guarda a data e os ajustes: baixar de novo (Word, PDF, unificado)
   sai sempre IGUAL. Registros antigos, do tempo da certidão numerada, podem
   ainda trazer "numero"/"portaria" — são ignorados.
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
  local?: string;
};
export type Emitida = {
  data: string;
  ajustes?: Ajustes; editadoPor?: string; editadoEm?: string;
};

// a ficha, do jeito que a declaração precisa dela
export type FichaCertidao = {
  id: string; nome: string | null; nomeGuerra: string | null; postoGrad: string | null;
  matricula: string | null; quadro: string | null;
};

/* Os campos da tela de edição, já com o valor que VAI SAIR no documento
   (ajuste, se houver; senão o que vem da ficha). */
export type CamposCertidao = {
  nome: string; nomeGuerra: string; postoExtenso: string; matricula: string; idPmma: string;
  quadro: string; quadroDescricao: string; seisRegioes: boolean; local: string;
  data: string;
};
export type EstadoCertidaoP1 = {
  emitidas: Record<string, Emitida>;
};

const chaveDe = (periodoId: string, efetivoId: string) => `${periodoId}:${efetivoId}`;

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function lerEstado(): Promise<EstadoCertidaoP1> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const v = row?.valor ? JSON.parse(row.valor) : null;
    const emitidas = v && typeof v === "object" && v.emitidas && typeof v.emitidas === "object" ? v.emitidas : {};
    return { emitidas };
  } catch {
    return { emitidas: {} };
  }
}

async function salvar(e: EstadoCertidaoP1) {
  const valor = JSON.stringify(e);
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor },
    create: { chave: CHAVE, valor, descricao: "Declarações individuais da promoção (oficiais e subtenentes)" },
  });
}

export function emitidaDe(e: EstadoCertidaoP1, periodoId: string, efetivoId: string): Emitida | null {
  return e.emitidas[chaveDe(periodoId, efetivoId)] ?? null;
}

/* Gera a declaração de quem ainda não tem neste período, com a data dada.
   Quem já tem fica com a data e os ajustes que já tinha. */
export async function emitir(periodoId: string, efetivoIds: string[], data: string): Promise<EstadoCertidaoP1> {
  const e = await lerEstado();
  let mudou = false;
  for (const id of efetivoIds) {
    const k = chaveDe(periodoId, id);
    if (e.emitidas[k]) continue;
    e.emitidas[k] = { data };
    mudou = true;
  }
  if (mudou) await salvar(e);
  return e;
}

// o que sai da ficha, sem ajuste nenhum
function padraoDaFicha(f: FichaCertidao): Omit<CamposCertidao, "data"> {
  return {
    nome: f.nome || f.nomeGuerra || "",
    nomeGuerra: f.nomeGuerra ?? "",
    postoExtenso: postoPorExtenso(f.postoGrad),
    matricula: f.matricula ?? "",
    idPmma: f.id,
    quadro: f.quadro ?? "",
    quadroDescricao: descricaoQuadro(f.quadro),
    seisRegioes: ehCpopm(f.postoGrad),
    local: CIDADE_PADRAO,
  };
}

export function camposDaCertidao(f: FichaCertidao, em: Emitida): CamposCertidao {
  // só os ajustes que esta versão conhece (registros antigos traziam "portaria")
  const a = em.ajustes ?? {};
  const c: CamposCertidao = { ...padraoDaFicha(f), data: em.data };
  for (const k of CAMPOS_TEXTO) if (typeof a[k] === "string") c[k] = a[k] as string;
  if (typeof a.seisRegioes === "boolean") c.seisRegioes = a.seisRegioes;
  // trocou a sigla do quadro e não escreveu a descrição: completa pela sigla
  if (!c.quadroDescricao.trim()) c.quadroDescricao = descricaoQuadro(c.quadro);
  return c;
}

// o que o gerador (Word/PDF) recebe
export function dadosDaCertidao(f: FichaCertidao, em: Emitida): DadosCertidaoP1 {
  const c = camposDaCertidao(f, em);
  return {
    data: c.data,
    nome: c.nome,
    nomeGuerra: c.nomeGuerra,
    postoGrad: f.postoGrad,
    postoExtenso: c.postoExtenso,
    matricula: c.matricula,
    idPmma: c.idPmma,
    quadro: c.quadro,
    quadroDescricao: c.quadroDescricao,
    seisRegioes: c.seisRegioes,
    local: c.local,
  };
}

const CAMPOS_TEXTO = ["nome", "nomeGuerra", "postoExtenso", "matricula", "idPmma", "quadro", "quadroDescricao", "local"] as const;

/* Grava o que foi mudado na tela (P/1 ou o próprio militar). Guarda só o que
   difere do que viria da ficha. */
export async function editar(
  periodoId: string,
  f: FichaCertidao,
  campos: Partial<CamposCertidao>,
  opcoes: { quem: string },
): Promise<{ ok: true } | { erro: string }> {
  const e = await lerEstado();
  const em = e.emitidas[chaveDe(periodoId, f.id)];
  if (!em) return { erro: "Declaração ainda não gerada." };

  if (campos.data !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.data)) return { erro: "Data inválida." };
    em.data = campos.data;
  }

  const padrao = padraoDaFicha(f);
  const ajustes: Ajustes = {};
  // começa só do que esta versão conhece (descarta "portaria" dos antigos)
  for (const k of CAMPOS_TEXTO) if (typeof em.ajustes?.[k] === "string") ajustes[k] = em.ajustes[k];
  if (typeof em.ajustes?.seisRegioes === "boolean") ajustes.seisRegioes = em.ajustes.seisRegioes;
  for (const c of CAMPOS_TEXTO) {
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

// "voltar aos dados da ficha": apaga os ajustes (a data fica)
export async function restaurar(periodoId: string, efetivoId: string): Promise<void> {
  const e = await lerEstado();
  const em = e.emitidas[chaveDe(periodoId, efetivoId)];
  if (!em) return;
  delete em.ajustes;
  await salvar(e);
}

// tira o militar da lista
export async function remover(periodoId: string, efetivoId: string): Promise<void> {
  const e = await lerEstado();
  delete e.emitidas[chaveDe(periodoId, efetivoId)];
  await salvar(e);
}

// quem já tem declaração gerada no período (para a lista abrir preenchida)
export function emitidasDoPeriodo(e: EstadoCertidaoP1, periodoId: string): string[] {
  const prefixo = `${periodoId}:`;
  return Object.keys(e.emitidas).filter((k) => k.startsWith(prefixo)).map((k) => k.slice(prefixo.length));
}

/* ---------------------------------------------------------------- linhas
   O que a tela precisa de cada militar: identificação, se é oficial (a lista
   de certidões muda), se a declaração já foi gerada e quais certidões ele já
   mandou pelo sistema. Em ordem de antiguidade, como o resto do painel. */

export type LinhaCertidaoP1 = {
  efetivoId: string;
  postoGrad: string;
  nome: string;
  nomeGuerra: string;
  matricula: string;
  quadro: string;
  oficial: boolean;             // concorre pela CPOPM (oficial ou subtenente)
  arquivo: string;              // nome do arquivo final (sem extensão)
  gerada: boolean;              // a declaração já foi gerada neste período
  data: string | null;          // aaaa-mm-dd (a da declaração)
  exigidas: { ordem: number; rotulo: string }[];
  enviadas: number[];
  campos: CamposCertidao | null; // o que vai sair no documento (null = não emitida)
  ajustado: boolean;             // tem algum dado mudado em relação à ficha
};

// tem algum ajuste que esta versão usa? (o "portaria" dos antigos não conta)
function camposAjustados(em: Emitida): boolean {
  const a = em.ajustes ?? {};
  return CAMPOS_TEXTO.some((k) => typeof a[k] === "string") || typeof a.seisRegioes === "boolean";
}

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
        gerada: !!em,
        data: em?.data ?? null,
        exigidas: exigidas.map((c) => ({ ordem: c.ordem, rotulo: rotuloCertidao(c.ordem) })),
        enviadas: (enviadasDe.get(f.id) ?? []).filter((o) => exigidas.some((c) => c.ordem === o)).sort((a, b) => a - b),
        campos: em ? camposDaCertidao(f, em) : null,
        ajustado: !!em && !!camposAjustados(em),
      };
    });
}
