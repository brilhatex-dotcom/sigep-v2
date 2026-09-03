import { classificarPatente, PATENTES } from "@/lib/patentes";
import { promocaoPlausivel, type LinhaListao, type ResultadoLeitura } from "@/lib/promocaoListao";

/* =========================================================================
   LEITURA DO DIÁRIO OFICIAL

   O listão da CPPPM (promocaoListao.ts) traz as PRAÇAS e vem fotocopiado. O
   Diário Oficial traz os OFICIAIS, e vem com texto de verdade dentro do PDF —
   sem OCR, sem erro de leitura. São documentos que se completam, e por isso
   os dois entram pela mesma tela.

   O formato aqui é outro. Não existe cabeçalho "DE X PARA Y": o ato vem
   escrito em prosa, e depois a tabela. As formas que aparecem:

     a) turma, com o posto de origem dito:
        "Promover, por antiguidade, os militares abaixo listados, de Major
         QOEM ao posto de Tenente-Coronel QOEM, a contar de 31 de agosto..."

     b) turma, com o posto de origem no sujeito:
        "Promover, por antiguidade, os 1º Tenentes QOE, abaixo relacionados,
         ao posto de Capitão QOE, a contar de..."

     c) um militar só, com nome, matrícula e ID no meio do texto:
        "Promover, por antiguidade, o 1º Tenente QOEM JONAS MAGNO OLIVEIRA DE
         SOUZA JÚNIOR, matrícula nº 2180966, ID nº 806442, ao posto de
         Capitão QOEM, a contar de..."

   E a tabela das turmas é "ORD | NOME | ID | MAT." — às vezes com as duas
   últimas trocadas. Em vez de depender do cabeçalho, guardamos OS DOIS
   números e o cruzamento tenta cada um contra matrícula e ID. É exato de
   qualquer jeito: aqui não há OCR para errar dígito.
   ========================================================================= */

const ROTULO = new Map(PATENTES.map((p) => [p.ordem, p.rotulo]));

function limpo(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MESES: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

/* "a contar de 31 de março de 2026" -> "2026-03-31".

   Vale a pena pegar a data de CADA ato, e não uma só para o documento
   inteiro: no Diário de agosto/2026 há uma promoção em ressarcimento de
   preterição que retroage a 31 de MARÇO, no meio de dezenas que valem de 31
   de agosto. Com uma data só, esse militar entraria na ordem errada de
   antiguidade. */
function dataDoAto(janela: string): string {
  /* O espaço pode cair no meio de qualquer palavra — no Diário de agosto sai
     "a cont ar de 31 de agosto", e era isso que deixava cinco promoções sem
     data. Por isso a expressão aceita espaço entre todas as letras. */
  const m = limpo(janela).match(
    /A\s*C\s*O\s*N\s*T\s*A\s*R\s*D\s*E\s*(\d{1,2})\s*(?:DE)?\s*([A-Z]+)\s*(?:DE)?\s*(20\d{2})/
  );
  if (!m) return "";
  const mes = MESES[m[2]];
  if (!mes) return "";
  const dia = parseInt(m[1], 10);
  const ano = parseInt(m[3], 10);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia < 1 || dia > ultimo) return "";
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/* O texto do Diário quebra palavra no fim da linha ("combina -\ndos") e às
   vezes some com o espaço ("TenenteCoronel", "M aj or"). Isto arruma o que
   dá antes de tentar entender a frase. */
function costurar(janela: string): string {
  return janela
    .replace(/(\S)\s*-\s*\n\s*/g, "$1")   // hífen de fim de linha
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Secao = { de: number; para: number; data: string };

/* O Diário escreve o posto de um jeito que o classificador comum não pega:
   no PLURAL ("os Capitães QOEM") e com letra espaçada, defeito de composição
   do jornal ("ao posto de M aj or QOEM", "TenenteCoronel"). Aqui a mesma
   palavra é tentada de quatro formas até uma bater. */
function singular(t: string): string {
  return t
    /* "PrimeiroTenente", "SegundoTenente": o Diário escreve o ordinal por
       extenso e colado. O classificador procura o dígito 1/2/3 para saber se
       é 1º ou 2º Tenente — sem isto, "PrimeiroTenente" virava 2º Tenente e o
       ato inteiro era recusado como salto inválido. */
    .replace(/PRIMEIRO/g, "1 ")
    .replace(/SEGUNDO/g, "2 ")
    .replace(/TERCEIRO/g, "3 ")
    .replace(/CAPIT[AÃ]ES/g, "CAPITAO")
    .replace(/MAJORES/g, "MAJOR")
    .replace(/CORON[EÉ]IS/g, "CORONEL")
    .replace(/TENENTES/g, "TENENTE")
    .replace(/ASPIRANTES/g, "ASPIRANTE")
    .replace(/SARGENTOS/g, "SARGENTO")
    .replace(/CABOS/g, "CABO")
    .replace(/SOLDADOS/g, "SOLDADO");
}

/* A ORDEM das tentativas importa, e custou um defeito para descobrir: o texto
   cru de "Primeiro-Tenente" JÁ classifica — como 2º Tenente, porque o
   classificador procura o dígito 1/2/3 e não acha nenhum. Como a primeira
   resposta válida era aceita, o ato saía com o posto errado e depois era
   recusado como salto inválido. Por isso a forma arrumada vem primeiro. */
function classificarTolerante(txt: string): number {
  const arrumado = singular(txt);
  for (const c of [arrumado, txt, arrumado.replace(/\s+/g, ""), txt.replace(/\s+/g, "")]) {
    const o = classificarPatente(c).ordem;
    if (o !== 99) return o;
  }
  return 99;
}

/* O posto de ORIGEM está solto no meio da frase, em posições diferentes
   conforme a escrita do ato:

     "..., de Major QOEM ao posto de ..."                 -> logo antes
     "os 1º Tenentes QOE, abaixo relacionados, ao posto"  -> antes do "abaixo"
     "o TenenteCoronel QOEM FULANO DE TAL, Matrícula nº   -> longe, antes do
      133330, ID nº 415701, ao posto de ..."                 nome e dos números

   Em vez de uma expressão para cada caso, varre de trás para frente em
   janelas de até três palavras e fica com o primeiro posto que reconhecer —
   o mais próximo do "ao posto de", que é sempre o de origem. */
const ORDINAL = /^(1|2|3)[ºO°]?$/;

function postoAntesDoDestino(antes: string): number {
  const palavras = antes.split(" ").filter(Boolean);
  for (let i = palavras.length - 1; i >= 0; i--) {
    for (let n = 1; n <= 3 && i + n <= palavras.length; n++) {
      const o = classificarTolerante(palavras.slice(i, i + n).join(" "));
      if (o === 99) continue;
      /* "1º TENENTE": varrendo de trás para frente chega-se primeiro em
         "TENENTE" sozinho, e sem o ordinal o classificador responde 2º
         Tenente. Antes de aceitar, espia a palavra anterior. */
      if (i > 0 && ORDINAL.test(palavras[i - 1])) {
        const comOrdinal = classificarTolerante(palavras.slice(i - 1, i + n).join(" "));
        if (comOrdinal !== 99) return comOrdinal;
      }
      return o;
    }
  }
  return 99;
}

/* Lê o ato e diz de qual posto para qual posto ele promove. */
function lerAto(janela: string): { secao: Secao; individual: { nome: string; mat: string; id: string } | null } | null {
  const texto = costurar(janela);
  const t = limpo(texto);

  const mDestino = t.match(/AO POSTO DE ([^,;:]{3,45})/);
  if (!mDestino) return null;
  const para = classificarTolerante(mDestino[1]);
  if (para === 99) return null;

  const de = postoAntesDoDestino(t.slice(0, mDestino.index));
  if (!promocaoPlausivel(de, para)) return null;

  const secao: Secao = { de, para, data: dataDoAto(texto) };

  /* Ato de um militar só: nome, matrícula e ID vêm na própria frase. */
  const mInd = texto.match(
    /\b(?:matr[ií]cula|Matr[ií]cula|MATR[IÍ]CULA)\s*n?[º°.]?\s*(\d{4,9}).{0,30}?\bID\s*n?[º°.]?\s*(\d{4,9})/
  );
  if (mInd) {
    /* O nome fica entre o posto de origem e a palavra "matrícula", em
       MAIÚSCULAS no Diário. */
    const antesDaMat = texto.slice(0, texto.indexOf(mInd[0]));
    const mNome = antesDaMat.match(/([A-ZÀ-Ú][A-ZÀ-Ú'\s]{8,})\s*,?\s*$/);
    const nome = mNome ? mNome[1].replace(/\s+/g, " ").trim() : "";
    if (nome.length >= 6) {
      return { secao, individual: { nome, mat: mInd[1], id: mInd[2] } };
    }
  }

  /* Ato que nomeia UM militar mas não dá matrícula nem ID. Acontece nas
     promoções por decisão judicial ("Promover em ressarcimento de preterição
     ... o militar FULANO DE TAL, de X ao posto de Y"). Sem isto o militar
     simplesmente sumia: não vira linha de tabela nem de ato individual.

     O nome sair em MAIÚSCULAS é o que separa a pessoa da prosa em volta —
     "o militar abaixo listado" é minúsculo e não passa daqui. */
  const mSo = texto.match(/\b(?:o|a)\s+militar\s+([A-ZÀ-Ú][A-ZÀ-Ú'\s]{8,})\s*,/);
  if (mSo) {
    const nome = mSo[1].replace(/\s+/g, " ").trim();
    if (nome.length >= 8) return { secao, individual: { nome, mat: "", id: "" } };
  }

  return { secao, individual: null };
}

/* Linha da tabela: "1 BENILTON MENEZES DE SOUSA 415790 134361" */
function lerLinhaTabela(linha: string): { ord: number; nome: string; a: string; b: string } | null {
  const t = linha.replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d{1,3})\s+(.+?)\s+(\d{4,9})\s+(\d{4,9})\b/);
  if (!m) return null;
  const nome = m[2].replace(/[^A-Za-zÀ-ú' ]/g, " ").replace(/\s+/g, " ").trim();
  if (nome.length < 4) return null;
  return { ord: parseInt(m[1], 10), nome, a: m[3], b: m[4] };
}

/* Pedaço de nome que ficou sozinho numa linha, por causa da quebra dentro da
   célula. Pode pertencer à linha de cima OU à de baixo — ver a regra na
   função principal. */
function ehSoNome(linha: string): boolean {
  const t = linha.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (/\d/.test(t)) return false;
  if (!/^[A-ZÀ-Ú][A-ZÀ-Ú'\s]+$/.test(t)) return false;   // o Diário põe os nomes em maiúsculas
  const palavras = t.split(/\s+/).filter(Boolean);
  return palavras.length >= 1 && palavras.length <= 5;
}

const NAO_E_NOME = /\b(ORD|NOME|MATRICULA|MAT|ID|GOVERNADOR|ESTADO|MARANHAO|SECRETARIA|SEGURANCA|PUBLICA|PALACIO|GOVERNO|SAO LUIS|INDEPENDENCIA|REPUBLICA|RESOLVE|DIARIO|OFICIAL|PODER|EXECUTIVO|EDICAO|SUMARIO|CASA CIVIL|POLICIA|MILITAR|CORPO|BOMBEIROS)\b/;

export function lerDiarioOficial(texto: string): ResultadoLeitura {
  const linhas = (texto || "").split(/\r?\n/);
  const saida: LinhaListao[] = [];
  const ignoradas: string[] = [];
  let secao: Secao | null = null;
  let titulo = "";
  let pendente = "";        // nome solto esperando a linha da tabela
  let ultimaFoiLinha = -1;  // índice da última linha de tabela lida

  for (let i = 0; i < linhas.length; i++) {
    const bruta = linhas[i];
    const t = bruta.trim();
    if (!t) continue;

    if (!titulo && /DI[ÁA]RIO\s+OFICIAL/i.test(t)) {
      const dataTit = limpo(linhas.slice(i, i + 4).join(" ")).match(/(\d{1,2}\s*DE\s*[A-Z]+\s*DE\s*20\d{2})/);
      titulo = "Diário Oficial" + (dataTit ? " — " + dataTit[1].toLowerCase() : "");
      continue;
    }

    /* Um ato começando: lê a frase inteira (ela ocupa várias linhas). */
    if (/^Promover\b/i.test(t)) {
      const ato = lerAto(linhas.slice(i, i + 10).join("\n"));
      pendente = "";
      if (!ato) { secao = null; ignoradas.push(t.slice(0, 120)); continue; }
      secao = ato.secao;

      if (ato.individual) {
        /* Ato de um militar só: já sai a linha, sem tabela nenhuma. */
        saida.push({
          ord: null,
          num: "",
          nome: limpo(ato.individual.nome),
          mat: ato.individual.mat,
          mat2: ato.individual.id,
          criterio: /MERECIMENTO/i.test(t) ? "MERECIMENTO" : "ANTIGUIDADE",
          qpmp: "",
          deOrdem: secao.de,
          paraOrdem: secao.para,
          dePosto: ROTULO.get(secao.de) || "",
          paraPosto: ROTULO.get(secao.para) || "",
          quadro: "",
          dataAto: secao.data,
          bruta: costurar(linhas.slice(i, i + 4).join("\n")).slice(0, 220),
        });
        secao = null;   // o ato acabou nele mesmo
      }
      continue;
    }

    const dados = lerLinhaTabela(t);
    if (dados && secao) {
      const nome = limpo((pendente ? pendente + " " : "") + dados.nome);
      pendente = "";
      saida.push({
        ord: dados.ord,
        num: "",
        nome,
        mat: dados.a,
        mat2: dados.b,
        criterio: "",
        qpmp: "",
        deOrdem: secao.de,
        paraOrdem: secao.para,
        dePosto: ROTULO.get(secao.de) || "",
        paraPosto: ROTULO.get(secao.para) || "",
        quadro: "",
        dataAto: secao.data,
        bruta: t.slice(0, 220),
      });
      ultimaFoiLinha = i;
      continue;
    }

    /* Nome solto. Se a linha ANTERIOR era uma linha da tabela, o pedaço é o
       rabo dela ("...MENDES DE" / "OLIVEIRA"). Senão, é o começo do nome da
       PRÓXIMA ("BENILTON MENEZES DE" / "1 SOUSA 415790 134361"). */
    if (ehSoNome(t) && !NAO_E_NOME.test(limpo(t))) {
      if (ultimaFoiLinha === i - 1 && saida.length) {
        const ultima = saida[saida.length - 1];
        ultima.nome = limpo(ultima.nome + " " + t);
        /* De propósito NÃO avança o marcador: só a primeira linha solta é
           rabo da anterior. A seguinte já é o começo do nome da PRÓXIMA —
           foi assim que "CARLOS FABRE MATOS CORRÊA" engoliu o "JEAN LEVI
           MOTA" da linha de baixo. */
      } else {
        pendente = (pendente ? pendente + " " : "") + t;
      }
      continue;
    }

    pendente = "";
  }

  return { titulo, linhas: saida, ignoradas };
}
