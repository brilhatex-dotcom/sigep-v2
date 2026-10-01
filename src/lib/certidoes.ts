import { classificarPatente } from "@/lib/patentes";

// ==========================================================
//  Certidoes exigidas para promocao, na ORDEM OFICIAL.
//  A "ordem" e usada como chave (1..9) e define a ordem no
//  PDF unificado.
//
//  PRACA: as 8 de sempre (TJMA 1º e 2º graus, Justica Militar
//  e TRF da 1ª a 5ª Regiao).
//  OFICIAL: as mesmas 8 + a do TRF da 6ª Regiao — exigencia da
//  Comissao Administrativa Especial (Of. Circular nº 003/2026-
//  CAE, Portaria nº 040/2026-GCG). Por isso a lista depende do
//  posto: use certidoesExigidas(postoGrad).
// ==========================================================

export type CertidaoExigida = {
  ordem: number;
  orgao: string;
  descricao: string;
  link: string;       // site oficial para emitir a certidão
  linkRotulo: string; // texto curto do botão do link
};

// Links oficiais de emissão das certidões de nada consta (Poder Judiciário).
const LINK_TJMA = "https://jurisconsult.tjma.jus.br/#/certidao-generate-state-certificate-form";
const LINK_TRF = {
  unificada: "https://certidao-unificada.cjf.jus.br/#/solicitacao-certidao",
  trf1: "https://sistemas.trf1.jus.br/certidao/#/solicitacao",
  trf2: "https://certidoes.trf2.jus.br/certidoes/#/principal/solicitar",
  trf3: "https://web.trf3.jus.br/certidao-regional/CertidaoCivelEleitoralCriminal/SolicitarDadosCertidao#",
  trf4: "https://www2.trf4.jus.br/trf4/processos/certidao/index.php",
  trf5: "https://certidoes.trf5.jus.br/certidoes2022/paginas/certidaocriminal.faces",
  trf6: "https://sistemas.trf6.jus.br/certidao/#/solicitacao",
};

export const CERTIDOES_EXIGIDAS: CertidaoExigida[] = [
  { ordem: 1, orgao: "TJMA", descricao: "Certidão Estadual 1º Grau (Ações Penais)", link: LINK_TJMA, linkRotulo: "Emitir no TJMA" },
  { ordem: 2, orgao: "TJMA", descricao: "Certidão de Distribuição 2º Grau (Ações Penais)", link: LINK_TJMA, linkRotulo: "Emitir no TJMA" },
  { ordem: 3, orgao: "TJMA", descricao: "Certidão Estadual 1º Grau (Justiça Militar Estadual)", link: LINK_TJMA, linkRotulo: "Emitir no TJMA" },
  { ordem: 4, orgao: "TRF 1ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf1, linkRotulo: "Emitir no TRF1" },
  { ordem: 5, orgao: "TRF 2ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf2, linkRotulo: "Emitir no TRF2" },
  { ordem: 6, orgao: "TRF 3ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf3, linkRotulo: "Emitir no TRF3" },
  { ordem: 7, orgao: "TRF 4ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf4, linkRotulo: "Emitir no TRF4" },
  { ordem: 8, orgao: "TRF 5ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf5, linkRotulo: "Emitir no TRF5" },
];

// Bloco de links oficiais (mostrado no topo, como orientação geral).
/* CERTIDÃO UNIFICADA DA JUSTIÇA FEDERAL (CJF): um pedido só gera a certidão
   do TRF1 ao TRF5 — é o caminho mais curto, para oficial e para praça, e por
   isso vem em destaque logo depois das estaduais. Um PDF só vale pelos itens
   4 a 8; o TRF da 6ª Região (só oficial) continua à parte. */
export const LINK_CERTIDAO_UNIFICADA = LINK_TRF.unificada;
export const ORDENS_UNIFICADA = [4, 5, 6, 7, 8];

export type LinkOficial = { titulo: string; url: string; obs?: string; destaque?: boolean };
export const LINKS_OFICIAIS: LinkOficial[] = [
  { titulo: "Justiça Estadual (1º e 2º graus) — TJMA", url: LINK_TJMA },
  { titulo: "Justiça Militar Estadual (1º grau) — TJMA", url: LINK_TJMA },
  {
    titulo: "Certidão Unificada da Justiça Federal (TRF1 a TRF5)", url: LINK_TRF.unificada, destaque: true,
    obs: "Um pedido só gera a certidão do TRF1 ao TRF5 — vale pelos 5 itens da Justiça Federal",
  },
  { titulo: "TRF 1ª Região", url: LINK_TRF.trf1 },
  { titulo: "TRF 2ª Região", url: LINK_TRF.trf2 },
  { titulo: "TRF 3ª Região", url: LINK_TRF.trf3 },
  { titulo: "TRF 4ª Região", url: LINK_TRF.trf4 },
  { titulo: "TRF 5ª Região", url: LINK_TRF.trf5 },
  { titulo: "TRF 6ª Região", url: LINK_TRF.trf6 },
];

// so para quem concorre pela CPOPM (ordem 9: entra no fim do PDF unificado)
export const CERTIDAO_TRF6: CertidaoExigida = {
  ordem: 9, orgao: "TRF 6ª Região", descricao: "Certidão Criminal Negativa", link: LINK_TRF.trf6, linkRotulo: "Emitir no TRF6",
};

// total das PRACAS (a Planilha Padrao da CPPPM e so de praca)
export const TOTAL_CERTIDOES = CERTIDOES_EXIGIDAS.length;

// Coronel a Aspirante (ordem 1..7 da hierarquia)
export function ehOficial(postoGrad: string | null | undefined): boolean {
  return classificarPatente(postoGrad ?? null).ordem <= 7;
}

/* Concorre pela Comissao de Promocao de OFICIAIS (CPOPM): os oficiais e o
   SUBTENENTE — a promocao dele e a 2º Tenente, julgada pela mesma comissao.
   Para esses vale o rito da CAE (Of. Circular 003/2026): certidao do TRF da
   6ª Regiao e a certidao/declaracao do P/1, que o proprio militar pode gerar. */
export function ehCpopm(postoGrad: string | null | undefined): boolean {
  return classificarPatente(postoGrad ?? null).ordem <= 8;
}

// as certidoes que ESTE militar tem de apresentar, na ordem oficial
export function certidoesExigidas(postoGrad: string | null | undefined): CertidaoExigida[] {
  return ehCpopm(postoGrad) ? [...CERTIDOES_EXIGIDAS, CERTIDAO_TRF6] : CERTIDOES_EXIGIDAS;
}

export function totalCertidoes(postoGrad: string | null | undefined): number {
  return certidoesExigidas(postoGrad).length;
}

export function rotuloCertidao(ordem: number): string {
  const c = [...CERTIDOES_EXIGIDAS, CERTIDAO_TRF6].find((x) => x.ordem === ordem);
  return c ? `${c.orgao} — ${c.descricao}` : `Certidão ${ordem}`;
}
