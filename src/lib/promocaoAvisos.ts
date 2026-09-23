import { prisma } from "@/lib/prisma";
import { lerEncargos } from "@/lib/encargos";
import { enviarParaLogin, enviarParaVarios } from "@/lib/push";
import { lerMapaP1 } from "@/lib/promocaoStatusP1";

/* =========================================================================
   OS AVISOS DO RITO DAS CERTIDÕES

   O rito tinha três passos — o militar sobe as oito certidões, envia ao P/1,
   o P/1 confere e dá o "recebido" — e NENHUM deles avisava ninguém. O P/1 só
   descobria que alguém tinha enviado abrindo o painel e rolando a lista de
   duzentos nomes; o militar só sabia que o P/1 recebeu (ou reabriu para
   correção) se voltasse à tela para olhar.

   Na promoção isso custa caro: a Portaria nº 168/2026-CPPPM fecha a Planilha
   Padrão em 06 de novembro, e certidão parada esperando alguém reparar nela é
   prazo correndo.

   Quem é "o P/1" segue a regra que o sistema já usa para o resto da seção
   (podeVerP1): o Chefe e os Auxiliares do P/1 cadastrados em Encargos; se
   ainda não houver Chefe cadastrado, os administradores — para o aviso não
   cair no vazio antes de alguém configurar os encargos.

   Todo aviso é best-effort: notificação que falha não pode desfazer o envio
   das certidões, que já foi gravado.
   ========================================================================= */

export async function loginsDoP1(): Promise<string[]> {
  const mapa = await lerEncargos();
  const ids = Object.entries(mapa)
    .filter(([, enc]) => enc === "chefe_p1" || enc === "aux_p1")
    .map(([id]) => id);
  const temChefe = Object.values(mapa).some((v) => v === "chefe_p1");

  const usuarios = temChefe
    ? await prisma.usuario.findMany({ where: { refEfetivo: { in: ids } }, select: { login: true } })
    : await prisma.usuario.findMany({
        where: { perfil: { equals: "admin", mode: "insensitive" } },
        select: { login: true },
      });
  return Array.from(new Set(usuarios.map((u) => u.login).filter(Boolean) as string[]));
}

async function nomeDe(efetivoId: string): Promise<string> {
  const f = await prisma.efetivo.findUnique({
    where: { id: efetivoId },
    select: { postoGrad: true, nomeGuerra: true, nome: true },
  });
  return [f?.postoGrad, f?.nomeGuerra || f?.nome].filter(Boolean).join(" ") || "Um militar";
}

async function loginDoMilitar(efetivoId: string): Promise<string | null> {
  const u = await prisma.usuario.findFirst({ where: { refEfetivo: efetivoId }, select: { login: true } });
  return u?.login || null;
}

// Militar enviou as certidões: o P/1 precisa saber que tem conferência a fazer.
export async function avisarEnvioAoP1(efetivoId: string, periodoId: string, periodoNome: string) {
  try {
    const logins = await loginsDoP1();
    if (!logins.length) return;
    await enviarParaVarios(logins, {
      title: "Certidões para conferir",
      body: `${await nomeDe(efetivoId)} enviou as certidões da promoção ${periodoNome}. Confira no painel de promoções.`,
      url: "/promocoes",
      tag: `promo-envio-${periodoId}-${efetivoId}`,
    });
  } catch (e) { console.error("[promocao] aviso ao P/1", e); }
}

// P/1 deu o "recebido": o militar pode parar de se preocupar com isso.
export async function avisarRecebido(efetivoId: string, periodoId: string) {
  try {
    const login = await loginDoMilitar(efetivoId);
    if (!login) return;
    await enviarParaLogin(login, {
      title: "Certidões recebidas pelo P/1",
      body: "O P/1 conferiu e deu o recebido nas suas certidões da promoção. Não há mais nada a enviar.",
      url: "/promocoes/minhas-certidoes",
      tag: `promo-recebido-${periodoId}`,
    });
  } catch (e) { console.error("[promocao] aviso de recebido", e); }
}

/* P/1 reabriu: é o aviso MAIS importante dos três. Reabrir quer dizer que tem
   certidão para trocar — e o militar que não souber disso fica fora da
   planilha sem saber por quê. */
export async function avisarReabertura(efetivoId: string, periodoId: string) {
  try {
    const login = await loginDoMilitar(efetivoId);
    if (!login) return;
    await enviarParaLogin(login, {
      title: "O P/1 reabriu suas certidões",
      body: "Há certidão para corrigir ou trocar. Abra \"Minhas certidões\", ajuste e envie de novo ao P/1.",
      url: "/promocoes/minhas-certidoes",
      tag: `promo-reabriu-${periodoId}`,
    });
  } catch (e) { console.error("[promocao] aviso de reabertura", e); }
}

/* Para o SINO: quantos militares enviaram e ainda esperam a conferência.

   Uma linha com a contagem, e não uma por militar — em época de promoção
   seriam dezenas, e o sino viraria uma lista que ninguém lê. O id carrega a
   contagem, então cada envio novo acende o sino de novo. */
export async function pendentesDeConferencia(periodoId: string): Promise<number> {
  const mapa = await lerMapaP1();
  const prefixo = `${periodoId}:`;
  let n = 0;
  for (const [k, st] of Object.entries(mapa)) {
    if (k.startsWith(prefixo) && st?.enviadoEm && !st?.recebidoEm) n++;
  }
  return n;
}
