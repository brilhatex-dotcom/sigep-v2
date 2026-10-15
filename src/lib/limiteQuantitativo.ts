import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   LIMITE QUANTITATIVO — leitura dos PDFs da CPPPM.

   A CPPPM publica, por graduação, a lista de quem está no Limite
   Quantitativo da promoção (ex.: "LIMITE QUANTITATIVO DOS 1º SARGENTOS PM
   PARA AS PROMOÇÕES À GRADUAÇÃO DE SUBTENENTE PM"). É a PMMA inteira, unidade
   por unidade — e o P/1 precisa saber quem ali é do 18º BPM. Antes isso era
   feito no olho (ou pedindo a um chatbot); aqui o sistema lê o PDF e cruza
   com o efetivo.

   COMO O PDF É LIDO. Não por "texto corrido": pela POSIÇÃO de cada pedaço
   de texto na página (o pdf.js entrega x e y). Uma linha da tabela é:
     ORD | OPM | NUM | NOME | MATR. | ID | PROM (data)
   e o que dá trabalho é o nome comprido, que o Word quebra em duas linhas:
         FLORISMOND ROBERTO CARLOS DE MATOS          <- acima
     2º BPM  182/02            1150804  416787  17/06/2018   <- a linha "âncora"
     6       BELO                                    <- abaixo, com o ORD
   Por isso a âncora de cada militar é a linha que tem NUM + números + data,
   e os pedaços soltos logo acima e logo abaixo (a menos de meia linha) são
   colados nela, cada um na coluna em que está pela posição x.

   Esta parte é pura (recebe os pedaços de texto, devolve as linhas): roda
   no NAVEGADOR, logo depois de o pdf.js ler o arquivo (lerPdfPedacos, em
   lerArquivoTexto.ts) — como a importação do listão, o PDF não sobe para o
   servidor; só as linhas lidas. E dá para testar sem PDF nenhum.
   ========================================================================= */

// w = largura do pedaço (o pdf.js informa); serve para colar palavra partida
export type Pedaco = { s: string; x: number; y: number; w?: number };

export type LinhaLimite = {
  ord: number | null;
  quadro: string;          // "QPMP – 0 (COMBATENTE)"
  opm: string;
  num: string;
  nome: string;
  matricula: string;
  id: string;
  data: string;            // última coluna: data da promoção (ou inclusão)
};

export type LeituraLimite = {
  titulo: string;          // a frase do título, como veio
  gradOrigem: string;      // sigla: 1SGT, 2SGT, 3SGT, CB, SD ("" se não reconheceu)
  gradDestino: string;     // "Subtenente PM", "1º Sargento PM"...
  ciclo: string;           // "dezembro de 2026"
  rotuloData: string;      // título da última coluna ("PROM 1º SGT")
  linhas: LinhaLimite[];
  /* Conferência da leitura: em cada quadro o ORD tem de ir de 1 a N sem
     buraco. Buraco = linha que o leitor não entendeu — e aí é melhor dizer
     do que fingir que leu tudo. */
  furos: { quadro: string; faltam: number[] }[];
};

// "158/92" e também "1078/2017" — no PDF dos Cabos parte dos números vem
// com o ano em quatro dígitos, e essas linhas eram puladas
const NUM = /^\d{1,4}\/(\d{2}|\d{4})$/;
const DATA = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
// matrícula e ID; o PDF dos Cabos tem IDs curtos ("9580") que vieram assim da CPPPM
const NUMERO = /^\d{3,8}$/;
const INTEIRO = /^\d{1,4}$/;
const QUADRO = /QPMP\s*[–—-]\s*\d+\s*\([^)]*\)/i;

const SIGLA: Record<number, string> = { 9: "1SGT", 10: "2SGT", 11: "3SGT", 12: "CB", 13: "SD" };

// "1º SARGENTOS PM" -> "1SGT"; "CABOS PM" -> "CB" (o plural não passa no classificador)
export function siglaDaGraduacao(t: string): string {
  const singular = t.replace(/\b(cabo|soldado|sargento)s\b/gi, "$1");
  return SIGLA[classificarPatente(singular).ordem] || "";
}

type Linha = { y: number; pedacos: Pedaco[] };

// Junta os pedaços da página em linhas (mesmo y, com folga), de cima para baixo.
function emLinhas(pedacos: Pedaco[]): Linha[] {
  const xs = pedacos.filter((p) => p.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const p of xs) {
    const l = linhas.find((x) => Math.abs(x.y - p.y) < 2.5);
    if (l) l.pedacos.push(p); else linhas.push({ y: p.y, pedacos: [p] });
  }
  for (const l of linhas) {
    l.pedacos.sort((a, b) => a.x - b.x);
    l.pedacos = colarPartidos(l.pedacos);
  }
  return linhas.sort((a, b) => b.y - a.y);
}

/* O pdf.js do NAVEGADOR às vezes entrega uma palavra ou número partido em
   dois pedaços encostados: o ID "821570" vinha como "82" + "1570", e
   "RICARDO" como "RICARD" + "O". Com o ID partido o cruzamento falhava (o
   policial nosso não era achado), e com a data ou o NUM partido a linha
   inteira sumia. Pedaços que COMEÇAM onde o anterior TERMINA (sem o espaço
   de uma palavra para outra) são o mesmo texto: cola. */
function colarPartidos(ps: Pedaco[]): Pedaco[] {
  const out: Pedaco[] = [];
  for (const p of ps) {
    const ant = out[out.length - 1];
    if (ant && ant.w !== undefined && p.x - (ant.x + ant.w) < 0.6 && !/\s$/.test(ant.s) && !/^\s/.test(p.s)) {
      ant.s += p.s;
      ant.w = p.x + (p.w ?? 0) - ant.x;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

const texto = (l: Linha) => l.pedacos.map((p) => p.s.trim()).filter(Boolean).join(" ");
/* Junta pedaços com um espaço. O pdf.js do navegador entrega "CPAI", "-",
   "5" separados, e o do servidor entrega "CPAI-5": tira o espaço em volta do
   hífen e dentro dos parênteses, para as duas leituras darem o mesmo texto. */
const juntar = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join(" ")
  .replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

/* Uma linha é âncora quando tem o NUM (123/94) e, à direita dele, dois
   números longos (matrícula e ID) e uma data. */
function ancora(l: Linha) {
  const iNum = l.pedacos.findIndex((p) => NUM.test(p.s.trim()));
  if (iNum < 0) return null;
  const depois = l.pedacos.slice(iNum + 1);
  const iData = depois.findIndex((p) => DATA.test(p.s.trim()));
  const numeros = depois.filter((p) => NUMERO.test(p.s.trim()));
  if (iData < 0 || numeros.length < 2) return null;
  const xNum = l.pedacos[iNum].x;
  const xMatr = numeros[0].x;
  return { iNum, xNum, xMatr, numeros, data: depois[iData].s.trim() };
}

export function lerLimite(paginas: Pedaco[][]): LeituraLimite {
  // ---- título, ciclo e nome da última coluna, na primeira página ----
  const primeira = emLinhas(paginas[0] || []).map(texto).join(" ");
  const mt = primeira.match(/LIMITE\s+QUANTITATIVO\s+D[OA]S?\s+(.+?)\s+PARA\s+AS\s+PROMO[ÇC][ÕO]ES\s+[ÀA]\s+GRADUA[ÇC][ÃA]O\s+DE\s+(.+?)\s+PM\b/i);
  /* O ciclo: "prevista para dezembro de 2026" — e também "previstas para 25
     de dezembro de 2026". Sem achar a frase, o primeiro "mês de ano" da
     página. Ciclo não reconhecido jogava a graduação num bloco separado, no
     fim da tela, fora da ordem hierárquica. */
  const MES = "(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
  const MESES_ = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const valor = (m: RegExpMatchArray) => Number(m[2]) * 100 + MESES_.indexOf(m[1].toLowerCase().replace("ç", "c"));
  /* fallback: a data MAIS RECENTE da página — o texto também cita o
     "Decreto ... de 29 de agosto de 2003", que não é o ciclo */
  const mc = primeira.match(new RegExp(`previstas?\\s+para\\s+(?:o\\s+dia\\s+)?(?:\\d{1,2}\\s+de\\s+)?${MES}\\s+de\\s+(\\d{4})`, "i"))
    || [...primeira.matchAll(new RegExp(`${MES}\\s+de\\s+(\\d{4})`, "gi"))].sort((a, b) => valor(b) - valor(a))[0]
    || null;
  const titulo = mt ? mt[0].replace(/\s+/g, " ") : "";
  const gradOrigem = mt ? siglaDaGraduacao(mt[1]) : "";
  // "SUBTENENTE" -> "Subtenente PM"; "1º SARGENTO" -> "1º Sargento PM"
  const gradDestino = mt
    ? `${mt[2].trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
        .replace(/\b(Sargento|Cabo|Soldado)s\b/, "$1")} PM`
    : "";
  const ciclo = mc ? `${mc[1].toLowerCase().replace("marco", "março")} de ${mc[2]}` : "";

  let quadro = "";
  let rotuloData = "";
  const linhas: LinhaLimite[] = [];

  for (const pag of paginas) {
    const ls = emLinhas(pag);
    const usadas = new Set<number>();
    const ancoras: { i: number; a: NonNullable<ReturnType<typeof ancora>> }[] = [];
    ls.forEach((l, i) => { const a = ancora(l); if (a) ancoras.push({ i, a }); });

    // quadro (QPMP) vigente em cada altura da página
    const quadros = ls.map((l, i) => ({ i, m: texto(l).match(QUADRO) })).filter((q) => q.m);
    const quadroEm = (i: number) => {
      let q = quadro;
      for (const x of quadros) if (x.i <= i) q = juntar(x.m![0]);
      return q;
    };

    // título da última coluna (cabeçalho "ORD OPM NUM NOME ...")
    for (const l of ls) {
      const t = texto(l);
      /* o título da última coluna é o que vem depois de "ID" (na página 2 do
         PDF da CPPPM a coluna aparece como "LIMITE"). Pelo texto, e não pelo
         último pedaço: no navegador "PROM 1º SGT" chega em três pedaços. */
      if (/^ORD\b/.test(t) && /\bNOME\b/.test(t) && !rotuloData) {
        rotuloData = (t.match(/\b(?:ID|LIMITE)\s+(.+)$/) || [])[1]?.trim() || "";
      }
    }

    for (const { i, a } of ancoras) {
      const l = ls[i];
      usadas.add(i);
      const antes = l.pedacos.slice(0, a.iNum);
      // ORD: inteiro curto na ponta esquerda
      let ord: number | null = null;
      let opmP = antes;
      if (antes[0] && INTEIRO.test(antes[0].s.trim())) { ord = Number(antes[0].s.trim()); opmP = antes.slice(1); }
      let opm = juntar(...opmP.map((p) => p.s));
      let nome = juntar(...l.pedacos.filter((p) => p.x > a.xNum && p.x < a.xMatr - 1 && !NUM.test(p.s.trim())).map((p) => p.s));

      /* Pedaços soltos colados a esta linha (meia linha acima ou abaixo, e
         que não são outra âncora): vão para a coluna onde estão. */
      for (const j of [i - 1, i + 1]) {
        const v = ls[j];
        if (!v || usadas.has(j) || ancoras.some((x) => x.i === j)) continue;
        if (Math.abs(v.y - l.y) > 8) continue;
        if (QUADRO.test(texto(v)) || /^ORD\b/.test(texto(v))) continue;
        usadas.add(j);
        const acima = j < i;
        /* Monta o pedaço INTEIRO da linha solta antes de colar. Colar
           palavra por palavra na frente invertia a ordem — o pdf.js do
           navegador entrega uma palavra por pedaço, e "FLORISMOND ROBERTO
           CARLOS DE MATOS" virava "MATOS DE CARLOS ROBERTO FLORISMOND". */
        const opmFrag: string[] = [];
        const nomeFrag: string[] = [];
        for (const p of v.pedacos) {
          const s = p.s.trim();
          if (p.x < a.xNum - 1) {
            if (ord === null && INTEIRO.test(s) && p === v.pedacos[0]) ord = Number(s);
            else opmFrag.push(s);
          } else if (p.x < a.xMatr - 1) {
            nomeFrag.push(s);
          }
        }
        opm = acima ? juntar(...opmFrag, opm) : juntar(opm, ...opmFrag);
        nome = acima ? juntar(...nomeFrag, nome) : juntar(nome, ...nomeFrag);
      }

      linhas.push({
        ord,
        quadro: quadroEm(i),
        opm,
        num: l.pedacos[a.iNum].s.trim(),
        nome,
        matricula: a.numeros[0].s.trim(),
        id: a.numeros[1].s.trim(),
        data: a.data,
      });
    }
    // o quadro vigente atravessa para a página seguinte
    if (quadros.length) quadro = juntar(quadros[quadros.length - 1].m![0]);
  }

  // ---- conferência: ORD de 1 a N em cada quadro ----
  const porQuadro = new Map<string, number[]>();
  for (const l of linhas) if (l.ord !== null) porQuadro.set(l.quadro, [...(porQuadro.get(l.quadro) || []), l.ord]);
  const furos: LeituraLimite["furos"] = [];
  for (const [q, ords] of porQuadro) {
    const max = Math.max(...ords);
    const tem = new Set(ords);
    const faltam: number[] = [];
    for (let k = 1; k <= max; k++) if (!tem.has(k)) faltam.push(k);
    if (faltam.length || linhas.some((l) => l.quadro === q && l.ord === null)) furos.push({ quadro: q, faltam });
  }

  return { titulo, gradOrigem, gradDestino, ciclo, rotuloData, linhas, furos };
}

/* ------------------------------------------------------------ cruzamento */

export type MilitarCruzar = {
  id: string; nome: string | null; matricula: string | null; numeroBarra: string | null;
  postoGrad: string | null; nomeGuerra: string | null; lotacao: string | null;
};

export type NossoNoLimite = LinhaLimite & {
  efetivoId: string | null;      // null = está como 18º BPM no PDF mas não achei no efetivo
  postoGrad: string;
  nomeSistema: string;
  por: "ID" | "matrícula" | "número e nome" | "OPM";
  opmDiferente: boolean;         // é nosso no sistema, mas o PDF põe outra OPM
};

const soDig = (t: string | null | undefined) => String(t || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const normNome = (t: string | null | undefined) =>
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
// "0276/93" e "276/93" são o mesmo número; "1078/2017" é o "1078/17" da ficha
const normNum = (t: string | null | undefined) => {
  const m = String(t || "").match(/(\d{1,4})\s*\/\s*(\d{2,4})/);
  return m ? `${Number(m[1])}/${m[2].slice(-2)}` : "";
};
export const ehDoBatalhao = (opm: string) => /\b18\s*[º°o]?\s*BPM\b/i.test(opm);

/* Quem da lista é NOSSO. Pelo ID primeiro, depois pela matrícula, depois
   pelo número + nome. E quem o PDF põe como 18º BPM mas o sistema não acha
   entra também, sinalizado: pode ser alguém que ainda não foi cadastrado, ou
   que saiu e o PDF não sabe. */
export function cruzarComEfetivo(linhas: LinhaLimite[], efetivo: MilitarCruzar[]): NossoNoLimite[] {
  const porId = new Map<string, MilitarCruzar>();
  const porMat = new Map<string, MilitarCruzar>();
  const porNumNome = new Map<string, MilitarCruzar>();
  for (const m of efetivo) {
    if (soDig(m.id)) porId.set(soDig(m.id), m);
    if (soDig(m.matricula)) porMat.set(soDig(m.matricula), m);
    if (normNum(m.numeroBarra) && normNome(m.nome)) porNumNome.set(`${normNum(m.numeroBarra)}|${normNome(m.nome)}`, m);
  }
  const out: NossoNoLimite[] = [];
  for (const l of linhas) {
    let m: MilitarCruzar | undefined;
    let por: NossoNoLimite["por"] = "ID";
    if (soDig(l.id) && porId.has(soDig(l.id))) m = porId.get(soDig(l.id));
    if (!m && soDig(l.matricula) && porMat.has(soDig(l.matricula))) { m = porMat.get(soDig(l.matricula)); por = "matrícula"; }
    if (!m) { m = porNumNome.get(`${normNum(l.num)}|${normNome(l.nome)}`); por = "número e nome"; }
    if (m) {
      out.push({
        ...l, efetivoId: m.id, postoGrad: m.postoGrad || "", nomeSistema: m.nome || m.nomeGuerra || "",
        por, opmDiferente: !ehDoBatalhao(l.opm),
      });
    } else if (ehDoBatalhao(l.opm)) {
      out.push({ ...l, efetivoId: null, postoGrad: "", nomeSistema: "", por: "OPM", opmDiferente: false });
    }
  }
  return out;
}
