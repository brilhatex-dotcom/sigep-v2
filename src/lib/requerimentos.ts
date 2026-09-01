// ==========================================================
//  src/lib/requerimentos.ts
//  Listas de modalidades por modelo + amparo legal padrão.
//  O sistema decide qual MODELO usar com base na modalidade.
//  Ao escolher a modalidade, o campo "Amparo Legal" já vem
//  pré-preenchido (o policial/admin ainda pode editar).
//
//  Fundamentações extraídas de:
//   - Lei nº 4.175/80 (Remuneração dos Policiais Militares da PMMA)
//   - Lei nº 6.513/95 (Estatuto dos Policiais Militares da PMMA)
//   - Requerimentos reais protocolados no 18º BPM
// ==========================================================

export type Modelo = "comum" | "cursos" | "aquisicao_restrito" | "aquisicao_permitido";

/* Aquisicao de arma de fogo: nao usa a folha de requerimento da PMMA — sao os
   formularios de PCE ("REQUERIMENTO/AUTORIZACAO PARA AQUISICAO DE PCE"), com
   quadros de identificacao, produto, anexos, solicitacao e parecer. Cada um
   tem o seu template, porque as folhas sao diferentes:
     · USO RESTRITO   -> folha do Exercito (SisFPC), com QR e o campo de
                         autorizacao no alto;
     · USO PERMITIDO  -> folha da Diretoria de Apoio Logistico da PMMA (Secao
                         de Armamento), com o deferimento no quadro 5. */
export const MODALIDADE_AQUISICAO_RESTRITO = "AQUISIÇÃO DE ARMA DE FOGO DE USO RESTRITO";
export const MODALIDADE_AQUISICAO_PERMITIDO = "AQUISIÇÃO DE ARMA DE FOGO DE USO PERMITIDO";

// true nos dois modelos de aquisicao de PCE (folha propria, campos proprios)
export function ehModeloAquisicao(modelo: string): boolean {
  return modelo === "aquisicao_restrito" || modelo === "aquisicao_permitido";
}

// modalidades do MODELO COMUM (folha de requerimento padrão)
export const MODALIDADES_COMUM: string[] = [
  "AJUDA DE CUSTO",
  "AUXILIO FUNERAL",
  "CURSO",
  "CERTIDÃO PARA FINS DE DIREITO",
  "DIÁRIAS",
  "DIFERENÇA DE VENCIMENTOS",
  "GRATIFICAÇÃO DE TEMPO DE SERVIÇO",
  "1/3 DE FÉRIAS",
  "INCORPORAÇÃO TEMPO DE SERVIÇO",
  "LICENÇA PRÊMIO",
  "LICENÇA TRATAMENTO INT. PARTICULAR.",
  "LICENÇA TRATAMENTO PESSOAS DA FAMÍLIA",
  "LICENÇA GESTANTE",
  "LICENÇA PATERNIDADE",
  "REVISÃO DE PROVENTOS",
  "SALÁRIO FAMÍLIA",
  "ADIANTAMENTO P/ AQUISIÇÃO DE UNIFORME",
  "TRANSLADO DE BAGAGEM",
  "TRANSFERÊNCIA PARA A RESERVA REMUNERADA",
  "OUTROS",
];

// modalidades do MODELO CURSOS (CAS/CFS/CFC e correlatos)
export const MODALIDADES_CURSOS: string[] = [
  "CAS",
  "CFS",
  "CFC",
  "OUTROS",
];

// modalidades de ARMAMENTO E MATERIAL BELICO.
// Usam a MESMA folha de requerimento comum: no formulario oficial nao existe
// quadrinho proprio pra elas, entao a marcacao cai no "OUTROS" e a
// especificacao aparece ao lado (ex.: OUTROS (CAUTELA DE COLETE BALISTICO)).
export const MODALIDADES_MATERIAL: string[] = [
  "CAUTELA DE ARMA DE FOGO (ACAF)",
  "CAUTELA DE COLETE BALÍSTICO",
  "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO",
  // formularios de PCE (folha propria), nao a folha de requerimento da PMMA
  MODALIDADE_AQUISICAO_RESTRITO,
  MODALIDADE_AQUISICAO_PERMITIDO,
];

// modalidades que SEMPRE usam o modelo de CURSOS (página 2 detalhada)
const FORCAM_CURSOS = new Set(["CAS", "CFS", "CFC"]);

// decide o modelo a partir da modalidade escolhida
export function modeloDaModalidade(modalidade: string): Modelo {
  const m = modalidade.toUpperCase().trim();
  if (m === MODALIDADE_AQUISICAO_RESTRITO) return "aquisicao_restrito";
  if (m === MODALIDADE_AQUISICAO_PERMITIDO) return "aquisicao_permitido";
  return FORCAM_CURSOS.has(m) ? "cursos" : "comum";
}

// constantes de leis (usadas para montar os amparos)
const ESTATUTO = "LEI ESTADUAL Nº 6.513, DE 30 DE NOVEMBRO DE 1995, QUE DISPÕE SOBRE O ESTATUTO DOS POLICIAIS MILITARES DA PMMA";
const REMUNERACAO = "LEI ESTADUAL Nº 4.175, DE 20 DE JUNHO DE 1980, QUE DISPÕE SOBRE A REMUNERAÇÃO DOS POLICIAIS MILITARES DA PMMA";

// ==========================================================
//  ESPECIFICACAO DO "OUTROS"
//  Texto que sai entre parenteses ao lado do quadrinho OUTROS
//  na folha oficial. So existe para as modalidades que nao tem
//  quadrinho proprio no formulario (armamento/material belico).
// ==========================================================
export const ESPECIFICACAO_OUTROS: Record<string, string> = {
  "CAUTELA DE ARMA DE FOGO (ACAF)": "CAUTELA DE ARMA DE FOGO, MEDIANTE ACAF",
  "CAUTELA DE COLETE BALÍSTICO": "CAUTELA DE COLETE BALÍSTICO",
  "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO": "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO NAS FÉRIAS",
};

// ==========================================================
//  INFORMACOES ADICIONAIS PADRAO
//  Texto do pedido em si, ja no formato usado nos requerimentos
//  reais protocolados. O requerente ainda pode editar.
// ==========================================================
export const INFO_PADRAO: Record<string, string> = {
  "CAUTELA DE ARMA DE FOGO (ACAF)":
    "SOLICITO DE VOSSA SENHORIA, PROVIDÊNCIAS NO SENTIDO DE AUTORIZAR A CONFECÇÃO DA CAUTELA DE ARMA DE FOGO, MEDIANTE ACAF.",

  "CAUTELA DE COLETE BALÍSTICO":
    "SOLICITO DE VOSSA SENHORIA, PROVIDÊNCIAS NO SENTIDO DE AUTORIZAR A CONFECÇÃO DA CAUTELA DE COLETE BALÍSTICO.",

  "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO":
    "SOLICITO DE VOSSA SENHORIA AUTORIZAÇÃO PARA PERMANECER COM O ARMAMENTO CAUTELADO DURANTE MINHAS FÉRIAS, CONFORME DOCUMENTO EM ANEXO.",
};

// ==========================================================
//  AMPARO LEGAL PADRÃO POR MODALIDADE
//  Texto em CAIXA ALTA (padrão do formulário oficial).
//  Vazio ("") = sem amparo fixo; o requerente digita.
// ==========================================================
export const AMPARO_PADRAO: Record<string, string> = {
  // ---- Lei de Remuneração (4.175/80) ----
  "AJUDA DE CUSTO":
    `ART. 38, ART. 39, ART. 40, ART. 41 E ART. 42 DA ${REMUNERACAO}.`,

  "AUXILIO FUNERAL":
    `ART. 64, ART. 65, ART. 66 E ART. 67 DA ${REMUNERACAO}.`,

  "DIÁRIAS":
    `ART. 30, ART. 31, ART. 32, ART. 33, ART. 34 E ART. 35 DA ${REMUNERACAO}.`,

  "GRATIFICAÇÃO DE TEMPO DE SERVIÇO":
    `ART. 19, ART. 20 E SEU PARÁGRAFO ÚNICO DA ${REMUNERACAO}.`,

  "ADIANTAMENTO P/ AQUISIÇÃO DE UNIFORME":
    `ART. 77 DA ${REMUNERACAO}.`,

  "TRANSLADO DE BAGAGEM":
    `ART. 45 E ART. 46 DA ${REMUNERACAO}.`,

  // ---- Estatuto dos Policiais Militares (6.513/95) ----
  "1/3 DE FÉRIAS":
    `ART. 80, § 5º, DO ${ESTATUTO}.`,

  "LICENÇA PRÊMIO":
    `ART. 92, § 1º, INCISO I, COMBINADO COM O ART. 93 E SEUS PARÁGRAFOS DO ${ESTATUTO}.`,

  "LICENÇA TRATAMENTO PESSOAS DA FAMÍLIA":
    `ART. 92, § 1º, INCISO II, COMBINADO COM O ART. 94 E SEU PARÁGRAFO ÚNICO DO ${ESTATUTO}.`,

  "LICENÇA TRATAMENTO INT. PARTICULAR.":
    `ART. 92, § 1º, INCISO III, COMBINADO COM O ART. 95 DO ${ESTATUTO}.`,

  "LICENÇA GESTANTE":
    `ART. 92, § 1º, INCISO V, COMBINADO COM O ART. 97 DO ${ESTATUTO}, OBSERVADA A LEI ESTADUAL Nº 8.886, DE 07 DE NOVEMBRO DE 2008, QUE AMPLIA A LICENÇA PARA 180 (CENTO E OITENTA) DIAS.`,

  "LICENÇA PATERNIDADE":
    `ART. 92, § 1º, INCISO VI, COMBINADO COM O ART. 98 DO ${ESTATUTO}.`,

  "SALÁRIO FAMÍLIA":
    "INCISO IV DO ART. 69, ART. 86, INCISO I DO ART. 87 E INCISO I DO ART. 165, DA LEI 6.513 DE 30 DE NOVEMBRO DE 1995 (ESTATUTO DOS POLICIAIS MILITARES DA PMMA), COMBINADO COM O ART. 57 DA LEI Nº 4.175 DE 20 DE JUNHO DE 1980 (LEI DE REMUNERAÇÃO DA PMMA) E ART. 7º, INCISO XII DA CONSTITUIÇÃO DA REPÚBLICA FEDERAL DO BRASIL DE 1988.",

  "TRANSFERÊNCIA PARA A RESERVA REMUNERADA":
    "ART. 62 INCISOS II E III, LETRA \u201CH\u201D; ART. 66; ART. 67; ART. 73; ART. 115 INCISO I; ART. 118 INCISO I E ART. 119 DA LEI ESTADUAL Nº 6.513, DE 30 DE NOVEMBRO DE 1995, QUE DISPÕE SOBRE O ESTATUTO DOS POLICIAIS MILITARES DA PMMA; INCISO I DO ART. 80; ART. 86; ART. 87 DA LEI ESTADUAL Nº 4.175, DE 20 DE JUNHO DE 1980, QUE DISPÕE SOBRE A LEI DE REMUNERAÇÃO DA PMMA; LEI ESTADUAL Nº 5.597, DE 24 DE DEZEMBRO DE 1992, QUE DISPÕE SOBRE A GRATIFICAÇÃO DE HABILITAÇÃO POLICIAL MILITAR; LEI ESTADUAL Nº 5.658, DE 26 DE ABRIL DE 1993, QUE DISPÕE SOBRE A GRATIFICAÇÃO E INDENIZAÇÃO DO PESSOAL DA POLÍCIA MILITAR DO ESTADO; LEI ESTADUAL Nº 6.277, DE 06 DE ABRIL DE 1995, QUE DISPÕE SOBRE A CRIAÇÃO DA GRATIFICAÇÃO ESPECIAL MILITAR E LEI ESTADUAL Nº 7.384, DE 16 DE JUNHO DE 1999, QUE DISPÕE SOBRE A REFORMA E REORGANIZAÇÃO ADMINISTRATIVA DO ESTADO E A LEI COMPLEMENTAR Nº 165, DE 8 DE ABRIL DE 2014, QUE ALTERA A LEI COMPLEMENTAR Nº 73, DE 4 DE FEVEREIRO DE 2004.",

  // ---- Armamento e material bélico ----
  // Cautela (confecção) de arma de fogo e de colete balístico: mesma portaria.
  "CAUTELA DE ARMA DE FOGO (ACAF)":
    "AMPARO LEGAL NA PORTARIA Nº 035/2007 – DO GCG.",

  "CAUTELA DE COLETE BALÍSTICO":
    "AMPARO LEGAL NA PORTARIA Nº 035/2007 – DO GCG.",

  "AUTORIZAÇÃO DE PERMANÊNCIA DE ARMAMENTO":
    "DE ACORDO COM O MANUAL DE ADMINISTRAÇÃO E LOGÍSTICA DA PMMA, NO QUE SE REFERE AO ART. 24 DA PORTARIA Nº 002/2006 – GCG: “NOS CASOS DE AFASTAMENTO SUPERIORES A 08 (OITO) DIAS, O DETENTOR DEVERÁ, ANTES DO INÍCIO DO AFASTAMENTO, RESTITUIR A ARMA À RESERVA DE ARMAMENTO DA UPM, PODENDO, EXCEPCIONALMENTE, PERMANECER COM ELA, A CRITÉRIO DO CPA-I/2, APÓS ANÁLISE DE PEDIDO POR ESCRITO, DEVIDAMENTE FUNDAMENTADO”.",

  // ---- Direito de petição / certidão ----
  "CERTIDÃO PARA FINS DE DIREITO":
    "ART. 5º, INCISO XXXIV, ALÍNEA \u201CB\u201D, DA CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL DE 1988, QUE ASSEGURA A OBTENÇÃO DE CERTIDÕES EM REPARTIÇÕES PÚBLICAS, PARA DEFESA DE DIREITOS E ESCLARECIMENTO DE SITUAÇÕES DE INTERESSE PESSOAL.",

  // ---- Modalidades com amparo a confirmar (deixadas em branco) ----
  // CURSO: o amparo varia conforme o curso pretendido (CAS/CFS/CFC têm
  //   modelo próprio). Para "CURSO" genérico, o requerente digita.
  "CURSO": "",

  // DIFERENÇA DE VENCIMENTOS: depende da rubrica reclamada; amparo
  //   específico digitado caso a caso.
  "DIFERENÇA DE VENCIMENTOS": "",

  // INCORPORAÇÃO TEMPO DE SERVIÇO: confirmar dispositivo aplicável
  //   (averbação/contagem) antes de fixar.
  "INCORPORAÇÃO TEMPO DE SERVIÇO": "",

  // REVISÃO DE PROVENTOS: varia conforme o fundamento da revisão
  //   (paridade, recálculo, etc.); digitado caso a caso.
  "REVISÃO DE PROVENTOS": "",

  // OUTROS: a fundamentação varia conforme o pedido específico.
  // Modelos de referência (extraídos de requerimentos reais):
  //   • Transferência por interesse próprio:
  //     "DE ACORDO COM A LETRA \u201CB\u201D, ITEM II, § 1º, ART. IV, LETRA
  //      \u201CI\u201D, DO ART. 19, DA INSTRUÇÃO PROVISÓRIA Nº 001/95, QUE
  //      REGULAMENTA A MOVIMENTAÇÃO DE OFICIAIS E PRAÇAS DA PMMA, APROVADA
  //      PELA PORTARIA Nº 002/95 - DP/4, DATADA DE 02/01/1995, PUBLICADA NO
  //      ADIANTAMENTO AO BG Nº 228 DE 16 DE DEZEMBRO DE 1994."
  //   • Reforma (proporcional):
  //     "ITEM VI DO ART. 120 DA LEI Nº 6.513, DE 30 DE NOVEMBRO DE 1995,
  //      QUE DISPÕE SOBRE O ESTATUTO DOS POLICIAIS MILITARES DA PMMA."
  //   • Cautela (confecção):
  //     "AMPARO LEGAL NA PORTARIA Nº 035/2007 - GCG."
  //   • Gratificação de difícil localidade / acesso:
  //     "ART. 38 E ART. 39 DA LEI Nº 4.175, DE 20 DE JUNHO DE 1980, QUE
  //      DISPÕE SOBRE A LEI DE REMUNERAÇÃO DA PMMA."
  //   • Alteração de nome de guerra: (sem amparo legal fixo)
  "OUTROS": "",
};

// retorna o amparo padrão da modalidade (ou "" se não houver)
export function amparoDaModalidade(modalidade: string): string {
  return AMPARO_PADRAO[modalidade.toUpperCase().trim()] ?? "";
}

// texto que sai entre parênteses ao lado do "OUTROS" (ou "" se não houver)
export function especificacaoDaModalidade(modalidade: string): string {
  return ESPECIFICACAO_OUTROS[modalidade.toUpperCase().trim()] ?? "";
}

// texto padrão das informações adicionais (ou "" se não houver)
export function infoPadraoDaModalidade(modalidade: string): string {
  return INFO_PADRAO[modalidade.toUpperCase().trim()] ?? "";
}

// TODAS as modalidades que tem quadrinho PROPRIO na folha impressa. Qualquer
// coisa fora desta lista (inclusive as modalidades que o admin cadastra na
// hora) nao tem onde marcar "X" no papel oficial, entao cai no quadrinho
// "OUTROS" com o nome dela entre parenteses — o mesmo tratamento que ja valia
// so para armamento/material belico.
const TODAS_COM_QUADRINHO_PROPRIO = new Set([
  ...MODALIDADES_COMUM.map((m) => m.toUpperCase()),
]);

// true se a modalidade e uma das que o sistema ja conhece de fabrica (tem
// quadrinho proprio OU e um dos cursos OU e "OUTROS"). false = modalidade
// cadastrada pelo admin na hora, ou qualquer string desconhecida.
export function ehModalidadeConhecida(modalidade: string): boolean {
  const m = modalidade.toUpperCase().trim();
  return (
    TODAS_COM_QUADRINHO_PROPRIO.has(m) ||
    MODALIDADES_CURSOS.includes(m) ||
    MODALIDADES_MATERIAL.includes(m)
  );
}

// modalidades que caem no quadrinho "OUTROS" da folha oficial
export function usaQuadrinhoOutros(modalidade: string): boolean {
  const m = modalidade.toUpperCase().trim();
  // As aquisicoes de PCE nao usam a folha de requerimento da PMMA (tem
  // formulario proprio), entao nao ha quadrinho "OUTROS" pra marcar.
  if (m === MODALIDADE_AQUISICAO_RESTRITO || m === MODALIDADE_AQUISICAO_PERMITIDO) return false;
  if (m === "OUTROS" || m in ESPECIFICACAO_OUTROS) return true;
  // desconhecida (cadastrada pelo admin, ou modalidade de curso — CAS/CFS/CFC
  // tambem nao tem quadrinho proprio no formulario impresso, ver o documento
  // real: aparecem como "OUTROS (INSCRIÇÃO NO CEFS PM)") -> tambem cai aqui.
  return !TODAS_COM_QUADRINHO_PROPRIO.has(m);
}

// ==========================================================
//  REQUERIMENTO DE CURSOS (CAS/CFS/CFC) — pagina 2 e edital
//  Compoe os textos a partir de pecas atomicas (nunca gravadas ja prontas),
//  para que o EDITAL configurado hoje valha em qualquer requerimento gerado
//  de agora em diante, sem precisar editar os ja enviados.
// ==========================================================

export type EditalCurso = { sigla: string; nomeCompleto: string; numero: string; data: string };

/* Texto do pedido em si: "SOLICITO DE VOSSA SENHORIA, A MINHA INSCRIÇÃO NO
   {curso} - EDITAL Nº {numero}, datado de {data}."

   ATENÇÃO: as linhas MATRICULA/CPF/E-MAIL que o documento oficial traz logo
   abaixo NÃO entram aqui. Elas são montadas só na hora de GERAR o documento
   (lib/gerarRequerimento), a partir dos campos realmente salvos.

   O motivo: este texto é composto quando a tela ABRE e vai para uma caixa que
   o militar pode editar. Se o CPF/e-mail fossem colados aqui, o valor ficaria
   congelado no que a ficha tinha naquele instante — e o militar que digitasse
   o CPF depois (agora é campo obrigatório) veria o documento sair com o CPF
   velho, ou em branco se a ficha não tivesse nenhum. */
export function infoAdicionalCurso(edital: EditalCurso): string {
  return `SOLICITO DE VOSSA SENHORIA, A MINHA INSCRIÇÃO NO ${edital.nomeCompleto}- EDITAL Nº ${edital.numero}, datado de ${edital.data}.`;
}

// Texto entre parenteses ao lado do quadrinho "OUTROS": " (INSCRIÇÃO NO CEFS PM)".
export function especificacaoDoCurso(edital: EditalCurso): string {
  return `INSCRIÇÃO NO ${edital.sigla} PM`;
}

// Amparo legal padrao de uma inscricao em curso: referencia o proprio edital.
export function amparoDoCurso(edital: EditalCurso): string {
  return `EDITAL Nº ${edital.numero}, DE ${edital.data}, DA DIRETORIA DE ENSINO DA POLÍCIA MILITAR DO MARANHÃO.`;
}
