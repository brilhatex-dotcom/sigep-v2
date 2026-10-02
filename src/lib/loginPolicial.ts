import { prisma } from "@/lib/prisma";
import { gerarHash } from "@/lib/senha";

/* =========================================================================
   LOGIN DE POLICIAL PARA UM MILITAR SÓ

   O login era criado apenas pela padronização em massa (Gerenciar Acessos),
   que roda para o efetivo inteiro. Militar cadastrado depois dela ficava
   "(sem login)" — e o único botão para resolver resetava a senha de TODO
   MUNDO junto. Aqui é o mesmo padrão (login = ID PMMA só com dígitos, senha
   12345678, troca obrigatória + termo LGPD no 1º acesso), para UM militar, sem
   encostar em mais ninguém.
   ========================================================================= */

export const SENHA_INICIAL = "12345678";

function soDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export type LoginCriado = { ok: true; login: string; religado: boolean } | { ok: false; erro: string };

export async function criarLoginPolicial(efetivoId: string): Promise<LoginCriado> {
  const id = String(efetivoId || "").trim();
  const login = soDigitos(id);
  if (!login) return { ok: false, erro: "O ID deste militar não tem números para virar login." };

  const ja = await prisma.usuario.findFirst({ where: { refEfetivo: id }, select: { id: true } });
  if (ja) return { ok: false, erro: "Este militar já tem login." };

  const senhaHash = await gerarHash(SENHA_INICIAL);

  /* Já existe usuário com este login? Se for de policial e estiver SOLTO (sem
     ficha ligada — sobra de uma ficha apagada ou recadastrada), religa nele.
     Ligado a outra ficha, ou admin, não mexe: devolve o motivo. */
  const mesmoLogin = await prisma.usuario.findFirst({
    where: { login: { equals: login, mode: "insensitive" } },
    select: { id: true, refEfetivo: true, perfil: true },
  });
  if (mesmoLogin) {
    const perfil = (mesmoLogin.perfil || "").toLowerCase();
    if (mesmoLogin.refEfetivo || (perfil && perfil !== "policial")) {
      return {
        ok: false,
        erro: mesmoLogin.refEfetivo
          ? `O login ${login} já pertence à ficha ${mesmoLogin.refEfetivo}. Confira se não é a mesma pessoa cadastrada duas vezes.`
          : `O login ${login} já existe e é de administrador.`,
      };
    }
    await prisma.usuario.update({
      where: { id: mesmoLogin.id },
      data: {
        refEfetivo: id, senhaHash, salt: "", perfil: "policial", ativo: "SIM",
        precisaTrocar: true, tentativas: 0, bloqueadoAte: null,
      },
      select: { id: true },
    });
    return { ok: true, login, religado: true };
  }

  // o id interno segue o da padronização ("u_<ID>"); se estiver ocupado, ganha um sufixo
  let idUsuario = "u_" + id;
  if (await prisma.usuario.findUnique({ where: { id: idUsuario }, select: { id: true } })) {
    idUsuario += "_" + Date.now().toString(36);
  }
  await prisma.usuario.create({
    data: {
      id: idUsuario, login, senhaHash, salt: "", ativo: "SIM", perfil: "policial",
      refEfetivo: id, precisaTrocar: true, dataCriacao: new Date().toISOString(),
    },
    select: { id: true },
  });
  return { ok: true, login, religado: false };
}
