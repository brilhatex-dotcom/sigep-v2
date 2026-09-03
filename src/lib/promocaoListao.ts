import { PATENTES, classificarPatente } from "@/lib/patentes";

/* =========================================================================
   LEITURA DO "LISTÃO" DE PROMOÇÕES DA PMMA

   Três vezes por ano a Comissão de Promoção publica a relação de promovidos.
   O papel sempre tem a mesma cara:

       RELAÇÃO DE PROMOVIDOS AGOSTO DE 2026
       DE 1º SARGENTO PM PARA SUBTENENTE PM
       COMBATENTES
       ORD | NUM     | NOME                    | MAT    | CRITÉRIO   | QPMP
       1.  | 861/93  | FRANCISCO NERIVALDO ... | 106146 | ANTIGUIDADE| 0

   Este arquivo só transforma TEXTO em linhas organizadas. Não fala com banco
   nem com tela — assim dá para testar cada caso na mão.

   O texto normalmente vem de OCR (o listão costuma chegar fotocopiado), então
   tudo aqui é escrito supondo erro de leitura: "O" no lugar de zero, "l" no
   lugar de um, coluna que escorrega, nome que quebra em duas linhas. Nada
   disso pode derrubar a leitura das outras linhas — no fim quem confere é o
   P/1, linha por linha, na tela.
   ========================================================================= */

export type LinhaListao = {
  ord: number | null;      // a numeração do próprio listão (1, 2, 3…)
  num: string;             // coluna NUM = número/barra (ex.: "861/93")
  nome: string;
  mat: string;             // coluna MAT = matrícula (ou o ID, da barra 18+)
  criterio: string;        // ANTIGUIDADE | MERECIMENTO | TEMPO DE SERVIÇO
  qpmp: string;
  deOrdem: number;         // posto de origem (ordem de PATENTES)
  paraOrdem: number;       // posto de destino
  dePosto: string;         // rótulo legível, ex.: "1º Sargento"
  paraPosto: string;       // ex.: "Subtenente"
  quadro: string;          // COMBATENTES | ESPECIALISTAS | ""
  bruta: string;           // a linha como foi lida, para conferência na tela
};

export type ResultadoLeitura = {
  titulo: string;          // "RELAÇÃO DE PROMOVIDOS AGOSTO DE 2026", se achar
  linhas: LinhaListao[];
  ignoradas: string[];     // linhas que pareciam dados mas não deu para ler
};

/* ---------------------------------------------------------------- ajudas */

// Tira acento e deixa maiúsculo, para comparar sem sofrer com "Ç" e "Ú".
function limpo(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* Conserta o que o OCR mais erra DENTRO de um número: letras que se parecem
   com dígito. Só é usado onde já sabemos que o conteúdo é numérico — nunca
   no nome, senão "JOSE" viraria "J0SE". */
function soDigitos(s: string): string {
  return (s || "")
    .replace(/[OQ]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/S/g, "5")
    .replace(/[^0-9]/g, "");
}

/* As letras que o OCR confunde com dígito. Tudo aqui já passou por limpo(),
   ou seja, está em MAIÚSCULA — por isso a lista é só de maiúsculas. */
const D = "0-9OQILS";

/* Um pedaço só vale como número se a MAIORIA já for dígito de verdade.
   Sem esta trava, "SILAS" ou "LILO" entrariam como matrícula. */
function pareceNumero(tok: string, minimo = 4): boolean {
  const so = tok.replace(/[.,:\s]/g, "");
  if (so.length < minimo) return false;
  if (!new RegExp(`^[${D}]+$`).test(so)) return false;
  const digitos = (so.match(/\d/g) || []).length;
  return digitos / so.length >= 0.6;
}

const ROTULO = new Map(PATENTES.map((p) => [p.ordem, p.rotulo]));

/* ------------------------------------------------------- cabeçalhos ----- */

/* "DE 1º SARGENTO PM PARA SUBTENENTE PM" -> { de: 9, para: 8 }
   "DE SOLDADO PM PARA CABO PM – QPMP-0"  -> { de: 13, para: 12 }

   Aceita qualquer escrita que o classificador de patentes já entenda, e
   confere se faz sentido: promoção sobe exatamente um degrau. Se vier
   invertido ou com dois degraus, é erro de leitura e o cabeçalho é
   descartado (as linhas seguintes ficam sem seção e são ignoradas, em vez
   de entrarem com o posto errado). */
export function lerCabecalhoSecao(linha: string): { de: number; para: number } | null {
  const t = limpo(linha);
  if (!/^DE\s+/.test(t) || !/\sPARA\s/.test(t)) return null;

  const m = t.match(/^DE\s+(.+?)\s+PARA\s+(.+)$/);
  if (!m) return null;

  // corta o rabo do tipo "– QPMP-0" que às vezes vem depois do posto
  const alvo = m[2].split(/[-–—]/)[0];

  const de = classificarPatente(m[1]).ordem;
  const para = classificarPatente(alvo).ordem;
  if (de === 99 || para === 99) return null;
  // subir de posto = a ordem diminui exatamente 1 (13 soldado -> 12 cabo)
  if (de - para !== 1) return null;
  return { de, para };
}

const QUADROS = ["COMBATENTES", "ESPECIALISTAS", "MUSICOS", "MUSICOS PM"];

function lerQuadro(linha: string): string | null {
  const t = limpo(linha).replace(/[^A-Z ]/g, "").trim();
  return QUADROS.includes(t) ? t : null;
}

/* ----------------------------------------------------------- critério --- */

/* Devolve o critério e onde ele começa na linha, porque tudo que vem ANTES
   dele é ORD + NUM + NOME + MAT, e o que vem depois é só o QPMP. */
function acharCriterio(t: string): { criterio: string; ini: number; fim: number } | null {
  const tentativas: [RegExp, string][] = [
    [/\bANTIGUIDADE\b/, "ANTIGUIDADE"],
    [/\bMERECIMENTO\b/, "MERECIMENTO"],
    [/\bT\s*\.?\s*DE\s+SERVI[CÇ]O\b/, "TEMPO DE SERVIÇO"],
    [/\bTEMPO\s+DE\s+SERVI[CÇ]O\b/, "TEMPO DE SERVIÇO"],
  ];
  for (const [re, nome] of tentativas) {
    const m = t.match(re);
    if (m && m.index !== undefined) return { criterio: nome, ini: m.index, fim: m.index + m[0].length };
  }
  return null;
}

/* ------------------------------------------------------------ uma linha - */

/* Lê uma linha de dados. Estratégia: ancorar no CRITÉRIO (que é uma palavra
   conhecida) e trabalhar para os lados, em vez de tentar um único casamento
   gigante — assim um borrão no meio do nome não derruba a linha inteira. */
export function lerLinhaDados(bruta: string): Omit<LinhaListao, "deOrdem" | "paraOrdem" | "dePosto" | "paraPosto" | "quadro"> | null {
  const t = limpo(bruta).replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // cabeçalho da tabela, não é dado
  if (/^ORD\b/.test(t)) return null;

  const c = acharCriterio(t);
  if (!c) return null;

  const antes = t.slice(0, c.ini).trim();
  const depois = t.slice(c.fim).trim();

  /* Trabalha por PEDAÇOS separados por espaço, nunca por posição no meio do
     texto. Sem isso, um nome terminado em O ou S ("LEMOS") se colava na
     matrícula seguinte e as duas colunas viravam uma só. */
  const toks = antes.split(" ").filter(Boolean);

  /* MAT é o último pedaço numérico com 5 a 8 dígitos — cobre a matrícula
     antiga (6) e o ID novo, da barra 18 em diante (7). */
  let iMat = -1;
  let mat = "";
  for (let i = toks.length - 1; i >= 0; i--) {
    if (!pareceNumero(toks[i], 5)) continue;
    const cru = soDigitos(toks[i]);
    if (cru.length >= 5 && cru.length <= 8) { iMat = i; mat = cru; break; }
  }
  if (iMat < 0) return null;

  /* ORD: o primeiro pedaço, quando é um número curto ("12.", "236,"). */
  let j = 0;
  let ord: number | null = null;
  if (toks.length && pareceNumero(toks[0], 1) && soDigitos(toks[0]).length <= 4) {
    ord = parseInt(soDigitos(toks[0]), 10);
    j = 1;
  }

  /* NUM: "861/93", "0367/02", "05/2017" — ou, mais raro, só o ano "2022". */
  let num = "";
  const seguinte = toks[j] || "";
  const comBarra = seguinte.match(new RegExp(`^([${D}]{1,5})/([${D}]{2,4})$`));
  if (comBarra) {
    num = `${soDigitos(comBarra[1])}/${soDigitos(comBarra[2])}`;
    j++;
  } else if (j < iMat && pareceNumero(seguinte, 4) && soDigitos(seguinte).length === 4) {
    num = soDigitos(seguinte);
    j++;
  }

  let nome = toks.slice(j, iMat).join(" ")
    .replace(/[^A-ZÀ-Ú' ]/gi, " ").replace(/\s+/g, " ").trim();
  if (nome.length < 4) return null;   // sem nome não há o que conferir

  const qpmp = (depois.match(/\d+/) || [""])[0];

  return { ord, num, nome, mat, criterio: c.criterio, qpmp, bruta: bruta.trim() };
}

/* ------------------------------------------------------ o texto inteiro - */

/* Nome que quebrou em duas linhas dentro da célula: a segunda linha vem
   sozinha, com o rabo do nome ("NASCIMENTO", "DA SILVA"). Nesse caso ela
   pertence à linha anterior.

   Duas armadilhas que já apareceram no teste e por isso estão barradas aqui:
   o CABEÇALHO da tabela, que se repete a cada página, e a ASSINATURA do
   Comandante-Geral no fim — os dois grudavam no nome do último promovido.
   O que separa: no listão os nomes saem em MAIÚSCULAS, e a assinatura vem
   em caixa mista. */
const PALAVRAS_QUE_NAO_SAO_NOME =
  /^(ORD|NUM|NOME|MAT|CRITERIO|QPMP|CEL|TEN|CAP|MAJ|SUB|SGT|CB|SD|QOPM|QPMP\d*|COMANDANTE|GERAL|PMMA|ESTADO|MARANHAO|SECRETARIA|SEGURANCA|PUBLICA|POLICIA|MILITAR|COMISSAO|PROMOCAO|PROMOVIDOS|PRACAS|RELACAO)$/;

function ehContinuacaoDeNome(t: string): boolean {
  const cru = t.trim();
  // rabo de nome é curto; parágrafo comprido é outra coisa
  if (cru.length < 3 || cru.length > 45) return false;
  if (/\d/.test(cru)) return false;
  // caixa mista = assinatura/rodapé, não é nome de promovido
  if (cru !== cru.toUpperCase()) return false;

  const s = limpo(cru);
  if (QUADROS.includes(s)) return false;
  if (!/^[A-ZÀ-Ú' ]+$/.test(s)) return false;

  const palavras = s.split(" ").filter(Boolean);
  if (palavras.length > 4) return false;                       // nome não quebra em 5 pedaços
  if (palavras.some((p) => PALAVRAS_QUE_NAO_SAO_NOME.test(p))) return false;
  return true;
}

export function lerListao(texto: string): ResultadoLeitura {
  const linhas = (texto || "").split(/\r?\n/);
  const saida: LinhaListao[] = [];
  const ignoradas: string[] = [];
  let titulo = "";
  let secao: { de: number; para: number } | null = null;
  let quadro = "";

  for (const bruta of linhas) {
    const t = bruta.trim();
    if (!t) continue;

    if (!titulo && /RELA[CÇ][AÃ]O\s+DE\s+PROMOVIDOS/i.test(limpo(t))) {
      titulo = t.replace(/\s+/g, " ").trim();
      continue;
    }

    const cab = lerCabecalhoSecao(t);
    if (cab) { secao = cab; quadro = ""; continue; }

    const q = lerQuadro(t);
    if (q) { quadro = q; continue; }

    const dados = lerLinhaDados(t);
    if (dados) {
      // linha de dados sem saber de qual promoção é: não dá para usar
      if (!secao) { ignoradas.push(t); continue; }
      saida.push({
        ...dados,
        deOrdem: secao.de,
        paraOrdem: secao.para,
        dePosto: ROTULO.get(secao.de) || "",
        paraPosto: ROTULO.get(secao.para) || "",
        quadro,
      });
      continue;
    }

    // rabo de um nome que quebrou a linha
    if (saida.length && ehContinuacaoDeNome(t)) {
      const ultima = saida[saida.length - 1];
      ultima.nome = (ultima.nome + " " + limpo(t)).replace(/\s+/g, " ").trim();
      ultima.bruta = ultima.bruta + " " + t.trim();
      continue;
    }

    // guarda o que parecia dado (tem número comprido) mas não deu para ler
    if (/\d{5,}/.test(t)) ignoradas.push(t);
  }

  return { titulo, linhas: saida, ignoradas };
}

/* ------------------------------------------------- posto novo, no estilo -
   O campo Posto_Grad do efetivo é texto livre e cada ficha pode estar escrita
   de um jeito ("Soldado", "SD PM", "SD"). Ao promover, o novo valor sai no
   MESMO estilo da ficha, para a lista do efetivo não ficar remendada.        */

const ABREV: Record<number, string> = {
  1: "CEL", 2: "TEN CEL", 3: "MAJ", 4: "CAP", 5: "1º TEN", 6: "2º TEN",
  7: "ASP OF", 8: "SUB TEN", 9: "1º SGT", 10: "2º SGT", 11: "3º SGT",
  12: "CB", 13: "SD",
};

export function postoNoMesmoEstilo(atual: string | null, alvoOrdem: number): string {
  const rotulo = ROTULO.get(alvoOrdem) || "";
  const abrev = ABREV[alvoOrdem] || rotulo.toUpperCase();
  const t = limpo(atual);
  if (!t) return rotulo;

  // a ficha usa nome por extenso ("Soldado", "1º Sargento")?
  const porExtenso = /SOLDADO|CABO|SARGENTO|TENENTE|CORONEL|MAJOR|CAPITAO|ASPIRANTE/.test(t);
  // sufixo do quadro que a ficha já usa (" PM", " QPMP-0"…)
  const sufixo = t.match(/\b(PM|QPMP[-\s]?\d*)\b\s*$/);
  const cauda = sufixo ? " " + sufixo[1].replace(/\s+/g, " ") : "";

  return (porExtenso ? rotulo : abrev) + cauda;
}
