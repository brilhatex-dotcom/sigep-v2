/* =========================================================================
   CERTIDÃO PARA MEDALHA DO SERVIÇO POLICIAL MILITAR (10, 20 e 30 anos)

   O modelo é o ANEXO I da 5ª Seção do EMG: o P/1 da UPM certifica a data de
   inclusão (com o BG que a publicou) e os requisitos do regulamento, um a
   um, marcados com "( X )". O Cmt dá o VISTO no alto, à esquerda.

   Aqui fica o CONTEÚDO (puro, sem arquivo): serve à prévia da tela e ao Word
   (certidaoMedalhaDocx), para os dois dizerem exatamente a mesma coisa.
   ========================================================================= */

export const ANOS_MEDALHA = [10, 20, 30] as const;
export type AnosMedalha = (typeof ANOS_MEDALHA)[number];

// os requisitos do modelo, na ordem (com os erros de digitação dele corrigidos)
export const REQUISITOS_MEDALHA = [
  "não foi condenado por crime no fórum militar ou por crime ou contravenção penal no fórum civil, ainda que tenha havido perdão da pena;",
  "não se encontra e nem foi punido por transgressão disciplinar que mostre negligência ou desinteresse pelo serviço policial militar ou que afete a moralidade da corporação, que o incompatibilize com o escrito do art. 1º deste Regulamento;",
  "não está nem esteve no COMPORTAMENTO MAU ou INSUFICIENTE;",
  "não se encontra cumprindo punição nem foi punido por ingestão de bebida alcoólica;",
  "não foi punido disciplinarmente por transgressão de natureza grave - só podendo ser contemplado após permanecer durante 05 (cinco) anos sem sofrer qualquer tipo de punição disciplinar;",
  "não está respondendo a IPM;",
  "não está respondendo a processo crime na justiça.",
];

export type DadosCertidaoMedalha = {
  anos: AnosMedalha;
  militar: string;        // "SD PM 169/24 GLEYDSON ROBSON ROCHA DA SILVA"
  matricula: string;
  idPmma: string;
  dataInclusao: string;   // dd/mm/aaaa
  bgInclusao: string;     // "143 de 03/08/1992"
  requisitos: boolean[];  // um por item de REQUISITOS_MEDALHA (true = "( X )")
  chefe: string;          // quem digita e assina: "1º TEN QOEM PAULO SILAS ..."
  chefeFuncao: string;    // "Chefe do P/1 do 18º BPM"
  cidade: string;         // "Presidente Dutra"
  data: string;           // aaaa-mm-dd (a data da assinatura)
};

export const UPM = "18º BPM";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// "2026-10-27" -> "27 de outubro de 2026"
export function dataPorExtenso(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

// o que ainda não se sabe sai como lacuna à vista, para preencher à mão
const LACUNA = "________";
const ou = (v: string, lacuna = LACUNA) => (String(v || "").trim() || lacuna);

export type Trecho = { t: string; b?: boolean };
export type ParagrafoCertidao =
  | { tipo: "corpo"; trechos: Trecho[] }
  | { tipo: "item"; marcado: boolean; texto: string };

/* O corpo da certidão, do "Com a finalidade..." até a data. */
export function paragrafosCertidaoMedalha(d: DadosCertidaoMedalha): ParagrafoCertidao[] {
  const bg = ou(d.bgInclusao, "____ de __/__/____");
  return [
    {
      tipo: "corpo",
      trechos: [
        { t: `Com a finalidade de instruir o requerimento que trata do pedido de Medalha do Serviço Policial Militar (${d.anos} anos) do ` },
        { t: ou(d.militar), b: true },
        { t: ", matrícula nº " }, { t: ou(d.matricula), b: true },
        { t: ", ID nº " }, { t: ou(d.idPmma), b: true },
        { t: `, do ${UPM}, CERTIFICO que, revendo os arquivos do ${UPM}, foi constatado o seguinte: O requerente incorporou na PMMA, em ` },
        { t: ou(d.dataInclusao, "__/__/____"), b: true },
        { t: ", conforme fez público o " },
        { t: `BG nº ${bg}`, b: true },
        { t: "; e atende aos requisitos abaixo:" },
      ],
    },
    ...REQUISITOS_MEDALHA.map((texto, i) => ({ tipo: "item" as const, marcado: d.requisitos[i] !== false, texto })),
    {
      tipo: "corpo",
      trechos: [
        { t: `O referido é verdade e dou fé. Eu, ${ou(d.chefe)}, ${ou(d.chefeFuncao).replace(/^CHEFE/i, "chefe")}, digitei a presente certidão, que vai datada e assinada. Quartel do ${UPM} em ${ou(d.cidade)}/MA, ${dataPorExtenso(d.data)}.` },
      ],
    },
  ];
}

// "( X )" ou "(   )" na frente de cada requisito
export const marca = (marcado: boolean) => (marcado ? "( X )" : "(    )");

export function nomeArquivoCertidaoMedalha(d: DadosCertidaoMedalha): string {
  const base = `Certidao Medalha ${d.anos} anos - ${d.militar}`;
  return base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}
