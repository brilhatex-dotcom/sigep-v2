import type { ItemTexto } from "@/lib/lerArquivoTexto";
import type { DadosHistorico } from "@/lib/historicoPolicial";

/* =========================================================================
   FICHA INDIVIDUAL DO SGI (PMMA) -> histórico policial militar.

   É outro documento: sai do Sistema de Gerenciamento de Informação da
   Corporação, com a identificação funcional e o EXTRATO DE PUBLICAÇÕES —
   toda nota de boletim do militar, com número, data, finalidade e período.

   Vale muito mais do que parece. O que faltava nas sugestões do SIGEP era
   justamente o NÚMERO DO BOLETIM, e é ele que a ficha traz, publicação por
   publicação. Aqui cada linha vira uma frase pronta na seção certa:

     "BG nº 121/2026 de 08/07/2026, publicou Concessão de Gozo de Férias
      Regulamentares, em 06/02/2026;"

   O extrato é uma TABELA, e uma célula quebra em várias linhas. Por isso a
   leitura é por COLUNA (a posição x de cada pedaço), com as fronteiras
   tiradas do próprio cabeçalho da tabela — não de medidas fixas, que
   mudariam a cada versão do relatório.
   ========================================================================= */

export type LinhaBoletim = {
  tipo: string; numero: string; dataBoletim: string;
  parte: string; finalidade: string;
  inicio: string; fim: string; promocao: string; media: string;
};

export type LeituraFicha = {
  matricula: string;
  nome: string;
  nomeGuerra: string;
  postoGrad: string;
  quadro: string;
  dataNasc: string;
  linhas: LinhaBoletim[];
};

const cru = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* O relatório do SGI se identifica pelo título e pelo quadro do extrato. */
export function ehFichaIndividual(texto: string): boolean {
  const t = cru(texto);
  return t.includes("IDENTIFICACAOFUNCIONAL") && t.includes("PUBLICACOESBOLETIM");
}

/* ------------------------------------------------------- colunas */

/* Onde cada coluna começa e qual é qual.

   Os títulos não são únicos ("DATA" aparece quatro vezes) nem sempre são os
   mesmos entre versões do relatório, então o que vale é a ORDEM em que
   aparecem no cabeçalho: o meio entre dois títulos vizinhos vira a fronteira,
   e a posição de cada um diz qual coluna é qual. Fixar índices na mão
   quebraria no dia em que o SGI acrescentasse uma coluna — e chegou a
   quebrar: o extrato tem TRÊS colunas de "NOTA", não duas. */
type Tabela = { cortes: number[]; indice: Record<string, number> };

function tabelaDoCabecalho(itens: ItemTexto[]): Tabela | null {
  const porLinha = new Map<number, ItemTexto[]>();
  for (const i of itens) {
    if (!porLinha.has(i.y)) porLinha.set(i.y, []);
    porLinha.get(i.y)!.push(i);
  }
  for (const y of Array.from(porLinha.keys()).sort((a, b) => a - b)) {
    const linha = porLinha.get(y)!.sort((a, b) => a.x - b.x);
    const titulos = linha.map((i) => cru(i.t));
    if (!titulos.some((t) => t === "TIPO") || !titulos.some((t) => t.startsWith("FINALIDADE"))) continue;
    if (linha.length < 8) continue;   // cabeçalho picado demais; tenta a próxima

    const indice: Record<string, number> = {};
    const fim = titulos.indexOf("FINALIDADE");
    titulos.forEach((t, k) => {
      if (t === "TIPO") indice.tipo ??= k;
      else if (t.startsWith("BOLETIMN")) indice.numero ??= k;
      else if (t.startsWith("PARTE")) indice.parte ??= k;
      else if (t.startsWith("FINALIDADE")) indice.finalidade ??= k;
      else if (t.startsWith("MEDIA")) indice.media ??= k;
      else if (t === "DATA") {
        // antes da finalidade é a data do boletim; depois, início, fim e promoção
        if (k < fim) indice.dataBoletim ??= k;
        else if (indice.inicio === undefined) indice.inicio = k;
        else if (indice.fim === undefined) indice.fim = k;
        else indice.promocao ??= k;
      }
    });
    if (indice.numero === undefined || indice.finalidade === undefined) continue;

    const xs = linha.map((i) => i.x);
    const cortes: number[] = [];
    for (let k = 1; k < xs.length; k++) cortes.push((xs[k - 1] + xs[k]) / 2);
    return { cortes, indice };
  }
  return null;
}

function colunaDe(x: number, cortes: number[]): number {
  let i = 0;
  while (i < cortes.length && x >= cortes[i]) i++;
  return i;
}

/* "1212026" -> "121/2026". O SGI cola número e ano; separar é o que deixa a
   frase sair como o boletim é citado no papel. */
function numeroBarraAno(bruto: string): string {
  const d = (bruto || "").replace(/\D/g, "");
  if (d.length < 5) return bruto.trim();
  return `${String(Number(d.slice(0, -4)))}/${d.slice(-4)}`;
}

const SIGLA: [RegExp, string][] = [
  [/interno\s+especial/i, "BIE"],
  [/reservado/i, "BR"],
  [/interno/i, "BI"],
  [/geral/i, "BG"],
];
function siglaDoTipo(tipo: string): string {
  for (const [re, s] of SIGLA) if (re.test(tipo)) return s;
  return "BOL";
}

const dataOk = (d: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(d) && !d.startsWith("00/00");

export function lerFichaIndividual(paginas: ItemTexto[][]): LeituraFicha {
  const linhas: LinhaBoletim[] = [];
  const todoTexto = paginas.flat().map((i) => i.t).join(" ");

  for (const itens of paginas) {
    const tabela = tabelaDoCabecalho(itens);
    if (!tabela) continue;
    const { cortes, indice } = tabela;

    // agrupa por linha do papel e separa cada uma em colunas
    const porLinha = new Map<number, ItemTexto[]>();
    for (const i of itens) {
      if (!porLinha.has(i.y)) porLinha.set(i.y, []);
      porLinha.get(i.y)!.push(i);
    }

    let atual: string[][] | null = null;
    const fechar = () => {
      if (!atual) return;
      const cel = (nome: string) => {
        const n = indice[nome];
        return n === undefined ? "" : (atual![n] || []).join(" ").replace(/\s+/g, " ").trim();
      };
      const numero = cel("numero").replace(/\(dompdf.*$/i, "").replace(/ID=\d+\)?/i, "").trim();
      if (numero) {
        linhas.push({
          tipo: cel("tipo"), numero, dataBoletim: cel("dataBoletim"),
          parte: cel("parte"), finalidade: cel("finalidade"),
          inicio: cel("inicio"), fim: cel("fim"), media: cel("media"), promocao: cel("promocao"),
        });
      }
      atual = null;
    };

    for (const y of Array.from(porLinha.keys()).sort((a, b) => a - b)) {
      const linha = porLinha.get(y)!.sort((a, b) => a.x - b.x);
      const celulas: string[][] = Array.from({ length: cortes.length + 1 }, () => []);
      for (const i of linha) celulas[colunaDe(i.x, cortes)].push(i.t);

      const primeira = celulas[0].join(" ").trim();
      const cabecalho = cru(linha.map((i) => i.t).join(" ")).includes("PARTEBOLETIM");
      if (cabecalho) { fechar(); continue; }

      /* Registro novo começa na coluna do TIPO ("Boletim Geral", "Portaria").
         As linhas seguintes são a continuação das células que quebraram. */
      if (/^(boletim|portaria|ato|di[áa]rio)\b/i.test(primeira)) {
        fechar();
        atual = celulas;
      } else if (atual) {
        for (let k = 0; k < celulas.length; k++) atual[k].push(...celulas[k]);
      }
    }
    fechar();
  }

  const acha = (re: RegExp) => (todoTexto.match(re)?.[1] || "").trim();
  const q = quadroDeIdentificacao(paginas);
  return {
    matricula: q.matricula || acha(/Mat:\s*(\d{3,10})/i),
    /* O nome COMPLETO só existe no quadro de identificação. O cabeçalho da
       página traz o nome de guerra ("Nome: SILAS"), que não serve para casar
       com a ficha do efetivo. */
    nome: q.nome,
    nomeGuerra: q.nomeGuerra || acha(/Nome:\s*([A-Za-zÀ-ü]+)\s+Mat:/i),
    postoGrad: q.postoGrad || acha(/Posto\/Grad:\s*([^\n]{2,20}?)\s*-\s*[A-Z]{3,6}\s+Nome:/i),
    quadro: q.quadro || acha(/Posto\/Grad:[^\n]*?-\s*([A-Z]{3,6})\s+Nome:/i),
    dataNasc: q.dataNasc,
    linhas,
  };
}

/* ------------------------------------------- para onde vai cada linha */

/* A PARTE do boletim é o sinal mais forte: a Corporação já classifica ali o
   assunto ("4.2 DISCIPLINA", "4.2.1 RECOMPENSA", "2.1 ENSINO"). A finalidade
   entra depois, para separar o que a parte não distingue. */
const REGRAS: { secao: string; parte?: RegExp; fin?: RegExp }[] = [
  { secao: "IX.bravura", parte: /RECOMPENSA/i },
  { secao: "IX.bravura", fin: /elogio|refer[êe]ncia elogiosa|a[çc][ãa]o merit[óo]ria/i },
  { secao: "XIII.prisao", fin: /\bpris[ãa]o\b/i },
  { secao: "XIII.detencao", fin: /\bdeten[çc][ãa]o\b/i },
  { secao: "XIII.repreensao", fin: /repreens[ãa]o|advert[êe]ncia/i },
  { secao: "XIII.prisao", parte: /DISCIPLINA/i },
  { secao: "VII.ferias", fin: /f[ée]rias/i },
  { secao: "VII.lp", fin: /licen[çc]a\s*pr[êe]mio/i },
  { secao: "VII.dispensas", fin: /dispensa/i },
  { secao: "VIII.situacao", fin: /\bJMS\b|junta\s+m[ée]dica|inspe[çc][ãa]o\s+de\s+sa[úu]de/i },
  { secao: "IV", fin: /promo[çc][ãa]o por|promovido|declara[çc][ãa]o de aspirante/i },
  { secao: "VI", fin: /averba[çc][ãa]o/i },
  { secao: "V", fin: /exclus[ãa]o|licenciamento|demiss[ãa]o/i },
  { secao: "XII", fin: /\bIPM\b|sindic[âa]ncia|conselho de disciplina|deser[çc][ãa]o|processo/i },
  { secao: "III.outros", parte: /ENSINO/i },
  { secao: "III.outros", fin: /matr[íi]cula dos alunos|conclus[ãa]o do?\s+c|conclus[ãa]o de curso|plano de est[áa]gio|\bcurso\b/i },
];

export function secaoDaLinha(l: LinhaBoletim): string {
  for (const r of REGRAS) {
    if (r.parte && r.parte.test(l.parte)) return r.secao;
    if (r.fin && r.fin.test(l.finalidade)) return r.secao;
  }
  // o resto é publicação em boletim, que é o que a seção XV guarda
  return "XV";
}

/* A frase como o histórico escreve: boletim, data, o que publicou e quando. */
export function fraseDaLinha(l: LinhaBoletim): string {
  const bol = `${siglaDoTipo(l.tipo)} nº ${numeroBarraAno(l.numero)}`;
  const quando = dataOk(l.dataBoletim) ? ` de ${l.dataBoletim}` : "";
  let periodo = "";
  if (dataOk(l.inicio) && dataOk(l.fim) && l.inicio !== l.fim) periodo = `, no período de ${l.inicio} a ${l.fim}`;
  else if (dataOk(l.inicio)) periodo = `, em ${l.inicio}`;
  /* Só vale escrever "a contar de" quando a data de promoção diz algo NOVO:
     em muitas notas ela repete o próprio período e viraria ruído. */
  const promo = dataOk(l.promocao) && l.promocao !== l.inicio && l.promocao !== l.fim
    ? `, a contar de ${l.promocao}` : "";
  const media = l.media && l.media !== "0" ? `, média final ${l.media}` : "";
  return `${bol}${quando}, publicou ${l.finalidade}${periodo}${promo}${media};`;
}

/* Monta o histórico a partir da ficha. As linhas de cada seção saem da mais
   ANTIGA para a mais nova, que é como o histórico é lido. */
export function fichaParaHistorico(f: LeituraFicha): {
  dados: DadosHistorico;
  porSecao: { secao: string; quantas: number }[];
} {
  const secoes: Record<string, string[]> = {};
  const ordenadas = [...f.linhas].sort((a, b) => chaveData(a) - chaveData(b));
  for (const l of ordenadas) {
    if (!l.finalidade.trim()) continue;
    const s = secaoDaLinha(l);
    (secoes[s] ||= []).push(fraseDaLinha(l));
  }

  const campos: Record<string, string> = {};
  if (f.nome) campos.nome = f.nome;
  if (f.matricula) campos.matricula = f.matricula;
  if (f.postoGrad) campos.postoGrad = [f.postoGrad, f.quadro].filter(Boolean).join(" ");
  if (f.dataNasc) campos.dataNasc = f.dataNasc;

  return {
    dados: {
      campos,
      secoes: Object.fromEntries(Object.entries(secoes).map(([k, v]) => [k, v.join("\n")])),
      dataDoc: "",
      chefe: "",
    },
    porSecao: Object.entries(secoes).map(([secao, v]) => ({ secao, quantas: v.length }))
      .sort((a, b) => a.secao.localeCompare(b.secao)),
  };
}

/* O quadro "1 - IDENTIFICAÇÃO FUNCIONAL": os valores ficam na linha ABAIXO
   dos rótulos, cada um debaixo do seu. Ler por posição é o que separa o nome
   completo do nome de guerra, que no texto corrido saem colados. */
function quadroDeIdentificacao(paginas: ItemTexto[][]) {
  const vazio = { nome: "", nomeGuerra: "", postoGrad: "", quadro: "", matricula: "", dataNasc: "" };
  for (const itens of paginas) {
    const porLinha = new Map<number, ItemTexto[]>();
    for (const i of itens) {
      if (!porLinha.has(i.y)) porLinha.set(i.y, []);
      porLinha.get(i.y)!.push(i);
    }
    const ys = Array.from(porLinha.keys()).sort((a, b) => a - b);
    const out = { ...vazio };
    for (let k = 0; k < ys.length - 1; k++) {
      const rotulos = porLinha.get(ys[k])!.sort((a, b) => a.x - b.x);
      const junto = cru(rotulos.map((r) => r.t).join(""));
      const valores = porLinha.get(ys[k + 1])!.sort((a, b) => a.x - b.x);

      /* Cada valor fica debaixo do seu rótulo: o rótulo mais próximo à
         esquerda (com folga) é o dono da célula. */
      const doRotulo = (alvo: string) => {
        const r = rotulos.find((x) => cru(x.t).startsWith(alvo));
        if (!r) return "";
        const proximo = rotulos.find((x) => x.x > r.x + 2);
        const limite = proximo ? proximo.x - 4 : Infinity;
        return valores.filter((v) => v.x >= r.x - 6 && v.x < limite).map((v) => v.t).join(" ").replace(/\s+/g, " ").trim();
      };

      if (junto.includes("POSTGRAD") && junto.includes("NOMEDEGUERRA")) {
        out.postoGrad = doRotulo("POSTGRAD");
        out.nome = doRotulo("NOME") && !cru(doRotulo("NOME")).startsWith("NOMEDEGUERRA") ? doRotulo("NOME") : "";
        out.nomeGuerra = doRotulo("NOMEDEGUERRA");
      }
      if (junto.includes("MATRICULA") && junto.includes("QUADRO")) {
        out.matricula = doRotulo("MATRICULA");
        out.quadro = doRotulo("QUADRO");
        out.dataNasc = doRotulo("DATANASC");
      }
    }
    if (out.nome || out.matricula) return out;
  }
  return vazio;
}

/* "08/07/2026" -> 20260708, para ordenar sem montar Date. */
function chaveData(l: LinhaBoletim): number {
  const d = dataOk(l.inicio) ? l.inicio : l.dataBoletim;
  const m = (d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}
