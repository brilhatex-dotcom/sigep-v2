import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { ehModeloAquisicao } from "@/lib/requerimentos";

/* =========================================================================
   Gera o DOCX do requerimento a partir do template (substitui dados +
   marca o X da modalidade escolhida). Layout identico ao modelo oficial.

   Templates ficam em /public/templates/:
     - requerimento_comum.docx
     - requerimento_cursos.docx   (quando disponivel)
     - requerimento_aquisicao_restrito.docx  (formulario do Exercito/SisFPC)

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
  // Armamento/material belico: a folha oficial nao tem quadrinho proprio,
  // entao marcam o "OUTROS" e a especificacao sai entre parenteses ao lado.
  "CAUTELA DE ARMA DE FOGO (ACAF)": "outros",
  "CAUTELA DE COLETE BALÍSTICO": "outros",
  "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO": "outros",
};

type DadosReq = {
  modelo: string;
  modalidade: string;
  modalidadeOutros?: string | null;
  nomeCompleto?: string | null;
  endereco?: string | null;
  complemento?: string | null;
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
  opmExercicio?: string | null;
  amparoLegal?: string | null;
  infoAdicional?: string | null;
  cpf?: string | null;
  email?: string | null;
  // pagina 2 (so modelo "cursos")
  p2Conceito?: string | null;
  p2UltimaPromocao?: string | null;
  p2SituacaoJur?: string | null; // JSON {bgNumero, bgData} — ver comentario abaixo
  p2Complementares?: string | null;
};

function s(v: string | null | undefined): string {
  return v == null ? "" : String(v);
}

// "18/02/2014" -> "18 de fevereiro de 2014"
const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPorExtenso(dataBR: string): string {
  const m = dataBR.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dataBR;
  const dia = parseInt(m[1], 10);
  const mes = MESES_EXT[parseInt(m[2], 10) - 1];
  if (!mes) return dataBR;
  return `${dia} de ${mes} de ${m[3]}`;
}

/* Compoe os 6 itens da "Situação Jurídica do Militar" da pagina 2 do
   requerimento de cursos (CAS/CFS/CFC), no mesmo texto usado nos
   requerimentos reais protocolados no 18º BPM.

   Itens 1º-3º e 5º sao SEMPRE OS MESMOS (nao variam por militar) — ficam
   fixos aqui, nao sao campo de formulario. O 4º vem da ultima promocao +
   BG (campos que o requerente preenche). O 6º e derivado sozinho da DATA DE
   INCLUSAO que a ficha ja tem, convertida por extenso — ninguem precisa
   digitar de novo uma informacao que o cadastro ja sabe. */
function composeSituacaoJuridica(d: {
  p2UltimaPromocao?: string | null; p2SituacaoJur?: string | null;
  dataInclusao?: string | null; opmExercicio?: string | null;
}): string {
  let bgNumero = "", bgData = "";
  try {
    const j = d.p2SituacaoJur ? JSON.parse(d.p2SituacaoJur) : {};
    bgNumero = s(j?.bgNumero);
    bgData = formatarData(s(j?.bgData));
  } catch { /* campo antigo/vazio: segue sem BG */ }

  const opm = s(d.opmExercicio) || "18º BPM";
  const dataPromocao = formatarData(s(d.p2UltimaPromocao));
  const item4 = bgNumero || bgData
    ? `4º) Data da última promoção ${dataPromocao} (BG nº ${bgNumero} de ${bgData})`
    : `4º) Data da última promoção ${dataPromocao}`;
  const dataInclusaoExt = dataPorExtenso(formatarData(s(d.dataInclusao)));

  return [
    "1º) Não está sub-júdice, nem responde a Inquérito Policial, Policial Militar ou Técnico, Sindicância ou Conselho de Disciplina;",
    "2º) Não foi punido disciplinarmente por transgressão de natureza grave, no período de 12 (doze) meses até a data de encerramento das inscrições;",
    "3º) Não está condenado a pena privativa de liberdade, medida de segurança ou qualquer condenação compatível com a função policial militar;",
    item4,
    `5º) Está em pleno desempenho de suas atividades policiais militares na Sede do ${opm}.`,
    `6º) O policial militar foi incluído no dia ${dataInclusaoExt}.`,
  ].join("\n");
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

/* PCE (produto controlado) do requerimento de aquisicao de uso restrito.
   O banco nao tem colunas proprias pra produto/marca/modelo/calibre/quantidade
   — em vez de pedir migracao, viajam como JSON em p2Complementares (coluna que
   so o modelo de cursos usa, e nunca ao mesmo tempo que esta). Mesma convencao
   ja adotada com o "Nº do BG" dentro de p2SituacaoJur. */
export type DadosPce = { produto: string; marca: string; modeloArma: string; calibre: string; quantidade: string };

export function lerPce(json: string | null | undefined): DadosPce {
  const vazio: DadosPce = { produto: "", marca: "", modeloArma: "", calibre: "", quantidade: "" };
  if (!json) return vazio;
  try {
    const v = JSON.parse(json);
    return {
      produto: s(v?.produto),
      marca: s(v?.marca),
      modeloArma: s(v?.modeloArma),
      calibre: s(v?.calibre),
      quantidade: s(v?.quantidade),
    };
  } catch {
    return vazio;
  }
}

/* Endereco de entrega do formulario do Exercito: e uma linha so. Junta o que
   na ficha vem separado (logradouro, complemento, bairro) sem repetir virgula
   de campo vazio. */
function enderecoEntrega(d: DadosReq): string {
  return [s(d.endereco).trim(), s(d.complemento).trim(), s(d.bairro).trim()].filter(Boolean).join(", ");
}

export function gerarRequerimentoDocx(d: DadosReq): Buffer {
  const nomeTemplate =
    d.modelo === "aquisicao_restrito"
      ? "requerimento_aquisicao_restrito.docx"
      : d.modelo === "aquisicao_permitido"
      ? "requerimento_aquisicao_permitido.docx"
      : d.modelo === "cursos"
      ? "requerimento_cursos.docx"
      : "requerimento_comum.docx";
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

  /* Formularios de PCE (uso restrito, do Exercito; uso permitido, da DAL da
     PMMA): campos proprios, sem quadrinho de modalidade, sem amparo legal e
     sem informacoes adicionais — o papel nao tem esses quadros. Os dois usam
     os mesmos campos; muda so o template. Sai daqui antes da montagem da
     folha de requerimento da PMMA. */
  if (ehModeloAquisicao(d.modelo)) {
    const pce = lerPce(d.p2Complementares);
    doc.render({
      // "Cargo:" so existe na folha de uso permitido (na do Exercito ja vem
      // impresso "PM"); no template do restrito a chave e ignorada.
      cargo: s(d.postoGrad),
      nome: s(d.nomeCompleto),
      // "Identidade:" — o ID PMMA do requerente
      identidade: s(d.idPmmaTxt) || s(d.matricula),
      cpf: s(d.cpf),
      email: s(d.email),
      endereco: enderecoEntrega(d),
      cidade: s(d.municipio),
      telefone: s(d.fone),
      produto: pce.produto,
      marca: pce.marca,
      modeloarma: pce.modeloArma,
      calibre: pce.calibre,
      quantidade: pce.quantidade,
    });
    return doc.getZip().generate({ type: "nodebuffer" });
  }

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
    p2conceito: s(d.p2Conceito),
    p2situacaojur: composeSituacaoJuridica(d),
  };

  /* No requerimento de CURSOS, o documento oficial traz MATRICULA/CPF/E-MAIL
     logo abaixo do pedido, DENTRO do quadro de informações adicionais — não há
     campo próprio para eles no formulário impresso.

     Montamos essas linhas AQUI, na geração, e não junto com o texto do pedido:
     o texto do pedido é composto quando a tela abre e fica editável pelo
     militar; se o CPF fosse colado lá, ficaria congelado no valor que a ficha
     tinha naquele instante, e quem preenchesse o CPF depois (é campo
     obrigatório) veria o documento sair com o CPF velho ou em branco. */
  if (d.modelo === "cursos") {
    const linhas = [s(dados.info as string).trim()];
    const matricula = s(d.matricula).trim();
    const cpf = s(d.cpf).trim();
    const email = s(d.email).trim();
    if (matricula || cpf || email) {
      linhas.push("");
      if (matricula) linhas.push(`MATRICULA: ${matricula}`);
      if (cpf) linhas.push(`CPF: ${cpf}`);
      if (email) linhas.push(`E-MAIL: ${email}`);
    }
    dados.info = linhas.join("\n");
  }

  // marca a modalidade escolhida (todas false, exceto a dela). Qualquer
  // modalidade que o sistema nao reconhece (cursos CAS/CFS/CFC, ou uma
  // modalidade que o admin cadastrou na hora) cai no quadrinho "OUTROS" —
  // nao ha como criar um quadrinho novo na folha impressa.
  for (const chave of Object.values(CHAVE_X)) dados[chave] = false;
  const chaveEscolhida = CHAVE_X[d.modalidade.trim().toUpperCase()] ?? "outros";
  dados[chaveEscolhida] = true;

  // especificacao do "OUTROS": sai no mesmo quadro do formulario, entre
  // parenteses (ex.: OUTROS (CAUTELA DE COLETE BALISTICO)). Vazio = nada muda.
  const especificacao = s(d.modalidadeOutros).trim();
  dados.outrostxt = chaveEscolhida === "outros" && especificacao ? ` (${especificacao})` : "";

  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}
