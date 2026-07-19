/* Segredo ÚNICO do app para lacres HMAC (permutas/assinaturas) e derivação da
   chave AES (dados sensíveis). Vem do ambiente. Em PRODUÇÃO, se faltar ou for
   fraco, FALHA em vez de cair num literal fixo — assim nunca se emite/aceita um
   lacre forjável por chave conhecida. Em desenvolvimento, usa um valor local só
   para não travar o build. O NextAuth já exige NEXTAUTH_SECRET em produção, então
   na prática esta função sempre encontra a variável. */
export function segredoApp(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.DADOS_SENSIVEIS_KEY || "";
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Segredo do app ausente/fraco (defina NEXTAUTH_SECRET). Operação de segurança bloqueada.");
  }
  return "sigep-dev-only-inseguro-0000000000";
}
