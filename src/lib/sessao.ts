/* Tempo de INATIVIDADE da sessão (minutos), por perfil.
   - Administradores: 60 minutos.
   - Usuários normais (policiais): 30 minutos.
   O servidor (auth.ts, maxAge do JWT deslizante) usa o MAIOR valor como teto; o
   relógio visível no cliente (RelogioInatividade) afina o tempo real conforme o
   perfil e desconecta sozinho. Trocar aqui muda os dois. */
export const MINUTOS_INATIVIDADE_ADMIN = 60;
export const MINUTOS_INATIVIDADE_USUARIO = 30;

// Teto do servidor (JWT): o maior dos dois. O cliente reduz para 30 min quando
// o usuário não é admin.
export const MINUTOS_INATIVIDADE = MINUTOS_INATIVIDADE_ADMIN;

// Minutos de inatividade conforme o perfil (usado pelo relógio do cliente).
export function minutosInatividade(perfil?: string | null): number {
  return (perfil ?? "").toLowerCase() === "admin"
    ? MINUTOS_INATIVIDADE_ADMIN
    : MINUTOS_INATIVIDADE_USUARIO;
}
