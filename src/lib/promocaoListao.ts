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
  /* Segundo número, quando o documento traz os dois (o Diário Oficial põe
     matrícula E ID, às vezes em ordem trocada). O cruzamento tenta os dois
     contra matrícula e contra ID, em vez de depender do cabeçalho. */
  mat2?: string;
  /* Data a contar do próprio ato, quando ele declara uma. No Diário cada ato
     tem a sua — há promoção por ressarcimento de preterição que retroage a
     outro mês. Vazio = usa a data do lote, escolhida na tela. */
  dataAto?: string;
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

/* O maior trecho seguido de "coisa que pode ser dígito" dentro de um pedaço.
   Serve para tirar a sujeira que a borda da tabela deixa colada no número. */
function maiorTrechoNumerico(tok: string): string {
  const achados = tok.match(new RegExp(`[${D}]+`, "g")) || [];
  return achados.reduce((a, b) => (b.length > a.length ? b : a), "");
}

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

/* Promoção sobe UM posto. A única exceção é a passagem de praça a oficial,
   que pula o Aspirante: Subtenente (8) vai direto a 2º Tenente (6), pelos
   quadros QOE e QOA — é assim no Diário Oficial de agosto/2026, com dez
   Subtenentes. Sem essa exceção, todos eles seriam recusados como "salto
   inválido"; sem a regra do degrau único, um erro de leitura viraria uma
   promoção absurda. */
export function promocaoPlausivel(de: number, para: number): boolean {
  if (de === 99 || para === 99) return false;
  if (de - para === 1) return true;
  return de === 8 && para === 6;
}

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
   dele é ORD + NUM + NOME + MAT, e o que vem depois é só o QPMP.

   As expressões toleram espaço e ponto onde quiserem aparecer. No papel real
   o OCR entrega de tudo: "T. DE SERVIÇO", "T.DESERVIÇO", "TDE SERVICO",
   "T . DE SERVIÇO". Exigir o espaço, como era antes, jogava fora quase toda a
   parte de cabos e soldados — que é justamente a maior do listão. */
function acharCriterio(t: string): { criterio: string; ini: number; fim: number } | null {
  const tentativas: [RegExp, string][] = [
    [/A\s*N\s*T\s*I\s*G\s*U\s*I\s*D\s*A\s*D\s*E/, "ANTIGUIDADE"],
    [/M\s*E\s*R\s*E\s*C\s*I\s*M\s*E\s*N\s*T\s*O/, "MERECIMENTO"],
    [/T[\s.,]*(?:EMPO)?[\s.,]*DE[\s.,]*SERVI[CÇ]O/, "TEMPO DE SERVIÇO"],
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
  /* As linhas da tabela vêm com as bordas das células viradas em caractere.
     No papel real o OCR usa | [ ] { } ( ) misturados, e às vezes cola a borda
     no número: "[2633444]" precisa virar "2633444", senão o pedaço deixa de
     parecer número e a linha inteira se perde. */
  const t = limpo(bruta).replace(/[|[\]{}()]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // cabeçalho da tabela, não é dado
  if (/^ORD\b/.test(t)) return null;

  /* O critério é a melhor âncora quando aparece, mas NÃO é obrigatório: em
     página torta ele sai ilegível e a linha continua tendo tudo que importa
     (ordem, barra, nome e matrícula). Sem critério, o corte é a matrícula. */
  const c = acharCriterio(t);
  const antes = (c ? t.slice(0, c.ini) : t).trim();
  const depois = c ? t.slice(c.fim).trim() : "";

  /* Trabalha por PEDAÇOS separados por espaço, nunca por posição no meio do
     texto. Sem isso, um nome terminado em O ou S ("LEMOS") se colava na
     matrícula seguinte e as duas colunas viravam uma só. */
  const toks = antes.split(" ").filter(Boolean);

  /* MAT é o último pedaço numérico com 5 a 8 dígitos — cobre a matrícula
     antiga (6) e o ID novo, da barra 18 em diante (7). */
  let iMat = -1;
  let mat = "";
  for (let i = toks.length - 1; i >= 0; i--) {
    /* A borda da célula costuma grudar no número e virar letra: no papel real
       aparecem "J2422939", "/2432953", "f2556132". Por isso não se olha o
       pedaço inteiro, e sim o maior trecho numérico dentro dele. */
    const nucleo = maiorTrechoNumerico(toks[i]);
    if (!pareceNumero(nucleo, 5)) continue;
    const cru = soDigitos(nucleo);
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

  /* Sem o critério para confirmar que é linha de tabela, exige mais: ou a
     numeração do listão, ou o número/barra. Assim um pedaço solto de texto
     com um número comprido no meio não entra como se fosse promoção. */
  if (!c && ord === null && !num) return null;

  const qpmp = (depois.match(/\d+/) || [""])[0];

  return { ord, num, nome, mat, criterio: c?.criterio || "", qpmp, bruta: bruta.trim() };
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

/* --------------------------------------------- data da promoção ---------

   Acertar esta data importa mais do que parece: é ela o critério de
   antiguidade DENTRO do posto (ver carimboAntiguidade em patentes.ts), e é
   ela que ordena a escala, o quadro de antiguidade e os documentos. Com a
   data errada, o pessoal promovido sai na ordem errada em todas essas telas.

   A promoção NÃO vale da data em que o P/1 lança, e sim da data do ato — e
   RETROAGE a ela. O aviso da CPPPM sai dias depois ("divulga a relação dos
   promovidos A CONTAR DE 31 DE AGOSTO DE 2026", publicado em 2 de setembro),
   mas quem foi promovido conta antiguidade desde a data do ato.

   São três promoções por ano na PMMA, em datas fixas (informadas pelo P/1):

        31 de março   ·   31 de agosto   ·   25 de dezembro

   Repare que dezembro NÃO é o último dia do mês — por isso a regra é uma
   tabela, e não uma conta.

   A ordem de preferência:
     1) o "a contar de" escrito no próprio texto, quando o aviso da CPPPM vem
        junto do listão — é a data oficial e ganha de tudo;
     2) a data fixa do mês que o título declara;
     3) mês sem data fixa (o calendário pode mudar): o último dia do mês, só
        para não deixar o campo vazio.

   Em qualquer caso a tela mostra a data e deixa editar antes de lançar. */
const MESES_PT: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

/* As três promoções do ano, por mês. Fica separado justamente para o dia ser
   fácil de mudar se a Comissão mudar o calendário. */
const DIA_DA_PROMOCAO: Record<number, number> = {
  3: 31,   // 31 de março
  8: 31,   // 31 de agosto
  12: 25,  // 25 de dezembro — não é o último dia do mês
};

/* O mês precisa vir como PALAVRA INTEIRA.

   Sem isso, "MARCOS PAULO" fazia o sistema entender MARÇO — e o listão de
   agosto gravava 31/03 na ficha de todo mundo. Como a data da promoção é o
   critério de antiguidade dentro do posto, o efetivo inteiro saía na ordem
   errada por causa de um militar chamado Marcos. */
function mesDoTexto(t: string): number | null {
  for (const [nome, n] of Object.entries(MESES_PT)) {
    if (new RegExp(`\\b${nome}\\b`).test(t)) return n;
  }
  return null;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  // dia 0 do mês seguinte = último dia deste
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function dataSugeridaDoListao(texto: string, titulo = ""): string {
  const t = limpo(texto);

  /* 1) A data oficial, quando o documento a declara:
        "A CONTAR DE 31 DE AGOSTO DE 2026"
     Aceita espaço entre as letras porque o Diário sai com "a cont ar de". */
  const aContar = t.match(
    /A\s*C\s*O\s*N\s*T\s*A\s*R\s*D\s*E\s*(\d{1,2})\s*(?:DE)?\s*([A-Z]+)\s*(?:DE)?\s*(20\d{2})/
  );
  if (aContar) {
    const mes = mesDoTexto(aContar[2]);
    const dia = parseInt(aContar[1], 10);
    const ano = parseInt(aContar[3], 10);
    if (mes && dia >= 1 && dia <= ultimoDiaDoMes(ano, mes)) return iso(ano, mes, dia);
  }

  /* 2) O TÍTULO do documento, que é onde o mês da promoção está escrito:
        "RELAÇÃO DE PROMOVIDOS AGOSTO DE 2026".

     Procurar no documento inteiro, como era antes, é armadilha: o listão tem
     270 nomes e basta um "MARCOS" ou uma lei "de 24 de março" para o mês sair
     errado. O título é curto e só fala da promoção. */
  const doTitulo = pelaData(limpo(titulo));
  if (doTitulo) return doTitulo;

  // 3) Último recurso: o texto todo, já com o mês como palavra inteira.
  return pelaData(t);
}

function pelaData(t: string): string {
  const ano = t.match(/\b(20\d{2})\b/);
  if (!ano) return "";
  const mes = mesDoTexto(t);
  if (!mes) return "";
  const a = parseInt(ano[1], 10);
  return iso(a, mes, DIA_DA_PROMOCAO[mes] ?? ultimoDiaDoMes(a, mes));
}

/* ------------------------------------------- juntar várias leituras ------

   O mesmo papel é lido de mais de um jeito (ver ocrListao.ts: uma passada
   entrega o texto na ordem do Tesseract, outra remonta as linhas pela posição
   das palavras). Nenhuma das duas pega tudo, mas o que uma perde a outra
   costuma achar — medido no listão de agosto/2026: 224 e 204 linhas
   separadas, 256 das 270 quando juntas.

   A chave para juntar é a MATRÍCULA. Quando a mesma matrícula aparece nas
   duas leituras, fica a versão mais completa (a que tem ordem, barra,
   critério e o nome mais inteiro). Se duas linhas com a mesma matrícula
   tiverem nomes bem diferentes, as duas ficam: é erro de leitura num dos
   números, e é melhor o P/1 ver as duas do que perder um promovido. */
function completude(l: LinhaListao): number {
  return (l.ord !== null ? 2 : 0) + (l.num ? 2 : 0) + (l.criterio ? 1 : 0)
    + Math.min(l.nome.length, 40) / 40;
}

function mesmaPessoa(a: string, b: string): boolean {
  const pa = [...new Set(a.split(" ").filter((p) => p.length > 2))];
  const pb = [...new Set(b.split(" ").filter((p) => p.length > 2))];
  /* Com um nome pela metade não dá para afirmar que são pessoas diferentes —
     e o preço de errar aqui é encher a tela de linha repetida. Na dúvida,
     trata como a mesma pessoa e fica a leitura mais completa. */
  if (pa.length < 2 || pb.length < 2) return true;
  const setA = new Set(pa);
  const iguais = pb.filter((p) => setA.has(p)).length;
  return iguais / Math.max(pa.length, pb.length) >= 0.5;
}

/* Junta leituras que vieram de FORMATOS diferentes (o listão da CPPPM e o
   Diário Oficial). Os dois documentos não se repetem — um traz praças, o
   outro oficiais — mas passar pela mesma junção evita linha duplicada se um
   dia vierem juntos no mesmo arquivo. */
export function combinarLeituras(partes: ResultadoLeitura[]): ResultadoLeitura {
  const porChave = new Map<string, LinhaListao>();
  const ignoradas: string[] = [];
  let titulo = "";
  for (const r of partes) {
    if (!titulo && r.titulo) titulo = r.titulo;
    for (const l of r.linhas) {
      const chave = (l.mat || "nome:" + l.nome) + "|" + l.paraOrdem;
      const anterior = porChave.get(chave);
      if (!anterior || completude(l) > completude(anterior)) porChave.set(chave, l);
    }
    for (const x of r.ignoradas) if (!ignoradas.includes(x)) ignoradas.push(x);
  }
  return { titulo, linhas: [...porChave.values()], ignoradas };
}

export function lerListaoVarios(textos: string[]): ResultadoLeitura {
  const porChave = new Map<string, LinhaListao>();
  const ignoradas: string[] = [];
  let titulo = "";

  for (const t of textos) {
    const r = lerListao(t || "");
    if (!titulo && r.titulo) titulo = r.titulo;
    for (const l of r.linhas) {
      // sem número (ato que só nomeia o militar), a chave é o próprio nome
      let chave = l.mat || "nome:" + l.nome;
      const atual = porChave.get(chave);
      if (atual && !mesmaPessoa(atual.nome, l.nome)) {
        // mesma matrícula, gente diferente: guarda as duas para conferência
        chave = l.mat + "|" + (l.nome.split(" ")[0] || "");
      }
      const anterior = porChave.get(chave);
      if (!anterior || completude(l) > completude(anterior)) porChave.set(chave, l);
    }
    for (const x of r.ignoradas) if (!ignoradas.includes(x)) ignoradas.push(x);
  }

  const linhas = [...porChave.values()].sort((a, b) => (a.ord ?? 9999) - (b.ord ?? 9999));
  return { titulo, linhas, ignoradas };
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
