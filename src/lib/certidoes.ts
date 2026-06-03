// ==========================================================
//  As 8 certidoes exigidas para promocao, na ORDEM OFICIAL.
//  (Por enquanto fixas aqui; editaveis no futuro.)
//  A "ordem" e usada como chave (1..8) e define a ordem no
//  PDF unificado.
// ==========================================================

export type CertidaoExigida = {
  ordem: number;
  orgao: string;
  descricao: string;
};

export const CERTIDOES_EXIGIDAS: CertidaoExigida[] = [
  { ordem: 1, orgao: "TJMA", descricao: "Certidão Estadual 1º Grau (Ações Penais)" },
  { ordem: 2, orgao: "TJMA", descricao: "Certidão de Distribuição 2º Grau (Ações Penais)" },
  { ordem: 3, orgao: "TJMA", descricao: "Certidão Estadual 1º Grau (Justiça Militar Estadual)" },
  { ordem: 4, orgao: "TRF 1ª Região", descricao: "Certidão Criminal Negativa" },
  { ordem: 5, orgao: "TRF 2ª Região", descricao: "Certidão Criminal Negativa" },
  { ordem: 6, orgao: "TRF 3ª Região", descricao: "Certidão Criminal Negativa" },
  { ordem: 7, orgao: "TRF 4ª Região", descricao: "Certidão Criminal Negativa" },
  { ordem: 8, orgao: "TRF 5ª Região", descricao: "Certidão Criminal Negativa" },
];

export const TOTAL_CERTIDOES = CERTIDOES_EXIGIDAS.length;

export function rotuloCertidao(ordem: number): string {
  const c = CERTIDOES_EXIGIDAS.find((x) => x.ordem === ordem);
  return c ? `${c.orgao} — ${c.descricao}` : `Certidão ${ordem}`;
}
