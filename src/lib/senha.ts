import bcrypt from "bcryptjs";
import crypto from "crypto";

/* =========================================================================
   Senhas — bcrypt com compatibilidade do esquema antigo.

   Esquema NOVO (seguro): bcrypt (o hash já embute o sal; começa com "$2").
   Esquema LEGADO: SHA-256(salt + senha + salt) hex — herdado do Auth.gs.

   Migração transparente: no login, se a senha bater num hash legado, ela é
   re-gravada em bcrypt automaticamente (o usuário não percebe). Assim, sem
   forçar ninguém a trocar senha, todo mundo migra no próximo acesso.
   ========================================================================= */

const CUSTO_BCRYPT = 10;

// Hash antigo, mantido só para CONFERIR senhas que ainda não migraram.
export function hashLegado(senha: string, salt: string): string {
  return crypto.createHash("sha256").update(salt + senha + salt, "utf8").digest("hex");
}

export function ehBcrypt(hash?: string | null): boolean {
  return !!hash && /^\$2[aby]\$/.test(hash);
}

// Gera o hash bcrypt (para senhas novas / trocas / resets / migração).
export async function gerarHash(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

/* Confere a senha nos dois esquemas.
   - ok: a senha está correta.
   - precisaUpgrade: bateu num hash legado -> deve ser re-gravada em bcrypt. */
export async function conferirSenha(
  senha: string,
  senhaHash?: string | null,
  salt?: string | null,
): Promise<{ ok: boolean; precisaUpgrade: boolean }> {
  if (!senha || !senhaHash) return { ok: false, precisaUpgrade: false };
  if (ehBcrypt(senhaHash)) {
    const ok = await bcrypt.compare(senha, senhaHash);
    return { ok, precisaUpgrade: false };
  }
  // legado precisa do sal guardado
  if (!salt) return { ok: false, precisaUpgrade: false };
  const ok = hashLegado(senha, salt) === senhaHash;
  return { ok, precisaUpgrade: ok };
}
