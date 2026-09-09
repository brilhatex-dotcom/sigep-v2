import { SECOES, CAMPOS_PESSOAIS, CAMPOS_FUNCIONAIS, type DadosHistorico } from "@/lib/historicoPolicial";

/* =========================================================================
   IMPORTAR UM HISTÓRICO JÁ PRONTO (Word ou PDF) para dentro do SIGEP.

   O Batalhão tem os históricos antigos em arquivo. Redigitar tudo à mão
   seria trabalho de semanas, então o arquivo é lido e as quinze seções são
   separadas sozinhas — o P/1 confere e salva.

   A separação é pelo TÍTULO DA SEÇÃO ("IV – PROMOÇÕES COM AS RESPECTIVAS
   DATAS E BG"). O número romano sozinho não basta: "I" e "V" aparecem no meio
   de qualquer frase. Por isso o casamento é romano + travessão + um título
   que se pareça com o do modelo.

   Nada é adivinhado: o que não for reconhecido volta na lista de "linhas que
   não entraram", para o P/1 ver o que ficou de fora em vez de descobrir
   depois que o histórico saiu capado.
   ========================================================================= */

export type Importacao = {
  dados: DadosHistorico;
  achadas: { secao: string; titulo: string; tamanho: number }[];
  ignoradas: string[];
};

/* "PROMOÇÕES / RAZÕES" -> "PROMOCOESRAZOES": tira acento, pontuação e
   espaço, para comparar título de seção sem depender de digitação. */
function crua(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

/* Cabeçalho de seção: "IV – PROMOÇÕES ...". Aceita hífen, travessão ou dois
   pontos no lugar do traço, e sobra de tabulação da conversão do arquivo. */
function cabecalhoDeSecao(linha: string): { num: string; titulo: string } | null {
  const m = linha.trim().match(/^\(?\s*([IVX]{1,5})\s*[)\-–—:.]+\s*(.{3,})$/i);
  if (!m) return null;
  const num = m[1].toUpperCase();
  if (!ROMANOS.includes(num)) return null;
  const titulo = m[2].replace(/\s+/g, " ").trim();

  const esperado = SECOES.find((s) => s.num === num);
  if (!esperado) return null;
  /* O título tem que PARECER o do modelo: as primeiras palavras batendo já
     resolvem ("FÉRIAS / LICENÇAS CONCESSÃO (GOZO)" contra "FÉRIAS/LICENÇAS
     (CONCESSÃO)"). Sem essa conferência, uma linha do corpo que comece com
     "V." viraria seção nova e picaria o texto no meio. */
  const a = crua(titulo), b = crua(esperado.titulo);
  const parecido = a.startsWith(b.slice(0, 10)) || b.startsWith(a.slice(0, 10));
  return parecido ? { num, titulo } : null;
}

/* Alínea: "a) FÉRIAS:", "b) - LICENÇA PRÊMIO:", "1) – MEDALHA ...".
   `tipo` diz se a marca é letra ou número — ver o uso na separação. */
function inicioDeAlinea(linha: string): { indice: number; resto: string; tipo: "letra" | "numero" } | null {
  const m = linha.trim().match(/^([a-j]|\d{1,2})\s*[)\-–—.]\s*[-–—]?\s*(.*)$/i);
  if (!m) return null;
  const marca = m[1].toLowerCase();
  const numero = /\d/.test(marca);
  const indice = numero ? Number(marca) - 1 : marca.charCodeAt(0) - 97;
  if (indice < 0 || indice > 9) return null;
  return { indice, resto: m[2], tipo: numero ? "numero" : "letra" };
}

/* Tira do começo do valor o rótulo que o modelo repete ("FÉRIAS:", "PRISÃO:"). */
function semRotulo(texto: string, rotulo: string): string {
  const linhas = texto.split("\n");
  const primeira = linhas[0] || "";
  const corte = primeira.indexOf(":");
  if (corte > 0) {
    const cabeca = crua(primeira.slice(0, corte));
    const alvo = crua(rotulo);
    /* Serve tanto para o rótulo escrito por extenso ("DATA DA ÚLTIMA JMS")
       quanto para a forma curta do modelo ("CFO:" contra "CFO / ANO"). */
    const eleMesmo = cabeca && (cabeca.startsWith(alvo.slice(0, 6)) || alvo.startsWith(cabeca));
    if (eleMesmo) linhas[0] = primeira.slice(corte + 1).trim();
  }
  return linhas.join("\n").trim();
}

const VAZIOS = ["", "SEMALTERACAO", "SEMALTERACOES", "NADACONSTA", "NAOCONSTA"];
const ehVazio = (v: string) => VAZIOS.includes(crua(v));

/* Linhas do fim do documento que NÃO são conteúdo de seção: o "Quartel do
   18º BPM, em ..." e a assinatura do Chefe do P/1. */
function cortarRodape(linhas: string[]): { corpo: string[]; dataDoc: string; chefe: string } {
  const i = linhas.findIndex((l) => /^quartel\s+do\s+18/i.test(l.trim()));
  if (i < 0) return { corpo: linhas, dataDoc: "", chefe: "" };
  const resto = linhas.slice(i + 1).map((l) => l.trim()).filter(Boolean);
  return { corpo: linhas.slice(0, i), dataDoc: dataDoIso(linhas[i]), chefe: resto[0] || "" };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/* "…, 04 de março de 2024." -> "2024-03-04" */
function dataDoIso(linha: string): string {
  const m = (linha || "").match(/(\d{1,2})\s+de\s+([a-zçãéêó]+)\s+de\s+(\d{4})/i);
  if (!m) return "";
  const mes = MESES.findIndex((x) => crua(x) === crua(m[2]));
  if (mes < 0) return "";
  return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/* Campos "RÓTULO: valor" das seções I e II. */
function lerCampos(linhas: string[], lista: typeof CAMPOS_PESSOAIS, campos: Record<string, string>, ignoradas: string[]) {
  let ultima = "";
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha) continue;

    /* "DATA DE INCLUSÃO: 02/01/1992.   BOLETIM GERAL Nº 143 de 03/08/1992."
       são dois campos na mesma linha no modelo do praça. */
    const partido = linha.match(/^(.*?)(BOLETIM\s+GERAL\s*N?[ºo°]?\s*:?.*)$/i);
    const pedacos = partido && partido[1].includes(":") ? [partido[1], partido[2]] : [linha];

    for (const pedaco of pedacos) {
      /* "BOLETIM GERAL Nº 143 de 03/08/1992" vem sem dois-pontos no modelo do
         praça — sem isto virava continuação da data de inclusão. */
      const bg = pedaco.trim().match(/^BOLETIM\s+GERAL\s*N?[ºo°]?\s*:?\s*(.*)$/i);
      if (bg) { campos.bgInclusao = bg[1].trim().replace(/[;.]$/, ""); ultima = "bgInclusao"; continue; }

      const corte = pedaco.indexOf(":");
      const rotulo = corte > 0 ? pedaco.slice(0, corte) : "";
      const valor = corte > 0 ? pedaco.slice(corte + 1).trim().replace(/[;.]$/, "") : pedaco.trim();
      /* A marca da alínea sai dos DOIS lados antes de comparar: o modelo
         escreve "a) - ARREGIMENTADA:" e o rótulo do formulário também. */
      const semAlinea = (x: string) => crua(x.replace(/^\s*[a-j]\s*[)\-–—.]\s*[-–—]?\s*/i, ""));
      const chave = corte > 0
        ? lista.find((c) => {
            const r = semAlinea(rotulo), alvo = semAlinea(c.rotulo);
            return !!r && !!alvo && (r === alvo || r.startsWith(alvo) || alvo.startsWith(r));
          })?.chave
        : undefined;

      if (chave) {
        campos[chave] = valor;
        ultima = chave;
      } else if (ultima && corte < 0) {
        /* Continuação: a FILIAÇÃO do modelo do oficial põe mãe e pai nas
           linhas de baixo, sem rótulo. */
        campos[ultima] = [campos[ultima], valor].filter(Boolean).join("\n");
      } else if (pedaco.trim()) {
        ignoradas.push(pedaco.trim());
      }
    }
  }
}

export function importarHistorico(textoBruto: string): Importacao {
  const dados: DadosHistorico = { campos: {}, secoes: {}, dataDoc: "", chefe: "" };
  const achadas: Importacao["achadas"] = [];
  const ignoradas: string[] = [];

  const linhas = (textoBruto || "")
    .replace(/\r/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/\t+/g, "  ").replace(/\s+$/, ""))
    // sobra de célula de tabela na conversão de alguns arquivos
    .map((l) => (l.trim() === "|" ? "" : l.replace(/^\s*\|\s*/, "")));

  const { corpo, dataDoc, chefe } = cortarRodape(linhas);
  dados.dataDoc = dataDoc;
  dados.chefe = chefe;

  /* Reparte em blocos por cabeçalho de seção. O que vem ANTES da primeira
     seção é o timbre do documento — não interessa. */
  const blocos: { num: string; titulo: string; linhas: string[] }[] = [];
  for (const linha of corpo) {
    const cab = cabecalhoDeSecao(linha);
    if (cab) { blocos.push({ ...cab, linhas: [] }); continue; }
    if (blocos.length) blocos[blocos.length - 1].linhas.push(linha);
  }

  for (const bloco of blocos) {
    const sec = SECOES.find((s) => s.num === bloco.num);
    if (!sec) continue;
    const uteis = bloco.linhas.filter((l) => l.trim() !== "");
    achadas.push({ secao: sec.num, titulo: sec.titulo, tamanho: uteis.length });

    if (sec.num === "I") { lerCampos(uteis, CAMPOS_PESSOAIS, dados.campos, ignoradas); continue; }
    if (sec.num === "II") { lerCampos(uteis, CAMPOS_FUNCIONAIS, dados.campos, ignoradas); continue; }

    if (sec.itens) {
      /* Reparte em alíneas. O que vier antes da primeira ("a)") fica na
         primeira mesmo — é como os modelos escrevem quando a seção tem um
         parágrafo solto no topo. */
      const partes = new Map<number, string[]>();
      let atual = 0;
      /* A seção X numera as condecorações ("1) 2) 3) 4)") e DENTRO da quarta
         ainda abre "a) 30 anos, b) 20 anos". Travando no tipo da primeira
         marca, o "a)" de dentro fica onde está em vez de virar a alínea A da
         seção e embaralhar tudo. */
      let tipoAlinea: "letra" | "numero" | null = null;
      for (const linha of bloco.linhas) {
        const ini = inicioDeAlinea(linha);
        if (ini && !tipoAlinea) tipoAlinea = ini.tipo;
        if (ini && ini.tipo === tipoAlinea && ini.indice < sec.itens.length) {
          atual = ini.indice;
          if (!partes.has(atual)) partes.set(atual, []);
          if (ini.resto.trim()) partes.get(atual)!.push(ini.resto);
          continue;
        }
        if (!partes.has(atual)) partes.set(atual, []);
        partes.get(atual)!.push(linha);
      }
      sec.itens.forEach((it, i) => {
        const texto = (partes.get(i) || []).join("\n").trim();
        const limpo = semRotulo(texto, it.rotulo);
        if (limpo && !ehVazio(limpo)) dados.secoes[`${sec.num}.${it.chave}`] = limpo;
      });
      continue;
    }

    const texto = bloco.linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (texto && !ehVazio(texto)) dados.secoes[sec.num] = texto;
  }

  return { dados, achadas, ignoradas: ignoradas.slice(0, 40) };
}

/* Junta o que veio do arquivo com o que já estava salvo.
   `substituir` = o arquivo manda; senão só preenche o que estiver em branco,
   para uma importação nunca apagar o que o P/1 já tinha escrito à mão. */
export function juntar(atual: DadosHistorico, novo: DadosHistorico, substituir: boolean): DadosHistorico {
  const mistura = (a: Record<string, string>, b: Record<string, string>) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (!v.trim()) continue;
      if (substituir || !(out[k] || "").trim()) out[k] = v;
    }
    return out;
  };
  return {
    campos: mistura(atual.campos, novo.campos),
    secoes: mistura(atual.secoes, novo.secoes),
    dataDoc: substituir ? (novo.dataDoc || atual.dataDoc) : (atual.dataDoc || novo.dataDoc),
    chefe: substituir ? (novo.chefe || atual.chefe) : (atual.chefe || novo.chefe),
  };
}
