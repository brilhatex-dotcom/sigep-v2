import { paraData } from "@/lib/datas";

/* =========================================================================
   DATA DE INCLUSÃO PELA BARRA — conferência do P/1.

   A barra diz a turma: "402/18" é da turma de 2018, e a turma inteira é
   incluída na mesma data. Então, para quem está SEM a data de inclusão na
   ficha (ou com uma data de outro ano que não o da barra — erro de
   digitação), a data dos COLEGAS DA MESMA BARRA é a melhor referência: a mais
   comum entre os que têm a data certa.

   Sem colega com data, não há referência: o P/1 anota na ficha (observações)
   que a data de inclusão está em branco, para ser completada depois.
   ========================================================================= */

// "402/18" -> 2018; "158/92" -> 1992; "12/2001" -> 2001. Sem barra -> null.
export function anoDaBarra(barra: string | null | undefined): number | null {
  const m = String(barra || "").trim().match(/^\d+\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[1].length === 4 ? n : n >= 30 ? 1900 + n : 2000 + n;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type FichaInclusao = {
  id: string; postoGrad: string | null; nome: string | null; nomeGuerra: string | null;
  numeroBarra: string | null; dataPromocao?: string | null; dataIncorp: string | null; observacoes: string | null;
};

export type Conferencia = {
  id: string; postoGrad: string; nome: string; nomeGuerra: string; numeroBarra: string;
  dataAtual: string | null;       // aaaa-mm-dd, ou null quando em branco/ilegível
  motivo: "em_branco" | "fora_do_ano";
  sugestao: string | null;        // aaaa-mm-dd — a data mais comum entre os colegas da barra
  colegas: number;                // quantos colegas da barra têm essa data
  anotado: boolean;               // a ficha já tem a observação de "em branco"
};

export const OBS_INCLUSAO = "DATA DE INCLUSÃO EM BRANCO — FALTA INFORMAR (P/1).";
// a data existe mas é de outro ano que não o da barra: não está em branco, está a conferir
export const OBS_INCLUSAO_CONFERIR = "DATA DE INCLUSÃO A CONFERIR — NÃO BATE COM O ANO DA BARRA (P/1).";

/* Quem precisa conferir e a sugestão de cada um. */
export function conferirInclusoes(fichas: FichaInclusao[]): Conferencia[] {
  // por ano de barra: quantas vezes cada data aparece entre quem TEM data do mesmo ano
  const porAno = new Map<number, Map<string, number>>();
  for (const f of fichas) {
    const ano = anoDaBarra(f.numeroBarra);
    const d = paraData(f.dataIncorp);
    if (!ano || !d || d.getFullYear() !== ano) continue;
    const m = porAno.get(ano) ?? new Map<string, number>();
    m.set(iso(d), (m.get(iso(d)) ?? 0) + 1);
    porAno.set(ano, m);
  }
  const maisComum = (ano: number | null) => {
    const m = ano ? porAno.get(ano) : undefined;
    if (!m) return null;
    // a mais frequente; no empate, a mais antiga
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  };

  const saida: Conferencia[] = [];
  for (const f of fichas) {
    const ano = anoDaBarra(f.numeroBarra);
    const d = paraData(f.dataIncorp);
    let motivo: Conferencia["motivo"] | null = null;
    if (!d) motivo = "em_branco";
    else if (ano && d.getFullYear() !== ano) motivo = "fora_do_ano";
    if (!motivo) continue;
    const ref = maisComum(ano);
    saida.push({
      id: f.id,
      postoGrad: f.postoGrad || "", nome: f.nome || "", nomeGuerra: f.nomeGuerra || "", numeroBarra: f.numeroBarra || "",
      dataAtual: d ? iso(d) : null,
      motivo,
      sugestao: ref ? ref[0] : null,
      colegas: ref ? ref[1] : 0,
      anotado: (f.observacoes || "").includes(motivo === "em_branco" ? OBS_INCLUSAO : OBS_INCLUSAO_CONFERIR),
    });
  }
  return saida;
}

// a anotação certa para a ficha: em branco, ou com data a conferir
export function observacaoPara(dataIncorp: string | null | undefined): string {
  return paraData(dataIncorp ?? null) ? OBS_INCLUSAO_CONFERIR : OBS_INCLUSAO;
}

// acrescenta a observação na ficha sem apagar o que já estava lá (e sem repetir)
export function comObservacao(atual: string | null | undefined, texto: string = OBS_INCLUSAO): string {
  const t = String(atual || "").trim();
  if (t.includes(texto)) return t;
  return t ? `${t}\n${texto}` : texto;
}
