import { prisma } from "@/lib/prisma";
import { lerEncargos, encargoDe } from "@/lib/encargos";
import { acharNo } from "@/lib/organograma";

/* Quem comanda um lugar (CIA/DPM/Pelotão) e qual o papel do usuário nele.
   Base do fluxo: a assinatura de baixo da folha é SEMPRE o Cmt local; se o
   lugar tem sargenteante, o sargenteante faz e encaminha ao Cmt para aprovar;
   sem sargenteante, o próprio Cmt publica já autorizado. */

export type PapelLugar = "admin" | "cmt" | "sarg" | null;

function abrevPosto(p?: string | null): string {
  const map: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "major": "Maj", "capitão": "Cap", "capitao": "Cap",
    "1º tenente": "1º Ten", "2º tenente": "2º Ten", "aspirante a oficial": "Asp Of", "subtenente": "ST",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt", "cabo": "Cb", "soldado": "Sd",
  };
  return map[(p || "").trim().toLowerCase()] ?? (p || "").trim();
}

// Nome de assinatura do militar (posto + nome completo), em maiúsculas.
function nomeAssinatura(ef: { postoGrad?: string | null; nome?: string | null; nomeGuerra?: string | null }): string {
  const posto = abrevPosto(ef.postoGrad);
  const nome = (ef.nome || ef.nomeGuerra || "").trim();
  return [posto, nome].filter(Boolean).join(" ").toUpperCase();
}

/* Cmt do lugar (nome para a assinatura + cargo). Nome vem de quem tiver o
   encargo "cmt_<noId>"; vazio se ainda não foi atribuído. */
export async function cmtDoLugar(noId: string): Promise<{ nome: string; cargo: string }> {
  const no = acharNo(noId);
  const cargo = `Comandante do ${no?.rotulo || noId}`;
  const mapa = await lerEncargos();
  const ref = Object.keys(mapa).find((r) => mapa[r] === `cmt_${noId}`);
  let nome = "";
  if (ref) {
    try {
      const ef = await prisma.efetivo.findUnique({ where: { id: ref } });
      if (ef) nome = nomeAssinatura(ef);
    } catch { /* ignora */ }
  }
  return { nome, cargo };
}

// O lugar tem sargenteante atribuído?
export async function temSargenteante(noId: string): Promise<boolean> {
  const mapa = await lerEncargos();
  return Object.values(mapa).some((v) => v === `sarg_${noId}`);
}

/* Papel do usuário NAQUELE lugar: admin (acesso total), cmt local, sarg local
   ou nada. Serve para decidir publicar-autorizado × enviar-para-aprovação. */
export async function papelNoLugar(
  refEfetivo: string | null | undefined, perfil: string | null | undefined, noId: string,
): Promise<PapelLugar> {
  if ((perfil || "").toLowerCase() === "admin") return "admin";
  const enc = await encargoDe(refEfetivo);
  if (enc === `cmt_${noId}`) return "cmt";
  if (enc === `sarg_${noId}`) return "sarg";
  return null;
}
