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

export type Modelo = "comum" | "cursos";

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

// modalidades que SEMPRE usam o modelo de CURSOS (página 2 detalhada)
const FORCAM_CURSOS = new Set(["CAS", "CFS", "CFC"]);

// decide o modelo a partir da modalidade escolhida
export function modeloDaModalidade(modalidade: string): Modelo {
  return FORCAM_CURSOS.has(modalidade.toUpperCase().trim()) ? "cursos" : "comum";
}

// constantes de leis (usadas para montar os amparos)
const ESTATUTO = "LEI ESTADUAL Nº 6.513, DE 30 DE NOVEMBRO DE 1995, QUE DISPÕE SOBRE O ESTATUTO DOS POLICIAIS MILITARES DA PMMA";
const REMUNERACAO = "LEI ESTADUAL Nº 4.175, DE 20 DE JUNHO DE 1980, QUE DISPÕE SOBRE A REMUNERAÇÃO DOS POLICIAIS MILITARES DA PMMA";

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
