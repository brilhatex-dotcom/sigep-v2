/* Termo de Consentimento (LGPD, Lei 13.709/2018) + Responsabilidade de acesso.
   O consentimento do titular precisa ser LIVRE, INFORMADO e INEQUÍVOCO
   (Art. 8º) e comprovável (Art. 8º, §1º). Por isso o aceite é registrado no
   sistema com data/hora, IP e a VERSÃO do termo abaixo — se o texto mudar,
   suba a versão para pedir novo aceite. */

export const TERMO_VERSAO = "v1-2026-07";

export const TERMO_TITULO = "Termo de Consentimento (LGPD) e Responsabilidade de Acesso";

/* Blocos do termo (renderizados como parágrafos). Linguagem simples e clara,
   como recomenda a LGPD para o consentimento informado. */
export const TERMO_BLOCOS: { t: string; c: string }[] = [
  {
    t: "1. Do que se trata",
    c: "O SIGEP-18BPM trata dados pessoais de policiais militares (identificação, funcional, lotação, escala, contato e afins) para a gestão de pessoal do 18º Batalhão de Polícia Militar do Maranhão, no cumprimento de suas atribuições legais e do interesse público (art. 7º e art. 23 da Lei nº 13.709/2018 — LGPD).",
  },
  {
    t: "2. Finalidade",
    c: "Os dados são usados para escala de serviço, férias, promoções, permutas, efetivo, organograma e demais rotinas administrativas do Batalhão. Não são vendidos nem cedidos a terceiros, e o compartilhamento ocorre apenas quando exigido por lei ou por determinação de autoridade competente.",
  },
  {
    t: "3. Seus direitos como titular",
    c: "Você pode, a qualquer tempo, confirmar a existência de tratamento, acessar seus dados, corrigir dados incompletos ou desatualizados e solicitar informações sobre o uso (arts. 9º e 18 da LGPD), procurando o encarregado/administrador do sistema (P/1 do 18º BPM).",
  },
  {
    t: "4. Segurança e responsabilidade do acesso",
    c: "Seu login e senha são PESSOAIS e INTRANSFERÍVEIS. Você é responsável por todo acesso feito com suas credenciais. Comprometo-me a mantê-las em sigilo, a não compartilhá-las, a encerrar a sessão em computadores compartilhados e a comunicar imediatamente qualquer uso indevido. Os acessos e ações ficam registrados (auditoria) para fins de segurança.",
  },
  {
    t: "5. Consentimento",
    c: "Declaro que li e compreendi este termo, que fui informado sobre o tratamento dos meus dados pessoais e que concordo com os seus termos, nos moldes do art. 8º da LGPD. Este aceite é registrado com data, hora e IP como prova do consentimento.",
  },
];

// Texto corrido (para registro/auditoria).
export const TERMO_TEXTO = TERMO_BLOCOS.map((b) => `${b.t} ${b.c}`).join(" ");
