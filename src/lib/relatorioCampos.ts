/* =========================================================================
   Catálogo de CAMPOS e MODELOS da Central de Relatórios.

   Fica num arquivo só, fora da tela, porque três lados precisam concordar
   sobre o que é cada coluna: a prévia na tela, o Excel/CSV e o Word. Se o
   rótulo de "Fone" mudasse só na tela, o Excel sairia com outro nome.
   ========================================================================= */

// O militar já com a situação calculada e a unidade resolvida pela página.
export type MilitarRelatorio = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
  matricula: string | null;
  cpf: string | null;
  rg: string | null;
  situacao: string | null;      // CALCULADA (férias/JMS/LP já aplicados)
  situacaoFicha: string | null; // a que está gravada na ficha
  lotacao: string | null;
  unidade: string | null;       // nó do organograma (ex.: "3ª CIA")
  subunidade: string | null;    // nó mais específico (ex.: "1º Pel. Dom Pedro")
  telefone: string | null;
  email: string | null;
  dataNasc: string | null;
  dataIncorp: string | null;
  dataPromocao: string | null;
  estadoCivil: string | null;
  sexo: string | null;
  quadro: string | null;
  funcao: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  cep: string | null;
  naturalidade: string | null;
  naturalidadeUF: string | null;
  nomePai: string | null;
  nomeMae: string | null;
  tipoSanguineo: string | null;
  fatorRH: string | null;
  grauEscolaridade: string | null;
  cursosPMMA: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: string | null;
  emergenciaNome: string | null;
  emergenciaTelefone: string | null;
  emergenciaGrau: string | null;
  cnh: string | null;
  cnhCategoria: string | null;
  cnhVencimento: string | null;
  equipeFerias: string | null;
  idade: number | null;
  tempoServico: string | null;
  observacoes: string | null;
  // mês do nascimento (1–12), só para o filtro de aniversariantes
  mesNasc: number | null;
};

export type Campo = {
  chave: keyof MilitarRelatorio | "postoNome";
  rotulo: string;
  grupo: string;
  largura?: number; // peso relativo da coluna no Word/impressão
};

/* Os campos, agrupados como o P/1 pensa neles. A ordem aqui é a ordem em que
   as colunas saem no relatório — quem escolhe "nome" e "fone" recebe sempre
   nome antes de fone, independentemente da ordem em que clicou. */
export const CAMPOS: Campo[] = [
  // identificação
  { chave: "postoNome", rotulo: "Posto/Grad e nome", grupo: "Identificação", largura: 34 },
  { chave: "postoGrad", rotulo: "Posto/Graduação", grupo: "Identificação", largura: 18 },
  { chave: "numeroBarra", rotulo: "Nº", grupo: "Identificação", largura: 8 },
  { chave: "nome", rotulo: "Nome completo", grupo: "Identificação", largura: 32 },
  { chave: "nomeGuerra", rotulo: "Nome de guerra", grupo: "Identificação", largura: 16 },
  { chave: "matricula", rotulo: "Matrícula", grupo: "Identificação", largura: 12 },
  { chave: "id", rotulo: "ID PMMA", grupo: "Identificação", largura: 12 },
  { chave: "quadro", rotulo: "Quadro", grupo: "Identificação", largura: 10 },
  { chave: "cpf", rotulo: "CPF", grupo: "Identificação", largura: 14 },
  { chave: "rg", rotulo: "RG", grupo: "Identificação", largura: 12 },

  // contato
  { chave: "telefone", rotulo: "Telefone", grupo: "Contato", largura: 14 },
  { chave: "email", rotulo: "E-mail", grupo: "Contato", largura: 24 },
  { chave: "endereco", rotulo: "Endereço", grupo: "Contato", largura: 26 },
  { chave: "bairro", rotulo: "Bairro", grupo: "Contato", largura: 14 },
  { chave: "cidade", rotulo: "Município", grupo: "Contato", largura: 16 },
  { chave: "cep", rotulo: "CEP", grupo: "Contato", largura: 10 },
  { chave: "emergenciaNome", rotulo: "Contato de emergência", grupo: "Contato", largura: 20 },
  { chave: "emergenciaTelefone", rotulo: "Fone de emergência", grupo: "Contato", largura: 14 },
  { chave: "emergenciaGrau", rotulo: "Grau de parentesco", grupo: "Contato", largura: 12 },

  // lotação e situação
  { chave: "unidade", rotulo: "Unidade", grupo: "Lotação e situação", largura: 16 },
  { chave: "subunidade", rotulo: "Pelotão / Destacamento", grupo: "Lotação e situação", largura: 22 },
  { chave: "lotacao", rotulo: "Lotação (como está na ficha)", grupo: "Lotação e situação", largura: 22 },
  { chave: "funcao", rotulo: "Função", grupo: "Lotação e situação", largura: 18 },
  { chave: "situacao", rotulo: "Situação (hoje)", grupo: "Lotação e situação", largura: 14 },
  { chave: "situacaoFicha", rotulo: "Situação da ficha", grupo: "Lotação e situação", largura: 14 },
  { chave: "equipeFerias", rotulo: "Equipe de férias", grupo: "Lotação e situação", largura: 10 },

  // datas e carreira
  { chave: "dataNasc", rotulo: "Nascimento", grupo: "Datas e carreira", largura: 12 },
  { chave: "idade", rotulo: "Idade", grupo: "Datas e carreira", largura: 8 },
  { chave: "dataIncorp", rotulo: "Inclusão", grupo: "Datas e carreira", largura: 12 },
  { chave: "tempoServico", rotulo: "Tempo de serviço", grupo: "Datas e carreira", largura: 14 },
  { chave: "dataPromocao", rotulo: "Última promoção", grupo: "Datas e carreira", largura: 14 },
  { chave: "grauEscolaridade", rotulo: "Escolaridade", grupo: "Datas e carreira", largura: 16 },
  { chave: "cursosPMMA", rotulo: "Cursos PMMA", grupo: "Datas e carreira", largura: 24 },

  // pessoais
  { chave: "sexo", rotulo: "Sexo", grupo: "Dados pessoais", largura: 8 },
  { chave: "estadoCivil", rotulo: "Estado civil", grupo: "Dados pessoais", largura: 14 },
  { chave: "naturalidade", rotulo: "Naturalidade", grupo: "Dados pessoais", largura: 16 },
  { chave: "naturalidadeUF", rotulo: "UF de origem", grupo: "Dados pessoais", largura: 8 },
  { chave: "nomePai", rotulo: "Nome do pai", grupo: "Dados pessoais", largura: 24 },
  { chave: "nomeMae", rotulo: "Nome da mãe", grupo: "Dados pessoais", largura: 24 },
  { chave: "tipoSanguineo", rotulo: "Tipo sanguíneo", grupo: "Dados pessoais", largura: 10 },
  { chave: "fatorRH", rotulo: "Fator RH", grupo: "Dados pessoais", largura: 8 },

  // habilitação
  { chave: "cnh", rotulo: "CNH", grupo: "Habilitação", largura: 14 },
  { chave: "cnhCategoria", rotulo: "Categoria", grupo: "Habilitação", largura: 10 },
  { chave: "cnhVencimento", rotulo: "Vencimento da CNH", grupo: "Habilitação", largura: 14 },

  // bancários
  { chave: "banco", rotulo: "Banco", grupo: "Dados bancários", largura: 14 },
  { chave: "agencia", rotulo: "Agência", grupo: "Dados bancários", largura: 10 },
  { chave: "conta", rotulo: "Conta", grupo: "Dados bancários", largura: 14 },
  { chave: "tipoConta", rotulo: "Tipo de conta", grupo: "Dados bancários", largura: 12 },

  { chave: "observacoes", rotulo: "Observações", grupo: "Outros", largura: 30 },
];

export const GRUPOS = Array.from(new Set(CAMPOS.map((c) => c.grupo)));

export function campoPorChave(chave: string): Campo | undefined {
  return CAMPOS.find((c) => c.chave === chave);
}

/* Como cada campo vira texto. O "postoNome" é o formato militar de sempre
   (Posto + nº + nome de guerra), que é o que se espera numa relação. */
export function valorDoCampo(m: MilitarRelatorio, chave: string): string {
  if (chave === "postoNome") {
    const barra = (m.numeroBarra || "").trim();
    return [m.postoGrad || "", barra ? `nº ${barra}` : "", m.nomeGuerra || m.nome || ""]
      .filter(Boolean).join(" ").trim();
  }
  const v = (m as any)[chave];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/* Modelos prontos: o P/1 clica e já sai o relatório do dia a dia, sem montar
   coluna por coluna. É a diferença entre uma ferramenta e um formulário. */
export type Modelo = {
  id: string;
  nome: string;
  descricao: string;
  campos: string[];
  ordem?: "antiguidade" | "alfabetica" | "lotacao";
  // filtros que o modelo já deixa marcados
  filtros?: { somenteComTelefone?: boolean; somenteComEmail?: boolean; situacoes?: string[] };
};

export const MODELOS: Modelo[] = [
  {
    id: "telefones",
    nome: "Lista telefônica",
    descricao: "Posto, nome e telefone — o pedido mais comum.",
    campos: ["postoNome", "telefone"],
    ordem: "antiguidade",
    filtros: { somenteComTelefone: true },
  },
  {
    id: "contato",
    nome: "Contatos completos",
    descricao: "Telefone, e-mail e endereço de cada militar.",
    campos: ["postoNome", "matricula", "telefone", "email", "endereco", "bairro", "cidade"],
    ordem: "antiguidade",
  },
  {
    id: "nominal",
    nome: "Relação nominal",
    descricao: "A relação padrão: posto, nome completo, matrícula, lotação e situação.",
    campos: ["postoNome", "nome", "matricula", "unidade", "subunidade", "situacao"],
    ordem: "antiguidade",
  },
  {
    id: "efetivo-unidade",
    nome: "Efetivo por unidade",
    descricao: "Quem está em cada CIA, pelotão ou destacamento.",
    campos: ["unidade", "subunidade", "postoNome", "funcao", "situacao"],
    ordem: "lotacao",
  },
  {
    id: "emergencia",
    nome: "Ficha de emergência",
    descricao: "Tipo sanguíneo e quem avisar — para operação e deslocamento.",
    campos: ["postoNome", "telefone", "tipoSanguineo", "fatorRH", "emergenciaNome", "emergenciaTelefone", "emergenciaGrau"],
    ordem: "antiguidade",
  },
  {
    id: "aniversariantes",
    nome: "Aniversariantes",
    descricao: "Data de nascimento e idade — filtre o mês ao lado.",
    campos: ["postoNome", "dataNasc", "idade", "telefone", "unidade"],
    ordem: "alfabetica",
  },
  {
    id: "motoristas",
    nome: "Motoristas / CNH",
    descricao: "Quem tem habilitação, categoria e vencimento.",
    campos: ["postoNome", "cnh", "cnhCategoria", "cnhVencimento", "telefone", "unidade"],
    ordem: "antiguidade",
  },
  {
    id: "bancarios",
    nome: "Dados bancários",
    descricao: "Para diárias e pagamentos. Contém dado sensível — cuidado ao compartilhar.",
    campos: ["postoNome", "cpf", "banco", "agencia", "conta", "tipoConta"],
    ordem: "antiguidade",
  },
  {
    id: "antiguidade",
    nome: "Antiguidade",
    descricao: "Inclusão, tempo de serviço e última promoção, do mais antigo ao mais moderno.",
    campos: ["postoNome", "matricula", "dataIncorp", "tempoServico", "dataPromocao"],
    ordem: "antiguidade",
  },
  {
    id: "qualificacao",
    nome: "Qualificação",
    descricao: "Escolaridade e cursos da PMMA de cada militar.",
    campos: ["postoNome", "grauEscolaridade", "cursosPMMA", "unidade"],
    ordem: "antiguidade",
  },
];
