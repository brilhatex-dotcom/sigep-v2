import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarHash } from "@/lib/senha";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/admin/resetar-senha   (SOMENTE ADMIN)

   GET ?busca=texto
     -> procura militares por nome/nome de guerra/matricula/ID e diz se cada
        um tem login. Retorna ate 20 resultados para a tela de reset.

   POST { efetivoId }
     -> reseta a senha daquele policial DE VOLTA para o ID e marca
        precisaTrocar = true (ele tera que criar senha nova no proximo acesso).
        Tambem zera tentativas/bloqueio. Nunca mexe em admin.
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function soDigitos(v: string | null | undefined): string {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

// minúsculo e SEM acento, para a busca não falhar por causa de "João" vs "joao".
function norm(v: string | null | undefined): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  const url = new URL(req.url);
  const busca = (url.searchParams.get("busca") || "").trim();

  try {
    const efetivo = await prisma.efetivo.findMany({
      select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true },
    });
    const usuarios = await prisma.usuario.findMany({ select: { refEfetivo: true } });
    const comLogin = new Set(usuarios.map((u: { refEfetivo: string | null }) => u.refEfetivo).filter(Boolean) as string[]);

    const b = norm(busca);
    const bd = soDigitos(busca);

    type Ef = { id: string; postoGrad: string | null; numeroBarra: string | null; nome: string | null; nomeGuerra: string | null; matricula: string | null };
    const filtrados = (busca === "" ? efetivo.slice(0, 20) : efetivo.filter((m: Ef) => {
      const nome = norm(m.nome);
      const guerra = norm(m.nomeGuerra);
      const posto = norm(m.postoGrad);
      const barra = soDigitos(m.numeroBarra);
      const mat = soDigitos(m.matricula);
      const id = soDigitos(m.id);
      return (b !== "" && (nome.includes(b) || guerra.includes(b) || posto.includes(b)))
        || (bd !== "" && (mat.includes(bd) || id.includes(bd) || barra.includes(bd)));
    })).slice(0, 20);

    const resultados = filtrados.map((m: Ef) => ({
      efetivoId: m.id,
      postoGrad: m.postoGrad,
      numeroBarra: m.numeroBarra,
      nome: m.nome,
      nomeGuerra: m.nomeGuerra,
      matricula: m.matricula,
      temLogin: comLogin.has(m.id),
      idSimples: soDigitos(m.id),
    }));

    return NextResponse.json({ resultados });
  } catch (err) {
    console.error("[GET resetar-senha]", err);
    return NextResponse.json({ error: "Falha na busca" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const efetivoId = String(body.efetivoId || "");
  if (!efetivoId) return NextResponse.json({ error: "Informe o militar" }, { status: 400 });

  try {
    const usuario = await prisma.usuario.findFirst({ where: { refEfetivo: efetivoId } });
    if (!usuario) return NextResponse.json({ error: "Este militar nao tem login criado" }, { status: 404 });
    if ((usuario.perfil || "").toLowerCase() === "admin") {
      return NextResponse.json({ error: "Nao e permitido resetar a senha de um administrador por aqui" }, { status: 403 });
    }

    const idSimples = soDigitos(efetivoId);
    if (!idSimples) return NextResponse.json({ error: "ID do militar invalido para senha" }, { status: 400 });

    // Senha inicial PADRAO do SIGEP: "12345678" (troca obrigatoria no proximo acesso).
    const senhaHash = await gerarHash("12345678");

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash,
        salt: "",
        precisaTrocar: true,
        tentativas: 0,
        bloqueadoAte: null,
        ativo: "SIM",
      } as any,
    });

    // busca nome do alvo para a auditoria
    const ficha = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { postoGrad: true, nome: true, nomeGuerra: true },
    });
    const nomeAlvo = ficha
      ? [ficha.postoGrad || "", (ficha.nomeGuerra || ficha.nome || "")].filter(Boolean).join(" ").trim()
      : usuario.login;
    await registrar({
      acao: "resetar_senha",
      alvo: efetivoId,
      alvoNome: nomeAlvo,
      detalhe: "Senha redefinida para 12345678; troca obrigatoria no proximo acesso",
    });

    return NextResponse.json({ ok: true, senhaInicial: "12345678", idSimples });
  } catch (err) {
    console.error("[POST resetar-senha]", err);
    return NextResponse.json({ error: "Falha ao resetar" }, { status: 500 });
  }
}
