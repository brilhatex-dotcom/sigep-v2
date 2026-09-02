import { prisma } from "@/lib/prisma";
import { hojeBR, paraData, tempoServico } from "@/lib/datas";
import {
  amparoDaModalidade,
  especificacaoDaModalidade,
  infoPadraoDaModalidade,
  ehModalidadeConhecida,
  infoAdicionalCurso,
  especificacaoDoCurso,
  amparoDoCurso,
  MODALIDADES_CURSOS,
} from "@/lib/requerimentos";

/* Montagem dos dados de um requerimento, no mesmo lugar para os dois caminhos
   que criam requerimento: a tela individual (/requerimentos/novo) e o lote do
   P/1 (/api/requerimentos/lote). Antes isso vivia so dentro da pagina; com o
   lote seriam duas copias da mesma regra, fadadas a divergir na primeira
   mudanca de edital. */

// Normaliza qualquer data para dd/mm/aaaa SEM deslocar o dia por fuso horario.
// IMPORTANTE: "1991-08-12" (so data) e interpretado pelo `new Date()` como
// meia-noite UTC; ao converter para America/Sao_Paulo (GMT-3) voltava um dia
// (saia "11/08/1991"). Por isso tratamos ISO e dd/mm/aaaa por regex, e so
// caimos no `new Date()` para formatos soltos (ex.: "Mon Aug 12 1991 ... GMT-0300").
export function dataBR(valor: string | null | undefined): string {
  if (!valor) return "";
  const s = String(valor).trim();
  if (!s) return "";
  // ja em dd/mm/aaaa
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  // ISO aaaa-mm-dd (com ou sem hora) -> sem passar pelo fuso
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // outros formatos que o Date entenda (ex.: Date.toString() antigo)
  const d = new Date(s);
  if (isNaN(d.getTime())) return s; // nao reconheceu: devolve como veio
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/* Tempo de serviço em ANOS COMPLETOS, contado da data de inclusão até hoje.
   Antes o campo saía sempre em branco no papel (ninguém digitava), sendo que a
   ficha já tem a data de inclusão — dá para contar sozinho. Continua editável
   no formulário, para o caso de quem tem averbação de tempo anterior. */
export function tempoDeServicoAnos(dataInclusao: string | null | undefined): string {
  const inicio = paraData(dataInclusao ?? null);
  if (!inicio) return "";
  const { anos } = tempoServico(inicio, hojeBR());
  if (anos <= 0) return "";
  return `${anos} ANO${anos > 1 ? "S" : ""}`;
}

export type TextoDaModalidade = {
  amparoLegal: string;
  infoAdicional: string;
  modalidadeOutros: string;
};

/* Amparo legal, texto do pedido e o que vai no quadrinho "OUTROS".
   Comeca pelo padrao de fabrica; se for curso (CAS/CFS/CFC...), vem do EDITAL
   configurado pelo admin; se for modalidade que o admin cadastrou na hora
   (nao esta em nenhuma lista fixa), busca o amparo salvo com ela. */
export async function textoDaModalidade(modalidade: string): Promise<TextoDaModalidade> {
  let amparoLegal = amparoDaModalidade(modalidade);
  let infoAdicional = infoPadraoDaModalidade(modalidade);
  let modalidadeOutros = especificacaoDaModalidade(modalidade);

  const modalidadeUpper = modalidade.toUpperCase();
  if (MODALIDADES_CURSOS.includes(modalidadeUpper) && modalidadeUpper !== "OUTROS") {
    const row = await prisma.config.findUnique({ where: { chave: "requerimentos_editais_cursos" } });
    let edital: { sigla: string; nomeCompleto: string; numero: string; data: string } | null = null;
    try {
      const todos = row?.valor ? JSON.parse(row.valor) : {};
      if (todos && typeof todos[modalidadeUpper] === "object") edital = todos[modalidadeUpper];
    } catch {}
    if (edital?.nomeCompleto && edital?.numero) {
      amparoLegal = amparoDoCurso(edital);
      modalidadeOutros = especificacaoDoCurso(edital);
      // Só a frase do pedido. As linhas MATRICULA/CPF/E-MAIL são acrescentadas
      // na geração do documento, a partir do que foi realmente preenchido.
      infoAdicional = infoAdicionalCurso(edital);
    }
    // edital sem numero configurado ainda: segue tudo em branco, o P/1
    // preenche na mao — melhor que travar o militar de abrir o requerimento.
  } else if (!ehModalidadeConhecida(modalidade)) {
    const row = await prisma.config.findUnique({ where: { chave: "requerimentos_modalidades_custom" } });
    try {
      const lista = row?.valor ? JSON.parse(row.valor) : [];
      const achada = Array.isArray(lista)
        ? lista.find((x: any) => (x?.nome || "").toUpperCase() === modalidadeUpper)
        : null;
      if (achada) {
        amparoLegal = achada.amparo || "";
        modalidadeOutros = modalidade;
      }
    } catch {}
  }

  return { amparoLegal, infoAdicional, modalidadeOutros };
}

/* Os campos pessoais do requerente: saem da ficha do efetivo, e o que ele ja
   tiver ajustado antes (perfilRequerente) tem prioridade. Devolve null quando
   a ficha nem existe. */
export async function dadosPessoais(efetivoId: string): Promise<Record<string, string> | null> {
  const m = await prisma.efetivo.findUnique({ where: { id: efetivoId } });
  if (!m) return null;
  const perfil = await prisma.perfilRequerente.findUnique({ where: { efetivoId } });

  return {
    nomeCompleto: m.nome || "",
    endereco: perfil?.endereco || m.endereco || "",
    complemento: perfil?.complemento || "",
    bairro: perfil?.bairro || m.bairro || "",
    municipio: perfil?.municipio || m.cidade || "",
    fone: perfil?.fone || m.telefone || "",
    dataNasc: dataBR(m.dataNasc),
    dataInclusao: dataBR(m.dataIncorp),
    matricula: m.matricula || "",
    idPmmaTxt: m.id || "",
    postoGrad: m.postoGrad || "",
    numeroPm: m.numeroBarra || "",
    // contado da data de inclusão (ficha) — o papel pede em anos
    tempoServico: tempoDeServicoAnos(m.dataIncorp),
    cargoFuncao: perfil?.cargoFuncao || m.funcao || "",
    estadoCivil: perfil?.estadoCivil || m.estadoCivil || "",
    // OPM em que o militar e classificado: fixo do batalhao (sempre CPA I/2)
    opmClassificado: "CPA I/2",
    opmExercicio: perfil?.opmExercicio || "18º BPM",
    cpf: perfil?.cpf || m.cpf || "",
    email: perfil?.email || m.email || "",
  };
}
