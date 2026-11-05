// ==========================================================
//  Hierarquia de postos/graduacoes da PM (do mais alto ao mais
//  baixo). Usado para ordenar, agrupar e contar o efetivo.
// ==========================================================

export type Patente = { ordem: number; rotulo: string };

// Ordem 1 = mais alto. Quanto menor o numero, mais alto o posto.
export const PATENTES: Patente[] = [
  { ordem: 1, rotulo: "Coronel" },
  { ordem: 2, rotulo: "Tenente-Coronel" },
  { ordem: 3, rotulo: "Major" },
  { ordem: 4, rotulo: "Capitão" },
  { ordem: 5, rotulo: "1º Tenente" },
  { ordem: 6, rotulo: "2º Tenente" },
  { ordem: 7, rotulo: "Aspirante" },
  { ordem: 8, rotulo: "Subtenente" },
  { ordem: 9, rotulo: "1º Sargento" },
  { ordem: 10, rotulo: "2º Sargento" },
  { ordem: 11, rotulo: "3º Sargento" },
  { ordem: 12, rotulo: "Cabo" },
  { ordem: 13, rotulo: "Soldado" },
];

const SEM_PATENTE: Patente = { ordem: 99, rotulo: "Não informado" };

function patente(ordem: number): Patente {
  return PATENTES.find((p) => p.ordem === ordem) ?? SEM_PATENTE;
}

// Normaliza o texto do posto para comparacao:
//  - NFKD converte "º"->"o", superscritos->numeros
//  - remove acentos, deixa minusculo
//  - troca pontuacao por espaco e colapsa espacos
// Assim "1º Tenente", "1o Tenente", "1 Ten", "Ten Cel", "Sd PM",
// "Cb" etc. ficam comparaveis.
function normalizar(s: string | null): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A ORDEM dos testes importa: Subtenente e Tenente-Coronel sao
// checados antes de "Tenente"/"Coronel" porque contem essas palavras.
export function classificarPatente(postoGrad: string | null): Patente {
  const t = normalizar(postoGrad);
  if (!t) return SEM_PATENTE;

  const num = (t.match(/[123]/) || [])[0];
  const tem = (re: RegExp) => re.test(t);

  // "ST" sozinho tambem e Subtenente (e como o posto aparece abreviado)
  if (tem(/sub\s*tenente/) || tem(/\bsubten/) || tem(/\bsub ten\b/) || tem(/\bst\b/)) {
    return patente(8);
  }
  if (tem(/tenente\s*coronel/) || tem(/\bten\s*cel\b/) || tem(/\btc\b/)) {
    return patente(2);
  }
  if (tem(/tenente/) || tem(/\bten\b/)) {
    return num === "1" ? patente(5) : patente(6);
  }
  if (tem(/coronel/) || tem(/\bcel\b/)) return patente(1);
  if (tem(/major/) || tem(/\bmaj\b/)) return patente(3);
  if (tem(/capitao/) || tem(/\bcap\b/)) return patente(4);
  if (tem(/aspirante/) || tem(/\basp\b/)) return patente(7);
  if (tem(/sargento/) || tem(/\bsarg\b/) || tem(/\bsgt\b/)) {
    return num === "1" ? patente(9) : num === "2" ? patente(10) : patente(11);
  }
  if (tem(/\bcabo\b/) || tem(/\bcb\b/)) return patente(12);
  if (tem(/soldado/) || tem(/\bsd\b/)) return patente(13);

  return SEM_PATENTE;
}

/* A comparação de antiguidade (posto, data da promoção, barra, nome) mora em
   lib/antiguidade.ts — uma régua só para o sistema inteiro. */
