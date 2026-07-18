import { prisma } from "@/lib/prisma";
import { LUGARES_COMANDO } from "@/lib/encargos";
import { acharNo, pertenceAoNo } from "@/lib/organograma";

/* Para onde vai o PARECER de uma permuta.
   Regra do 18º BPM: quem decide é o comandante da unidade do SOLICITADO (o
   policial que tem o serviço coberto/tirado):
     - solicitado da SEDE          -> Chefe do P/1  (encargo "chefe_p1")
     - solicitado de CIA/pelotão    -> Cmt daquele lugar (encargo "cmt_<noId>")
   Assim: 2ª CIA com 2ª CIA -> Cmt da 2ª CIA; alguém tira serviço na sede -> P/1;
   alguém da sede tira serviço de um local -> Cmt daquele local. */

export type Parecerista = { encargo: string; rotulo: string; noId: string | null };

// Lugar (mais específico) de uma lotação: pelotão > CIA; senão null (= sede).
function lugarDaLotacao(lotacao: string | null): { id: string; rotulo: string } | null {
  const matches = LUGARES_COMANDO.filter((l) => {
    const no = acharNo(l.id);
    return no && pertenceAoNo(lotacao || "", no);
  });
  if (!matches.length) return null;
  matches.sort((a, b) => b.id.length - a.id.length); // pelotão antes da CIA
  return { id: matches[0].id, rotulo: matches[0].rotulo };
}

export async function pareceristaDoSolicitado(solicitadoId: string): Promise<Parecerista> {
  let lotacao: string | null = null;
  try {
    const ef = await prisma.efetivo.findUnique({ where: { id: solicitadoId }, select: { lotacao: true } });
    lotacao = ef?.lotacao ?? null;
  } catch { /* ignora */ }
  const lugar = lugarDaLotacao(lotacao);
  if (lugar) return { encargo: `cmt_${lugar.id}`, rotulo: `Cmt — ${lugar.rotulo}`, noId: lugar.id };
  return { encargo: "chefe_p1", rotulo: "Chefe do P/1", noId: null };
}
