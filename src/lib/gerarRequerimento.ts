import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

/* =========================================================================
   Gera o DOCX do requerimento a partir do template (substitui dados +
   marca o X da modalidade escolhida). Layout identico ao modelo oficial.

   Templates ficam em /public/templates/:
     - requerimento_comum.docx
     - requerimento_cursos.docx   (quando disponivel)

   IMPORTANTE (Vercel): arquivos de /public NAO entram no bundle da
   serverless function por padrao. Para o fs.readFileSync funcionar em
   producao, adicione no next.config.js:

     experimental: {
       outputFileTracingIncludes: {
         "/api/requerimentos/[id]/gerar": ["./public/templates/**"],
       },
     }
   ========================================================================= */

// mapeia a modalidade -> chave condicional usada no template (X)
const CHAVE_X: Record<string, string> = {
  "AJUDA DE CUSTO": "ajuda",
  "AUXILIO FUNERAL": "funeral",
  "CURSO": "curso",
  "CERTIDÃO PARA FINS DE DIREITO": "certidao",
  "DIÁRIAS": "diarias",
  "DIFERENÇA DE VENCIMENTOS": "diferenca",
  "GRATIFICAÇÃO DE TEMPO DE SERVIÇO": "gratificacao",
  "1/3 DE FÉRIAS": "tercoferias",
  "INCORPORAÇÃO TEMPO DE SERVIÇO": "incorporacao",
  "LICENÇA PRÊMIO": "licpremio",
  "LICENÇA TRATAMENTO INT. PARTICULAR.": "lictratint",
  "LICENÇA TRATAMENTO PESSOAS DA FAMÍLIA": "lictratfam",
  "LICENÇA GESTANTE": "licgestante",
  "LICENÇA PATERNIDADE": "licpaternidade",
  "REVISÃO DE PROVENTOS": "revisao",
  "SALÁRIO FAMÍLIA": "salario",
  "ADIANTAMENTO P/ AQUISIÇÃO DE UNIFORME": "adiantamento",
  "TRANSLADO DE BAGAGEM": "translado",
  "TRANSFERÊNCIA PARA A RESERVA REMUNERADA": "transferencia",
  "OUTROS": "outros",
};

type DadosReq = {
  modelo: string;
  modalidade: string;
  nomeCompleto?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  fone?: string | null;
  dataNasc?: string | null;
  dataInclusao?: string | null;
  matricula?: string | null;
  idPmmaTxt?: string | null;
  postoGrad?: string | null;
  numeroPm?: string | null;
  tempoServico?: string | null;
  estadoCivil?: string | null;
  opmClassificado?: string | null;
  amparoLegal?: string | null;
  infoAdicional?: string | null;
  cpf?: string | null;
  email?: string | null;
};

function s(v: string | null | undefined): string {
  return v == null ? "" : String(v);
}

/* -------------------------------------------------------------------------
   formatarData: aceita QUALQUER entrada e devolve sempre dd/mm/aaaa.
   Trata:
     - vazio/null            -> ""
     - "15/01/2016"          -> "15/01/2016" (ja certo)
     - "2016-01-15" (ISO)    -> "15/01/2016" (sem deslocar fuso)
     - "2016-01-15T00:00..Z" -> "15/01/2016"
     - "Fri Jan 15 2016 ..." -> "15/01/2016" (Date crua salva no banco)
     - irreconhecivel        -> devolve original (nao perde informacao)
   ------------------------------------------------------------------------- */
function formatarData(v: string | null | undefined): string {
  if (!v) return "";
  const txt = String(v).trim();
  if (!txt) return "";

  // ja esta em dd/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(txt)) return txt;

  // ISO aaaa-mm-dd (com ou sem hora) -> trata por regex pra NAO deslocar o dia por fuso
  const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    return `${dia}/${mes}/${ano}`;
  }

  // qualquer outro formato que o Date entenda (ex.: "Fri Jan 15 2016 00:00:00 GMT-0300")
  const dt = new Date(txt);
  if (!isNaN(dt.getTime())) {
    const dia = String(dt.getUTCDate()).padStart(2, "0");
    const mes = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const ano = dt.getUTCFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  // nao reconheceu: devolve como veio
  return txt;
}

export function gerarRequerimentoDocx(d: DadosReq): Buffer {
  const nomeTemplate = d.modelo === "cursos" ? "requerimento_cursos.docx" : "requerimento_comum.docx";
  const caminho = path.join(process.cwd(), "public", "templates", nomeTemplate);

  let content: string;
  try {
    content = fs.readFileSync(caminho, "binary");
  } catch (e) {
    // mensagem clara nos logs: a causa mais comum de 500 aqui no Vercel
    throw new Error(
      `Template DOCX nao encontrado/ilegivel em "${caminho}". ` +
        `No Vercel, arquivos de /public nao entram no bundle da function por padrao — ` +
        `configure experimental.outputFileTracingIncludes no next.config.js apontando para ./public/templates/**. ` +
        `Erro original: ${(e as Error)?.message || e}`
    );
  }

  const doc = new Docxtemplater(new PizZip(content), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  // monta o objeto de dados; cada chave condicional vira true so na escolhida
  const dados: Record<string, string | boolean> = {
    nome: s(d.nomeCompleto),
    endereco: s(d.endereco),
    bairro: s(d.bairro),
    municipio: s(d.municipio),
    fone: s(d.fone),
    datanasc: formatarData(d.dataNasc),
    datainclusao: formatarData(d.dataInclusao),
    matricula: s(d.matricula),
    postograd: s(d.postoGrad),
    numeropm: s(d.numeroPm),
    temposervico: s(d.tempoServico),
    estadocivil: s(d.estadoCivil),
    // No requerimento impresso, a OPM classificada e sempre a OPM em exercicio (este batalhao).
    opmclassificado: "18º BPM",
    amparo: s(d.amparoLegal),
    info: s(d.infoAdicional),
    // cursos
    idpmma: s(d.idPmmaTxt),
    cpf: s(d.cpf),
    email: s(d.email),
  };

  // marca a modalidade escolhida (todas false, exceto a dela)
  for (const chave of Object.values(CHAVE_X)) dados[chave] = false;
  const chaveEscolhida = CHAVE_X[d.modalidade.trim().toUpperCase()];
  if (chaveEscolhida) dados[chaveEscolhida] = true;

  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}
