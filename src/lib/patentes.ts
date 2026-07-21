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

  if (tem(/sub\s*tenente/) || tem(/\bsubten/) || tem(/\bsub ten\b/)) {
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

// Extrai o numero da barra "686/16" -> [ano, seq] para desempate.
export function chaveAntiguidade(numeroBarra: string | null): [number, number] {
  const m = (numeroBarra ?? "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return [9999, 999999];
  const seq = parseInt(m[1], 10);
  const ano = parseInt(m[2], 10);
  return [ano, seq];
}

// Converte uma data (formato cru do Sheets, ISO, etc.) em milissegundos.
export function dataParaMs(valor: string | null): number | null {
  if (!valor || !String(valor).trim()) return null;
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// "Carimbo de antiguidade" para ordenar DENTRO do mesmo posto:
//  - usa a DATA DE PROMOCAO quando existir (criterio principal);
//  - se nao houver, usa o ANO do Numero/Barra como aproximacao;
//  - se nem isso, joga para o fim.
// Menor = mais antigo = mais graduado na antiguidade.
export function carimboAntiguidade(
  numeroBarra: string | null,
  dataPromocao: string | null
): number {
  const promo = dataParaMs(dataPromocao);
  if (promo !== null) return promo;
  const [ano] = chaveAntiguidade(numeroBarra);
  if (ano !== 9999) return Date.UTC(2000 + ano, 0, 1);
  return Number.POSITIVE_INFINITY;
}

export type EntradaAntiguidade = {
  postoGrad: string | null;
  dataPromocao?: string | null;
  numeroBarra?: string | null;
  nome?: string | null;
};

// Comparador OFICIAL de antiguidade, unico para todo o SIGEP (efetivo,
// escalas, documentos): ordena por
//   1) posto/graduacao (mais alto primeiro),
//   2) data da ultima promocao (mais antiga primeiro),
//   3) Numero/Barra (ano + sequencia),
//   4) nome (desempate estavel).
// Retorno < 0 => "a" e mais antigo/graduado e vai PRIMEIRO.
export function compararAntiguidade(
  a: EntradaAntiguidade,
  b: EntradaAntiguidade
): number {
  const pa = classificarPatente(a.postoGrad ?? null).ordem;
  const pb = classificarPatente(b.postoGrad ?? null).ordem;
  if (pa !== pb) return pa - pb;

  const da = dataParaMs(a.dataPromocao ?? null) ?? Number.POSITIVE_INFINITY;
  const db = dataParaMs(b.dataPromocao ?? null) ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;

  const [anoA, seqA] = chaveAntiguidade(a.numeroBarra ?? null);
  const [anoB, seqB] = chaveAntiguidade(b.numeroBarra ?? null);
  if (anoA !== anoB) return anoA - anoB;
  if (seqA !== seqB) return seqA - seqB;

  return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
}
