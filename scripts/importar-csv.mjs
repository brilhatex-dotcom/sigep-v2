// ==========================================================
//  scripts/importar-csv.mjs  — Fase 2 (completo)
//
//  Le os CSV da pasta ./dados-export/ e joga tudo no Neon,
//  na ORDEM CERTA (por causa das ligacoes entre tabelas).
//
//  Como rodar:
//    1) Baixe a pasta de backup do Drive e coloque os .csv
//       dentro de  ./dados-export/  (na raiz do projeto)
//    2) npm run db:push      (cria as tabelas, so na 1a vez)
//    3) npm run importar
//
//  Para reimportar do zero, rode antes:
//    npx prisma db push --force-reset   (APAGA e recria tudo)
// ==========================================================
import { readFileSync, existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PASTA = "./dados-export";

// ---- helpers -------------------------------------------------
function lerCsv(arquivo) {
  const caminho = `${PASTA}/${arquivo}`;
  if (!existsSync(caminho)) {
    console.log(`(pulando ${arquivo}: arquivo nao encontrado)`);
    return [];
  }
  const conteudo = readFileSync(caminho, "utf-8");
  return parse(conteudo, { columns: true, skip_empty_lines: true, trim: true });
}

// Converte uma linha do CSV (chaveada pelo titulo da coluna)
// num objeto com os nomes de campo do Prisma. Vazio vira null.
function mapear(linha, mapa) {
  const out = {};
  for (const [titulo, campo] of Object.entries(mapa)) {
    const v = linha[titulo];
    out[campo] = v === undefined || v === "" ? null : v;
  }
  return out;
}

// ---- mapas (titulo do CSV -> campo do Prisma) ---------------
const MAP_EFETIVO = {
  ID: "id", Posto_Grad: "postoGrad", Numero_Barra: "numeroBarra",
  Nome: "nome", NomeGuerra: "nomeGuerra", CPF: "cpf", Matricula: "matricula",
  RG: "rg", Situacao: "situacao", Lotacao: "lotacao", Telefone: "telefone",
  DataNasc: "dataNasc", DataIncorp: "dataIncorp", DataPromocao: "dataPromocao",
  EstadoCivil: "estadoCivil", Email: "email", EquipeFerias: "equipeFerias",
  Funcao: "funcao", Status: "status", Sexo: "sexo", Endereco: "endereco",
  Bairro: "bairro", Cidade: "cidade", CEP: "cep", Naturalidade: "naturalidade",
  NaturalidadeUF: "naturalidadeUF", NomePai: "nomePai", NomeMae: "nomeMae",
  TipoSanguineo: "tipoSanguineo", FatorRH: "fatorRH", Quadro: "quadro",
  GrauEscolaridade: "grauEscolaridade", CursosPMMA: "cursosPMMA",
  Banco: "banco", Agencia: "agencia", Conta: "conta", TipoConta: "tipoConta",
  PossuiDependentes: "possuiDependentes", EmergenciaNome: "emergenciaNome",
  EmergenciaTelefone: "emergenciaTelefone", EmergenciaGrau: "emergenciaGrau",
  CNH: "cnh", CNH_Categoria: "cnhCategoria", CNH_Vencimento: "cnhVencimento",
  FotoURL: "fotoURL", Observacoes: "observacoes", DataCadastro: "dataCadastro",
  UltimaAtualizacao: "ultimaAtualizacao", JMS_DataInicio: "jmsDataInicio",
  JMS_DataRetorno: "jmsDataRetorno", JMS_Motivo: "jmsMotivo",
};

const MAP_USUARIO = {
  ID: "id", Login: "login", NomeCompleto: "nomeCompleto", Email: "email",
  SenhaHash: "senhaHash", Salt: "salt", Ativo: "ativo",
  DataCriacao: "dataCriacao", UltimoLogin: "ultimoLogin", Perfil: "perfil",
  RefEfetivo: "refEfetivo",
};

const MAP_EQUIPE = {
  NumeroEquipe: "numeroEquipe", AnoGozo: "anoGozo",
  Periodo1_Inicio: "periodo1Inicio", Periodo1_Fim: "periodo1Fim",
  Periodo1_Apres: "periodo1Apres", Periodo2_Inicio: "periodo2Inicio",
  Periodo2_Fim: "periodo2Fim", Periodo2_Apres: "periodo2Apres",
  Observacoes: "observacoes",
};

const MAP_MEMBRO = {
  ID_PMMA: "idPmma", NumeroEquipe: "numeroEquipe", AnoGozo: "anoGozo",
  DataCadastro: "dataCadastro",
};

const MAP_CONFIG = { Chave: "chave", Valor: "valor", Descricao: "descricao" };

// ---- importacao (ordem importa por causa das ligacoes) ------
async function main() {
  console.log("Iniciando importacao...\n");

  const config = lerCsv("Config.csv").map((l) => mapear(l, MAP_CONFIG));
  const efetivo = lerCsv("Efetivo.csv").map((l) => mapear(l, MAP_EFETIVO));
  const equipes = lerCsv("EquipesFerias.csv").map((l) => mapear(l, MAP_EQUIPE));
  const usuarios = lerCsv("Usuarios.csv").map((l) => mapear(l, MAP_USUARIO));
  const membros = lerCsv("MembrosFerias.csv").map((l) => mapear(l, MAP_MEMBRO));

  // 1) Config (independente)
  await prisma.config.createMany({ data: config, skipDuplicates: true });
  console.log(`config: ${config.length}`);

  // 2) Efetivo (precisa vir antes de quem aponta pra ele)
  await prisma.efetivo.createMany({ data: efetivo, skipDuplicates: true });
  console.log(`efetivo: ${efetivo.length}`);

  // 3) EquipesFerias
  await prisma.equipeFerias.createMany({ data: equipes, skipDuplicates: true });
  console.log(`equipes_ferias: ${equipes.length}`);

  // 4) Usuarios (aponta pro efetivo via RefEfetivo)
  //    Se algum RefEfetivo apontar pra um ID que nao existe, limpamos
  //    o vinculo para nao quebrar a importacao.
  const idsEfetivo = new Set(efetivo.map((e) => e.id));
  for (const u of usuarios) {
    if (u.refEfetivo && !idsEfetivo.has(u.refEfetivo)) u.refEfetivo = null;
  }
  await prisma.usuario.createMany({ data: usuarios, skipDuplicates: true });
  console.log(`usuarios: ${usuarios.length}`);

  // 5) MembrosFerias (aponta pro efetivo e pra equipe)
  const membrosValidos = membros.filter((m) => idsEfetivo.has(m.idPmma));
  const ignorados = membros.length - membrosValidos.length;
  await prisma.membroFerias.createMany({
    data: membrosValidos,
    skipDuplicates: true,
  });
  console.log(
    `membros_ferias: ${membrosValidos.length}` +
      (ignorados ? ` (${ignorados} ignorados: ID_PMMA sem efetivo)` : "")
  );

  console.log("\nConcluido.");
}

main()
  .catch((e) => {
    console.error("\nERRO na importacao:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
