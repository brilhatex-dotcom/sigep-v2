import { prisma } from "@/lib/prisma";
import {
  gerarOficioJmsDocx, gerarOficioJmsPdf, gerarGuiaJmsDocx, gerarGuiaJmsPdf,
  type Brasoes, type ModoAss, type OficioJmsInput, type GuiaJmsInput,
} from "@/lib/jmsExport";
import {
  CARGO_CMT, COMANDANTE_PADRAO, GUIA_PADRAO, OFICIO_PADRAO,
  corpoOficioJms, identificacaoMilitar, isoParaBR, isoPorExtenso,
} from "@/lib/jmsTexto";

/* =========================================================================
   OFÍCIO E GUIA DA JMS — gerar o arquivo e guardar a cópia de cada emitido

   - gerarDocumentoJms: o mesmo gerador do botão Word/PDF da tela (os brasões
     e a assinatura do Comandante saem da configuração da escala, não da tela).
   - guardarCopia / lerCopia: os campos da folha no momento em que o documento
     SAIU, guardados por registro (Config "jms_doc_<id>"). É o que permite
     abrir de novo, na aba Emitidos, exatamente o que foi emitido.
   - refazer: para os emitidos ANTES de existir a cópia — monta a folha de novo
     com o que o registro guardou (militar, número, datas) e o cadastro.
   ========================================================================= */

const PADRAO_BRASOES: Brasoes = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};
const ASSINATURA_PADRAO = "/brasoes/assinatura-cmt.png";
const MODOS: ModoAss[] = ["imagem", "sigep", "gov", "branco"];

export type TipoJms = "oficio" | "guia";
export type FormatoJms = "pdf" | "docx";
export type DadosJms = Record<string, unknown>;

async function configJson(chave: string): Promise<any> {
  try {
    const row = await prisma.config.findUnique({ where: { chave }, select: { valor: true } });
    return row?.valor ? JSON.parse(row.valor) : null;
  } catch { return null; }
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

export async function gerarDocumentoJms(
  tipo: TipoJms, fmt: FormatoJms, d: DadosJms,
): Promise<{ bytes: Buffer | Uint8Array; contentType: string }> {
  const salvos = await configJson("escala_brasoes");
  const brasoes: Brasoes = { ...PADRAO_BRASOES, ...(salvos || {}) };
  const chefe = await configJson("escala_chefe_p1");
  const assinaturaCmt = texto(chefe?.cmtAssinatura) || ASSINATURA_PADRAO;
  const modoAss = MODOS.includes(d.modoAss as ModoAss) ? (d.modoAss as ModoAss) : "imagem";

  const comum = {
    numero: texto(d.numero), ano: texto(d.ano),
    comandante: texto(d.comandante), cargo: texto(d.cargo) || CARGO_CMT,
    modoAss, brasoes, assinaturaCmt,
  };

  let bytes: Buffer | Uint8Array;
  if (tipo === "oficio") {
    const dados: OficioJmsInput = {
      ...comum,
      dataDoc: texto(d.dataDoc), setor: texto(d.setor),
      de: texto(d.de), para: texto(d.para), assunto: texto(d.assunto),
      corpo: texto(d.corpo),
    };
    bytes = fmt === "pdf" ? await gerarOficioJmsPdf(dados) : await gerarOficioJmsDocx(dados);
  } else {
    const dados: GuiaJmsInput = {
      ...comum,
      dataVisita: texto(d.dataVisita),
      nome: texto(d.nome), grad: texto(d.grad), matricula: texto(d.matricula), idPm: texto(d.idPm),
      informacao: texto(d.informacao), cidadeParecer: texto(d.cidadeParecer),
    };
    bytes = fmt === "pdf" ? await gerarGuiaJmsPdf(dados) : await gerarGuiaJmsDocx(dados);
  }
  return {
    bytes,
    contentType: fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

/* ---------------------------------------------------------------- cópias */

const chaveCopia = (id: string) => `jms_doc_${id}`;

// só os campos que a folha usa (texto), para não guardar lixo vindo da tela
const CAMPOS = [
  "numero", "ano", "dataDoc", "setor", "de", "para", "assunto", "corpo",
  "dataVisita", "nome", "grad", "matricula", "idPm", "informacao", "cidadeParecer",
  "comandante", "cargo", "modoAss",
] as const;

export function limparDados(d: unknown): DadosJms {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const out: DadosJms = {};
  for (const k of CAMPOS) if (typeof o[k] === "string") out[k] = (o[k] as string).slice(0, 5000);
  return out;
}

export async function guardarCopia(id: string, tipo: TipoJms, dados: DadosJms): Promise<void> {
  const valor = JSON.stringify({ tipo, dados: limparDados(dados), em: new Date().toISOString() });
  await prisma.config.upsert({
    where: { chave: chaveCopia(id) },
    update: { valor },
    create: { chave: chaveCopia(id), valor, descricao: tipo === "oficio" ? "Cópia do ofício JMS emitido" : "Cópia da guia JMS emitida" },
    select: { chave: true },
  });
}

export async function lerCopia(id: string): Promise<DadosJms | null> {
  const v = await configJson(chaveCopia(id));
  return v && typeof v === "object" && v.dados && typeof v.dados === "object" ? (v.dados as DadosJms) : null;
}

// quais destes registros têm cópia guardada
export async function idsComCopia(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const rows = await prisma.config.findMany({
      where: { chave: { in: ids.map(chaveCopia) } },
      select: { chave: true },
    });
    return new Set(rows.map((r) => r.chave.slice("jms_doc_".length)));
  } catch { return new Set(); }
}

/* ---------------------------------------------------------------- refazer */

export type RegistroJms = {
  tipo: TipoJms; idPmma: string; nome: string;
  numero: string; ano: string; dataJms: string; criadoEm: string;
};

export async function refazer(r: RegistroJms): Promise<DadosJms> {
  const ficha = r.idPmma
    ? await prisma.efetivo.findUnique({
        where: { id: r.idPmma },
        select: { postoGrad: true, numeroBarra: true, quadro: true, nome: true, matricula: true },
      }).catch(() => null)
    : null;
  const chefe = await configJson("escala_chefe_p1");
  const comandante = texto(chefe?.comandante).trim() || COMANDANTE_PADRAO;
  const ident = identificacaoMilitar(ficha || {});
  const nome = String(ficha?.nome || r.nome || "").toUpperCase();

  if (r.tipo === "oficio") {
    return {
      ...OFICIO_PADRAO,
      numero: r.numero, ano: r.ano,
      dataDoc: `Presidente Dutra- MA, ${isoPorExtenso(r.criadoEm) || "___________"}.`,
      corpo: corpoOficioJms(ident, nome, r.idPmma, isoPorExtenso(r.dataJms)),
      comandante, cargo: CARGO_CMT, modoAss: "imagem",
    };
  }
  return {
    ...GUIA_PADRAO,
    numero: r.numero, ano: r.ano,
    dataVisita: isoParaBR(r.dataJms),
    nome, grad: ident, matricula: ficha?.matricula || "", idPm: r.idPmma,
    comandante, cargo: CARGO_CMT, modoAss: "imagem",
  };
}
