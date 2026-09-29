/* =========================================================================
   GRU da TAXA DE AQUISIÇÃO DE PCE (Lei nº 10.834/2003)

   Todos os requerimentos de arma de fogo (compra direta e transferência)
   pedem nos anexos a "cópia da GRU e do comprovante de pagamento da taxa de
   aquisição de PCE". A guia é emitida no PagTesouro, sempre com os mesmos
   códigos — só mudam o contribuinte (o adquirente) e a competência (mês/ano).

   Quando o Exército trocar algum código, é AQUI que se muda: a tela do
   requerimento e o documento de instruções leem daqui.
   ========================================================================= */

export const GRU_TAXA_PCE = {
  // (1) Unidade Gestora arrecadadora
  ug: "167086",
  gestao: "00001",
  ugNome: "Fundo do Exército",
  ugNomeGuia: "FUNDO DO EXERCITO",
  // (2) Código de recolhimento
  codigoRecolhimento: "11300-0",
  codigoNome: "Taxa FISC. Produtos controlados Exército",
  // (3) Número de referência — atualizado para 20841
  referencia: "20841",
  referenciaNome: "08ª Região Militar",
  // (5) Valor correspondente (R$)
  valor: "25,00",
  site: "https://pagtesouro.tesouro.gov.br/portal-gru/#/emissao-gru",
} as const;

// (4) Competência: mês/ano de hoje no fuso de Brasília -> "09/2026"
export function competenciaAtual(agora: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  });
  const partes = Object.fromEntries(f.formatToParts(agora).map((p) => [p.type, p.value]));
  return `${partes.month}/${partes.year}`;
}
