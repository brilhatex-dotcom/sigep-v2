import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lugarDoUsuario } from "@/lib/lugarUsuario";
import { prisma } from "@/lib/prisma";
import { LUGARES_COMANDO } from "@/lib/encargos";
import { ORGANOGRAMA, acharNo, pertenceAoNo } from "@/lib/organograma";

/* =========================================================================
   Escopo da escala por lugar. Cada unidade guarda a sua escala em chaves de
   Config próprias ("<base>__<noId>"), separadas da SEDE ("<base>"). Assim a
   escala do interior NUNCA toca na escala da sede.

   Regras de acesso (segurança no servidor):
   - ADMIN (inclui Cmt do BPM/Subcmt/Chefe P1): opera na sede (sem escopo) ou em
     qualquer lugar (via ?escopo=<noId>).
   - Cmt/Sargenteante de lugar: SEMPRE forçado ao próprio lugar (ignora o que
     vier no parâmetro) — não consegue ler/gravar a sede nem outra unidade.
   - Demais: negado.
   Retorna null quando não autorizado.
   ========================================================================= */
function ehAdmin(perfil?: string | null): boolean {
  return (perfil ?? "").toLowerCase() === "admin";
}

export async function chaveEscopada(req: Request, base: string): Promise<{ chave: string; escopo: string | null } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const admin = ehAdmin((session.user as any).perfil);
  const pedido = new URL(req.url).searchParams.get("escopo") || "";
  if (admin) {
    return pedido ? { chave: `${base}__${pedido}`, escopo: pedido } : { chave: base, escopo: null };
  }
  const lugar = await lugarDoUsuario((session.user as any).refEfetivo);
  if (!lugar) return null;
  return { chave: `${base}__${lugar.noId}`, escopo: lugar.noId };
}

/* Unidade destacada (CIA/Pelotão) do militar pela LOTAÇÃO — não pelo encargo.
   Devolve o lugar MAIS ESPECÍFICO (pelotão antes da CIA). null = SEDE, que é o
   caso da Permanência, FT, RP, Inteligência, Administrativa, Ronda Escolar,
   Maria da Penha e demais funções do quartel. */
async function lugarDaLotacao(refEfetivo: string | null | undefined): Promise<string | null> {
  if (!refEfetivo) return null;
  let lotacao: string | null = null;
  try {
    const ef = await prisma.efetivo.findUnique({ where: { id: refEfetivo }, select: { lotacao: true } });
    lotacao = ef?.lotacao ?? null;
  } catch { return null; }
  if (!lotacao) return null;

  /* A palavra SEDE na lotação decide sozinha (ex.: "1ª CIA - SEDE"). */
  const norm = lotacao.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (norm.includes("sede")) return null;

  const maisEspecificoPrimeiro = [...LUGARES_COMANDO].sort((a, b) => b.id.length - a.id.length);
  for (const l of maisEspecificoPrimeiro) {
    const no = acharNo(l.id, ORGANOGRAMA);
    if (no && pertenceAoNo(lotacao, no)) {
      // A 1ª CIA É a sede — mesma unidade, mesmo quartel, mesma escala.
      // Quem é lotado nela lê a folha da sede, não uma escala separada.
      return l.id === "1cia" ? null : l.id;
    }
  }
  return null; // sede
}

/* Escopo de LEITURA (ex.: escalas publicadas). Diferente de chaveEscopada, que
   é para EDITAR: aqui QUALQUER policial logado enxerga o que foi publicado no
   âmbito dele — a unidade destacada onde é lotado ou, na falta, a SEDE.
   `restrito` = leitor comum: só pode ver publicação já AUTORIZADA. */
export async function chaveLeitura(
  req: Request, base: string,
): Promise<{ chave: string; escopo: string | null; restrito: boolean } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  if (ehAdmin(u.perfil)) {
    const pedido = new URL(req.url).searchParams.get("escopo") || "";
    return pedido
      ? { chave: `${base}__${pedido}`, escopo: pedido, restrito: false }
      : { chave: base, escopo: null, restrito: false };
  }
  // Cmt/Sargenteante: sempre o próprio lugar (vê inclusive as pendentes).
  const lugar = await lugarDoUsuario(u.refEfetivo);
  if (lugar) return { chave: `${base}__${lugar.noId}`, escopo: lugar.noId, restrito: false };
  // Policial comum: pela lotação (unidade destacada) ou a SEDE.
  const noId = await lugarDaLotacao(u.refEfetivo);
  return noId
    ? { chave: `${base}__${noId}`, escopo: noId, restrito: true }
    : { chave: base, escopo: null, restrito: true };
}
