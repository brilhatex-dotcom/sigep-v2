import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   A RÉGUA DE ANTIGUIDADE, num lugar só.

   Morava dentro da tela "Efetivo por Antiguidade". Saiu para cá porque a
   Planilha Padrão da promoção precisa listar o efetivo NA MESMA ORDEM — e
   duas cópias da regra divergiriam na primeira correção feita numa só. Um
   sargento que aparece em 3º numa tela e em 5º na outra é o tipo de coisa que
   a CPPPM devolve.

   Ordem: posto/graduação -> data da última promoção (mais antiga primeiro)
   -> número de barra (ano + número) -> nome.
   ========================================================================= */

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* ordemData: transforma QUALQUER formato de data em um numero aaaammdd
   para ordenacao. Aceita:
     - vazio/null                         -> 99999999 (vai pro fim)
     - ISO  "2025-08-24" (com/sem hora)   -> 20250824
     - BR   "24/08/2025"                  -> 20250824
     - Date cru "Sun Aug 24 2025 00:00.." -> 20250824
   Datas "1970..." (epoch vazio) tambem vao pro fim. */
export function ordemData(valor: string | null): number {
  if (!valor || !valor.trim()) return 99999999;
  const s = valor.trim();

  // ISO: aaaa-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const n = +`${iso[1]}${iso[2]}${iso[3]}`;
    return iso[1] === "1970" ? 99999999 : n;
  }

  // BR: dd/mm/aaaa
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const n = +`${br[3]}${br[2]}${br[1]}`;
    return br[3] === "1970" ? 99999999 : n;
  }

  // Date cru em ingles: "Sun Aug 24 2025 ..." -> pega "Aug 24 2025"
  const en = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (en) {
    const mes = MESES[en[1].toLowerCase()];
    if (mes) {
      const dia = +en[2], ano = +en[3];
      if (ano === 1970) return 99999999;
      return ano * 10000 + mes * 100 + dia;
    }
  }

  // ultimo recurso: deixa o Date tentar (ex.: outros formatos reconheciveis)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const ano = dt.getUTCFullYear();
    if (ano === 1970) return 99999999;
    return ano * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }

  return 99999999;
}

/* ordemBarra: desempate por numero de barra interpretado como ANO + NUMERO.
   "158/92" -> ano 1992, nº 158 ; "008/93" -> ano 1993, nº 008.
   Mais antigo = ano menor; no mesmo ano, numero menor.
   Retorna um numero comparavel: ano(4) * 100000 + numero(5). Anos de 2 digitos
   viram 19xx se >= 30, senao 20xx (ajuste a regra se precisar). Sem barra -> fim. */
export function ordemBarra(barra: string | null): number {
  if (!barra || !barra.trim()) return 9_99999999;
  const m = barra.trim().match(/^(\d+)\s*\/\s*(\d{2,4})$/);
  if (!m) return 9_99999999;
  const num = parseInt(m[1], 10) || 0;
  let ano = parseInt(m[2], 10);
  if (m[2].length === 2) ano = ano >= 30 ? 1900 + ano : 2000 + ano; // 92->1992, 07->2007
  return ano * 100000 + num;
}


type ParaAntiguidade = { postoGrad: string | null; dataPromocao: string | null; numeroBarra: string | null; nome: string | null };

export function compararAntiguidade(a: ParaAntiguidade, b: ParaAntiguidade): number {
  const pa = classificarPatente(a.postoGrad).ordem;
  const pb = classificarPatente(b.postoGrad).ordem;
  if (pa !== pb) return pa - pb;
  const da = ordemData(a.dataPromocao), db = ordemData(b.dataPromocao);
  if (da !== db) return da - db;
  const ba = ordemBarra(a.numeroBarra), bb = ordemBarra(b.numeroBarra);
  if (ba !== bb) return ba - bb;
  return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
}
