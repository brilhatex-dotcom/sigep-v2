/* =========================================================================
   DOCUMENTOS OFICIAIS — regras que a tela e o servidor dividem (sem banco).

   O mural guarda BG, BG reservado, portaria, edital, nota... com número,
   data e o texto do PDF, para achar pela busca. E a ficha, que vive citando
   "BG nº 134 de 22/07/2022", passa a levar direto ao boletim — quando ele
   estiver no mural.
   ========================================================================= */

export const TIPOS_DOCUMENTO = ["BG", "BG Reservado", "Portaria", "Edital", "Nota", "Ofício", "Outro"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type DocumentoOficial = {
  id: string;
  tipo: string;
  numero: string;
  data: string;          // aaaa-mm-dd
  titulo: string;
  orgao: string;
  restrito: boolean;     // só o P/1 (admin) vê
  nomeArquivo: string;
  tamanho: number;
  temTexto: boolean;     // false = PDF de imagem: acha só por número/título
  enviadoPor: string;
  enviadoEm: string;
  trecho?: string;       // na busca: o pedaço do texto onde a palavra aparece
};

// "Ação Nº 134" -> "ACAO N 134": a busca não liga para acento nem caixa
export function normalizarBusca(t: string): string {
  return (t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

// "004" e "4" são o mesmo BG
export const numeroSemZeros = (n: string) => (n || "").trim().replace(/^0+(?=\d)/, "");

/* As citações de BG num texto livre, com o número e o ano:
     "BG nº 134 de 22/07/2022", "BG 009/2014", "01/01/2015 BG 004"
   Sem ano junto, vale a data que vier antes no mesmo trecho. */
export type CitacaoBG = { inicio: number; fim: number; numero: string; ano: string | null };

export function citacoesDeBG(texto: string): CitacaoBG[] {
  const out: CitacaoBG[] = [];
  const re = /\bBG\s*(?:n[º°o.]?\s*)?(\d{1,4})(?:\s*\/\s*(\d{4})|\s+de\s+\d{1,2}\/\d{1,2}\/(\d{4}))?/gi;
  for (const m of texto.matchAll(re)) {
    let ano = m[2] || m[3] || null;
    if (!ano) {
      const antes = texto.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
      ano = /(\d{1,2})\/(\d{1,2})\/(\d{4})\D*$/.exec(antes)?.[3] ?? null;
    }
    out.push({ inicio: m.index ?? 0, fim: (m.index ?? 0) + m[0].length, numero: numeroSemZeros(m[1]), ano });
  }
  return out;
}

export const linkDoBG = (numero: string, ano: string | null) =>
  `/documentos?bg=${encodeURIComponent(numero)}${ano ? `&ano=${ano}` : ""}`;

export const dataBR = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
};
