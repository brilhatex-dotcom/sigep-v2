import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lugarDoUsuario } from "@/lib/lugarUsuario";

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
