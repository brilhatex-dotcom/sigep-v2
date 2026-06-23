import JSZip from "jszip";
import fs from "fs";
import path from "path";

/* =========================================================================
   Gerador da RENE (.docx) a partir do template public/templates/rene-template.docx
   O template tem os mesmos campos do modelo oficial, com tokens {{...}} no
   lugar dos valores, e UMA linha de funcionario marcada entre os comentarios
   <!--JOE_ROW_START--> e <!--JOE_ROW_END--> que e duplicada aqui, uma vez
   por militar aprovado no JOE.
   ========================================================================= */

export type RenePessoa = {
  ord: string;
  nome: string;
  id: string;
  cpf: string;
  upm: string;
  contato: string;
};

export type ReneDados = {
  operacao: string;
  upm: string;
  comandante: string;
  data: string;
  horario: string;
  area: string;
  processoSei: string;
  pessoas: RenePessoa[];
};

function escXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function gerarReneDocx(dados: ReneDados): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "public", "templates", "rene-template.docx");
  const templateBuf = fs.readFileSync(templatePath);

  const zip = await JSZip.loadAsync(templateBuf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("Template da RENE invalido (document.xml nao encontrado).");
  let xml = await file.async("string");

  const tagIni = "<!--JOE_ROW_START-->";
  const tagFim = "<!--JOE_ROW_END-->";
  const iIni = xml.indexOf(tagIni);
  const iFim = xml.indexOf(tagFim);
  if (iIni === -1 || iFim === -1) {
    throw new Error("Marcadores de linha (JOE_ROW_START/END) nao encontrados no template.");
  }
  const antes = xml.slice(0, iIni);
  const linhaModelo = xml.slice(iIni + tagIni.length, iFim);
  const depois = xml.slice(iFim + tagFim.length);

  const pessoas = dados.pessoas.length > 0 ? dados.pessoas : [
    { ord: "", nome: "", id: "", cpf: "", upm: "", contato: "" },
  ];

  const linhas = pessoas
    .map((p) =>
      linhaModelo
        .replace(/\{\{ORD\}\}/g, escXml(p.ord))
        .replace(/\{\{NOME\}\}/g, escXml(p.nome))
        .replace(/\{\{ID\}\}/g, escXml(p.id))
        .replace(/\{\{CPF\}\}/g, escXml(p.cpf))
        .replace(/\{\{UPM_LINHA\}\}/g, escXml(p.upm))
        .replace(/\{\{CONTATO\}\}/g, escXml(p.contato))
    )
    .join("");

  xml = antes + linhas + depois;

  xml = xml
    .replace(/\{\{OPERACAO\}\}/g, escXml(dados.operacao))
    .replace(/\{\{UPM\}\}/g, escXml(dados.upm))
    .replace(/\{\{COMANDANTE\}\}/g, escXml(dados.comandante))
    .replace(/\{\{DATA\}\}/g, escXml(dados.data))
    .replace(/\{\{HORARIO\}\}/g, escXml(dados.horario))
    .replace(/\{\{AREA\}\}/g, escXml(dados.area))
    .replace(/\{\{PROCESSO_SEI\}\}/g, escXml(dados.processoSei));

  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return out;
}