import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/admin/gerenciar-admins   (SOMENTE ADMIN)

   GET            -> { admins: [...], }  lista quem hoje tem perfil admin
   GET ?busca=x   -> { admins, resultados } tambem busca militares p/ promover
   POST { efetivoId, acao: "promover" | "rebaixar" }
                  -> muda o perfil do usuario daquele militar e registra na auditoria.

   Trava de seguranca: nao deixa rebaixar o ULTIMO admin (evita lockout total).
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function soDigitos(v: string | null | undefined): string {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

type EfetivoLite = {
  id: string; postoGrad: string | null; numeroBarra: string | null;
  nome: string | null; nomeGuerra: string | null; matricula: string | null;
};

function nomeExib(m: EfetivoLite | null, fallbackLogin: string): string {
  if (!m) return fallbackLogin;
  const posto = (m.postoGrad || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  return [posto, cap].filter(Boolean).join(" ") || fallbackLogin;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  const url = new URL(req.url);
  const busca = (url.searchParams.get("busca") || "").trim();

  try {
    // 1) admins atuais
    const usuariosAdmin = await prisma.usuario.findMany({
      where: { perfil: "admin" },
      select: { id: true, login: true, refEfetivo: true, nomeCompleto: true },
    });
    const refAdmins = usuariosAdmin.map((u: { refEfetivo: string | null }) => u.refEfetivo).filter(Boolean) as string[];
    const fichasAdmin = refAdmins.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: refAdmins } },
          select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true },
        })
      : [];
    const mapaAdmin: Record<string, EfetivoLite> = {};
    for (const f of fichasAdmin) mapaAdmin[f.id] = f;

    const admins = usuariosAdmin.map((u: { id: string; login: string; refEfetivo: string | null; nomeCompleto: string | null }) => {
      const f = u.refEfetivo ? mapaAdmin[u.refEfetivo] || null : null;
      return {
        efetivoId: u.refEfetivo,
        login: u.login,
        nome: nomeExib(f, u.nomeCompleto || u.login),
        matricula: f?.matricula ? soDigitos(f.matricula) : u.login,
      };
    });

    // 2) busca de militares (opcional) para promover
    let resultados: any[] = [];
    if (busca) {
      const efetivo = await prisma.efetivo.findMany({
        select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true },
      });
      const usuarios = await prisma.usuario.findMany({ select: { refEfetivo: true, perfil: true } });
      const perfilPorEfetivo: Record<string, string> = {};
      for (const u of usuarios) if (u.refEfetivo) perfilPorEfetivo[u.refEfetivo] = (u.perfil || "policial");

      const b = busca.toLowerCase();
      const bd = soDigitos(busca);
      resultados = efetivo
        .filter((m: EfetivoLite) => {
          const nome = (m.nome || "").toLowerCase();
          const guerra = (m.nomeGuerra || "").toLowerCase();
          const mat = soDigitos(m.matricula);
          const id = soDigitos(m.id);
          return nome.includes(b) || guerra.includes(b) || (bd !== "" && (mat.includes(bd) || id.includes(bd)));
        })
        .slice(0, 20)
        .map((m: EfetivoLite) => ({
          efetivoId: m.id,
          nome: nomeExib(m, soDigitos(m.matricula)),
          matricula: soDigitos(m.matricula),
          jaAdmin: (perfilPorEfetivo[m.id] || "policial").toLowerCase() === "admin",
          temLogin: m.id in perfilPorEfetivo,
        }));
    }

    return NextResponse.json({ admins, resultados });
  } catch (err) {
    console.error("[GET gerenciar-admins]", err);
    return NextResponse.json({ error: "Falha ao carregar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const efetivoId = String(body.efetivoId || "");
  const acao = String(body.acao || "");
  if (!efetivoId || (acao !== "promover" && acao !== "rebaixar")) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  try {
    const usuario = await prisma.usuario.findFirst({ where: { refEfetivo: efetivoId } });
    if (!usuario) return NextResponse.json({ error: "Este militar nao tem login criado" }, { status: 404 });

    const ficha = await prisma.efetivo.findUnique({
      where: { id: efetivoId },
      select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true },
    });
    const nomeAlvo = nomeExib(ficha, usuario.login);

    if (acao === "rebaixar") {
      // trava: nao rebaixar o ultimo admin
      const totalAdmins = await prisma.usuario.count({ where: { perfil: "admin" } });
      if ((usuario.perfil || "").toLowerCase() === "admin" && totalAdmins <= 1) {
        return NextResponse.json({ error: "Nao da para remover o ultimo administrador" }, { status: 400 });
      }
      await prisma.usuario.update({ where: { id: usuario.id }, data: { perfil: "policial" } });
      await registrar({
        acao: "rebaixar_admin",
        alvo: efetivoId,
        alvoNome: nomeAlvo,
        detalhe: "Perfil alterado de admin para policial",
        antes: { perfil: "admin" },
        depois: { perfil: "policial" },
      });
      return NextResponse.json({ ok: true });
    }

    // promover
    await prisma.usuario.update({ where: { id: usuario.id }, data: { perfil: "admin" } });
    await registrar({
      acao: "promover_admin",
      alvo: efetivoId,
      alvoNome: nomeAlvo,
      detalhe: "Perfil alterado de policial para admin",
      antes: { perfil: usuario.perfil || "policial" },
      depois: { perfil: "admin" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST gerenciar-admins]", err);
    return NextResponse.json({ error: "Falha ao alterar perfil" }, { status: 500 });
  }
}
