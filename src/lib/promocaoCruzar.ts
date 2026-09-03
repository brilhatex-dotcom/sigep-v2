import { classificarPatente } from "@/lib/patentes";
import { postoNoMesmoEstilo, type LinhaListao } from "@/lib/promocaoListao";

/* =========================================================================
   CRUZAMENTO: quem do listão é do 18º BPM?

   O listão traz três identificações da mesma pessoa — MAT (matrícula ou, da
   barra 18 em diante, o ID), NUM (número/barra) e NOME — e a ficha do
   efetivo guarda as três. Conferir as três é o que permite confiar num texto
   que veio de OCR: um dígito lido errado derruba UMA chave, não as três.

   A confiança de cada achado sai daqui e vira a cor da linha na tela:

     alta   -> a matrícula (ou o ID) bateu E o posto atual confere com o
               "DE" da seção. É o caso normal.
     media  -> bateu por outra chave (barra + nome), ou a matrícula bateu mas
               o posto atual não é o esperado.
     baixa  -> só o nome bateu. Vem desmarcado na tela; é para o P/1 olhar.

   Nada aqui promove ninguém — só monta a lista para conferência.
   ========================================================================= */

export type FichaEfetivo = {
  id: string;
  nome: string | null;
  nomeGuerra: string | null;
  postoGrad: string | null;
  matricula: string | null;
  numeroBarra: string | null;
  situacao: string | null;
  lotacao: string | null;
  fotoURL: string | null;
};

export type Achado = {
  // do listão
  linha: LinhaListao;
  // da ficha
  efetivoId: string;
  nomeFicha: string;
  postoAtual: string;
  numeroBarra: string;
  matriculaFicha: string;
  lotacao: string;
  // resultado
  postoNovo: string;
  confianca: "alta" | "media" | "baixa";
  porque: string[];        // o que bateu, escrito para o P/1 ler
  alerta: string | null;   // o que NÃO bateu e merece um olho
};

export type ResultadoCruzamento = {
  achados: Achado[];
  // linhas do listão que não são de ninguém do batalhão (a maioria)
  deFora: number;
  // duas linhas do listão caíram na mesma ficha: sempre erro, precisa de olho
  duplicados: { efetivoId: string; nomeFicha: string; ords: (number | null)[] }[];
};

/* ------------------------------------------------------------- ajudas --- */

function limpo(s: string | null): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function soNum(s: string | null): string {
  return (s || "").replace(/\D/g, "");
}

/* Barra "0367/02" e "367/02" são a mesma pessoa: o listão às vezes escreve
   com zero à esquerda e a ficha não (ou o contrário). */
function barraNormal(s: string | null): string {
  const m = (s || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return "";
  return `${parseInt(m[1], 10)}/${m[2].padStart(2, "0").slice(-2)}`;
}

/* Quanto dois nomes se parecem, de 0 a 1, comparando as PALAVRAS.
   Não é distância de letras de propósito: o OCR erra letra solta, e o que
   importa aqui é "é a mesma pessoa", não "é a mesma grafia". */
export function parecencaNome(a: string, b: string): number {
  const pa = limpo(a).split(" ").filter((p) => p.length > 2);
  const pb = limpo(b).split(" ").filter((p) => p.length > 2);
  if (!pa.length || !pb.length) return 0;
  const setB = new Set(pb);
  const iguais = pa.filter((p) => setB.has(p)).length;
  return iguais / Math.max(pa.length, pb.length);
}

/* ---------------------------------------------------------- cruzamento -- */

export function cruzarListao(linhas: LinhaListao[], fichas: FichaEfetivo[]): ResultadoCruzamento {
  // índices para achar sem varrer o efetivo inteiro a cada linha
  const porMatricula = new Map<string, FichaEfetivo>();
  const porId = new Map<string, FichaEfetivo>();
  const porBarra = new Map<string, FichaEfetivo[]>();

  for (const f of fichas) {
    const mt = soNum(f.matricula);
    if (mt) porMatricula.set(mt, f);
    const id = soNum(f.id);
    if (id) porId.set(id, f);
    const b = barraNormal(f.numeroBarra);
    if (b) porBarra.set(b, [...(porBarra.get(b) || []), f]);
  }

  const achados: Achado[] = [];
  let deFora = 0;

  for (const linha of linhas) {
    const barra = barraNormal(linha.num);

    let ficha: FichaEfetivo | null = null;
    const porque: string[] = [];

    /* Os números que o documento deu para esta pessoa. O listão da CPPPM traz
       um só (a coluna MAT, que é a matrícula — ou o ID, de quem é da barra 18
       em diante). O Diário Oficial traz os dois, e às vezes com as colunas
       trocadas de uma tabela para outra. Em vez de depender do cabeçalho,
       tenta cada número contra matrícula E contra ID. */
    for (const n of [linha.mat, linha.mat2 || ""]) {
      if (!n || ficha) continue;
      if (porMatricula.has(n)) { ficha = porMatricula.get(n)!; porque.push("matrícula " + n); }
      else if (porId.has(n)) { ficha = porId.get(n)!; porque.push("ID " + n); }
    }
    // 3) número/barra + nome parecido
    if (!ficha && barra) {
      const candidatos = porBarra.get(barra) || [];
      const bom = candidatos.find((c) => parecencaNome(linha.nome, c.nome || c.nomeGuerra || "") >= 0.5);
      if (bom) { ficha = bom; porque.push("nº/barra " + linha.num + " + nome"); }
    }
    // 4) só o nome, e tem de ser bem parecido (vem como "baixa")
    if (!ficha) {
      let melhor: FichaEfetivo | null = null;
      let melhorNota = 0;
      for (const f of fichas) {
        const nota = parecencaNome(linha.nome, f.nome || f.nomeGuerra || "");
        if (nota > melhorNota) { melhorNota = nota; melhor = f; }
      }
      if (melhor && melhorNota >= 0.8) { ficha = melhor; porque.push("nome (" + Math.round(melhorNota * 100) + "%)"); }
    }

    if (!ficha) { deFora++; continue; }

    /* O posto atual da ficha tem de ser o "DE" da seção. Quando não é, o
       achado continua na lista — mas com aviso e desmarcado, porque pode ser
       ficha desatualizada OU pessoa errada. */
    const ordemAtual = classificarPatente(ficha.postoGrad).ordem;
    const postoConfere = ordemAtual === linha.deOrdem;
    const nota = parecencaNome(linha.nome, ficha.nome || ficha.nomeGuerra || "");

    let confianca: Achado["confianca"];
    let alerta: string | null = null;

    if (!postoConfere) {
      confianca = "baixa";
      alerta = ordemAtual === linha.paraOrdem
        ? `Já consta como ${ficha.postoGrad} — parece que esta promoção já foi lançada.`
        : `A ficha está como "${ficha.postoGrad || "sem posto"}", mas o listão promove de ${linha.dePosto}.`;
    } else if (porque[0]?.startsWith("nome")) {
      confianca = "baixa";
      alerta = "Achado só pelo nome: confira a matrícula antes de promover.";
    } else if (nota < 0.5) {
      confianca = "media";
      alerta = `O nome no listão ("${linha.nome}") não está batendo com o da ficha ("${ficha.nome || ""}").`;
    } else if (porque[0]?.startsWith("nº/barra")) {
      confianca = "media";
    } else {
      confianca = "alta";
    }

    if (nota >= 0.5 && !porque.some((p) => p.startsWith("nome"))) porque.push("nome confere");
    if (postoConfere) porque.push(`está como ${ficha.postoGrad}`);

    achados.push({
      linha,
      efetivoId: ficha.id,
      nomeFicha: (ficha.nome || ficha.nomeGuerra || "").trim(),
      postoAtual: ficha.postoGrad || "",
      numeroBarra: ficha.numeroBarra || "",
      matriculaFicha: ficha.matricula || "",
      lotacao: ficha.lotacao || "",
      postoNovo: postoNoMesmoEstilo(ficha.postoGrad, linha.paraOrdem),
      confianca,
      porque,
      alerta,
    });
  }

  /* Duas linhas do listão apontando para a mesma ficha é sempre erro de
     leitura. Marca as duas para o P/1 decidir, em vez de promover duas vezes. */
  const porFicha = new Map<string, Achado[]>();
  for (const a of achados) porFicha.set(a.efetivoId, [...(porFicha.get(a.efetivoId) || []), a]);
  const duplicados: ResultadoCruzamento["duplicados"] = [];
  for (const [efetivoId, lista] of porFicha) {
    if (lista.length < 2) continue;
    duplicados.push({ efetivoId, nomeFicha: lista[0].nomeFicha, ords: lista.map((x) => x.linha.ord) });
    for (const a of lista) {
      a.confianca = "baixa";
      a.alerta = "Duas linhas do listão caíram nesta mesma pessoa — só uma pode valer.";
    }
  }

  return { achados, deFora, duplicados };
}
