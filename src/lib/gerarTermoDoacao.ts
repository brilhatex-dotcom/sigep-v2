import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { lerDadosArma } from "@/lib/requerimentoArma";
import { registroDeOrigem } from "@/lib/requerimentos";
import { CIDADE, dataExtensoISO, hojeISO } from "@/lib/gerarParecerArma";

/* =========================================================================
   TERMO DE DOAÇÃO DE ARMA DE FOGO

   Anexo dos requerimentos de aquisição POR TRANSFERÊNCIA (SIGMA para SIGMA e
   SINARM para SIGMA): o alienante (DOADOR) passa a arma ao adquirente
   (RECEBEDOR, o requerente). Sai do mesmo cadastro do requerimento — nada é
   redigitado.

   É o modelo que circula, EXATAMENTE igual, só que sem as palavras em
   vermelho: onde o modelo trazia "xxxxx"/"(DOADOR)" em vermelho entra o dado
   em preto, e o aviso "RETIRAR / SUBSTITUIR AS PALAVRAS EM VERMELHOS" não
   existe mais. Dado que ninguém informou volta a ser a linha em branco do
   modelo ("_____"), para completar à mão — nunca um buraco no meio da frase.

   Diferença deliberada: no SINARM para SIGMA o registro da arma é do SINARM,
   então sai "sob registro nº SINARM ..." (o modelo só previa SIGMA).

   Template: /public/templates/termo_doacao_arma.docx
   ========================================================================= */

export type DadosTermo = {
  modelo: string;
  // recebedor (o requerente)
  nomeCompleto?: string | null;
  postoGrad?: string | null;
  cpf?: string | null;
  estadoCivil?: string | null;
  endereco?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  // JSON com a arma, o alienante e o RG/CEP do adquirente
  p2Complementares?: string | null;
  // data do documento (aaaa-mm-dd); vazio = hoje
  data?: string | null;
};

function s(v: string | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

// o dado, ou a linha em branco do modelo
function ou(v: string, linha: string): string {
  return v || linha;
}

// "1985-03-02" / "02/03/1985" -> "02/03/1985"
function dataBR(v: string): string {
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return v;
}

// "Presidente Dutra" -> "Presidente Dutra - MA" (não repete a UF já escrita)
function comUF(cidade: string): string {
  if (!cidade) return "";
  return /\bMA\b|MARANH/i.test(cidade) ? cidade : `${cidade} - MA`;
}

// "Nome Completo – Posto / Grad." da linha de assinatura
function assinatura(nome: string, posto: string): string {
  if (!nome) return "Nome Completo – Posto / Grad.";
  return posto ? `${nome} – ${posto}` : nome;
}

export function gerarTermoDoacaoDocx(d: DadosTermo): Buffer {
  const caminho = path.join(process.cwd(), "public", "templates", "termo_doacao_arma.docx");

  let content: string;
  try {
    content = fs.readFileSync(caminho, "binary");
  } catch (e) {
    throw new Error(
      `Template DOCX nao encontrado/ilegivel em "${caminho}". No Vercel, arquivos de /public ` +
        `nao entram no bundle da function por padrao — configure experimental.outputFileTracingIncludes ` +
        `no next.config.js apontando para ./public/templates/**. Erro original: ${(e as Error)?.message || e}`
    );
  }

  const doc = new Docxtemplater(new PizZip(content), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  const a = lerDadosArma(d.p2Complementares);
  const g = (k: string) => s(a[k]);
  const cidade = comUF(s(d.municipio));
  const endereco = [s(d.endereco), s(d.complemento)].filter(Boolean).join(", ");

  doc.render({
    // doador (alienante)
    doadornome: ou(g("alienanteNome"), "_______________________________________"),
    doadornacionalidade: ou(g("alienanteNacionalidade"), "__________"),
    doadorestadocivil: ou(g("alienanteEstadoCivil"), "_______________"),
    doadornasc: ou(dataBR(g("alienanteNasc")), "_____/_____/______"),
    doadornaturalidade: ou(g("alienanteNaturalidade"), "_________________________"),
    doadorpai: ou(g("alienantePai"), "_______________________________________"),
    doadormae: ou(g("alienanteMae"), "_______________________________________"),
    doadorrg: ou(g("alienanteRg"), "_____________"),
    doadorassinatura: assinatura(g("alienanteNome"), g("alienantePosto")),
    // arma
    especie: ou(g("produto"), "_______________"),
    calibre: ou(g("calibre"), "_______"),
    marca: ou(g("marca"), "____________"),
    acabamento: ou(g("acabamento"), "___________"),
    serie: ou(g("serie"), "_______________"),
    registrotipo: registroDeOrigem(d.modelo),
    registro: ou(g("registro"), "______________________"),
    // recebedor (adquirente = requerente)
    recebedornome: ou(s(d.nomeCompleto), "_______________________________________"),
    recebedorrg: ou(g("rg"), "___________"),
    recebedorcpf: ou(s(d.cpf), "________________"),
    recebedorestadocivil: ou(s(d.estadoCivil), "(Solteiro/Casado)"),
    recebedorendereco: ou(endereco, "Av./ Rua_______________________ nº ______"),
    recebedorbairro: ou(s(d.bairro), "______________________"),
    recebedorcep: ou(g("cep"), "________________"),
    recebedorcidade: ou(cidade, "_______________"),
    recebedorassinatura: assinatura(s(d.nomeCompleto), s(d.postoGrad)),
    // local e data: a cidade do recebedor (ou a do Batalhão) e o dia em que sai
    localdata: `${cidade || CIDADE}, ${dataExtensoISO(s(d.data) || hojeISO())}`,
  });

  return doc.getZip().generate({ type: "nodebuffer" });
}
