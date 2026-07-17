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

/* Política de senha forte. Devolve a mensagem de erro, ou null se estiver ok.
   Regras: >= 8 caracteres; não pode ser só números; não pode ser toda igual ou
   sequência óbvia; não pode conter/igualar o login/matrícula/ID. */
/* Política SIMPLES (usada na troca de senha do policial): mínimo 4 caracteres,
   pode misturar letras e números. Bloqueia só o óbvio: caractere repetido
   (1111), a padrão "123456" e ser igual ao login/ID. */
export function validarSenhaSimples(senha: string, refs: (string | null | undefined)[] = []): string | null {
  const s = (senha || "");
  if (s.length < 4) return "A senha deve ter ao menos 4 caracteres.";
  if (/^(.)\1+$/.test(s)) return "A senha não pode ser um único caractere repetido.";
  if (s === "123456") return "Escolha uma senha diferente da padrão.";
  const low = s.toLowerCase();
  for (const r of refs) {
    const rr = String(r ?? "").trim().toLowerCase();
    if (rr && rr.length >= 4 && low === rr) return "A senha não pode ser igual ao seu login ou ID.";
  }
  return null;
}

export function validarSenhaForte(senha: string, refs: (string | null | undefined)[] = []): string | null {
  const s = (senha || "");
  if (s.length < 8) return "A senha deve ter ao menos 8 caracteres.";
  if (/^\d+$/.test(s)) return "A senha não pode ser só números — misture letras.";
  if (/^(.)\1+$/.test(s)) return "A senha não pode ser um único caractere repetido.";
  const seqs = ["01234567", "12345678", "23456789", "abcdefgh", "qwertyui"];
  const low = s.toLowerCase();
  if (seqs.some((q) => q.includes(low) || low.includes(q))) return "A senha não pode ser uma sequência óbvia.";
  for (const r of refs) {
    const rr = String(r ?? "").trim().toLowerCase();
    if (rr && rr.length >= 4 && (low === rr || low.includes(rr) || rr.includes(low))) {
      return "A senha não pode conter/ser igual ao seu login, matrícula ou ID.";
    }
  }
  return null;
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
