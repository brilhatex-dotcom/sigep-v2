import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { lerPce } from "@/lib/gerarRequerimento";

/* =========================================================================
   DECLARAÇÃO DE PARECER FAVORÁVEL PARA AQUISIÇÃO DE ARMA DE FOGO

   Documento que anda JUNTO com o requerimento de aquisição de PCE — tanto o
   de uso RESTRITO quanto o de uso PERMITIDO exigem ele nos anexos ("declaração
   parecer favorável para aquisição de arma de fogo"). Por isso ele é gerado a
   partir do MESMO requerimento: os dados do militar e a arma pedida saem do
   que já foi preenchido lá, sem redigitar nada.

   Assinam o Chefe do P/1 e o Cmt do 18º BPM — os dois nomes vêm da mesma
   configuração que assina a escala e os memorandos (Config "escala_chefe_p1"),
   então trocar o comando num lugar só já vale aqui.

   Template: /public/templates/parecer_favoravel_arma.docx (montado a partir do
   modelo oficial do P/1, brasões inclusive).
   ========================================================================= */

const CIDADE = "Presidente Dutra - MA";
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type DadosParecer = {
  // do requerimento
  nomeCompleto?: string | null;
  postoGrad?: string | null;
  numeroPm?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  // produto controlado (JSON guardado em p2Complementares)
  p2Complementares?: string | null;
  // da ficha do efetivo (o requerimento não guarda RG)
  rg?: string | null;
  // de quem assina (Config "escala_chefe_p1")
  chefeNome?: string | null;
  chefeFuncao?: string | null;
  comandante?: string | null;
  // data do documento (aaaa-mm-dd); vazio = hoje
  data?: string | null;
};

function s(v: string | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

// "Presidente Dutra - MA, 18 de novembro de 2024"
function localEData(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `${CIDADE}, `;
  return `${CIDADE}, ${m[3]} de ${MESES[Number(m[2]) - 1] || ""} de ${m[1]}`;
}

function hojeISO(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date());
}

/* "Sd.PM nº 431/18 Pedro Victor Pessoa de Oliveira" — posto, número e nome na
   mesma linha, como no documento original. Sem número, sai só posto + nome. */
function identificacaoDoMilitar(d: DadosParecer): string {
  const posto = s(d.postoGrad);
  const numero = s(d.numeroPm);
  const nome = s(d.nomeCompleto);
  const inicio = numero ? [posto, `nº ${numero}`].filter(Boolean).join(" ") : posto;
  return [inicio, nome].filter(Boolean).join(" ");
}

// endereço completo numa linha só, como o documento pede
function enderecoCompleto(d: DadosParecer): string {
  return [s(d.endereco), s(d.complemento), s(d.bairro), s(d.municipio)].filter(Boolean).join(", ");
}

export function gerarParecerArmaDocx(d: DadosParecer): Buffer {
  const caminho = path.join(process.cwd(), "public", "templates", "parecer_favoravel_arma.docx");

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

  const pce = lerPce(d.p2Complementares);

  doc.render({
    militar: identificacaoDoMilitar(d),
    rg: s(d.rg),
    cpf: s(d.cpf),
    endereco: enderecoCompleto(d),
    produto: pce.produto,
    calibre: pce.calibre,
    datalocal: localEData(s(d.data) || hojeISO()),
    chefenome: s(d.chefeNome),
    chefefuncao: s(d.chefeFuncao),
    cmtnome: s(d.comandante),
  });

  return doc.getZip().generate({ type: "nodebuffer" });
}
