import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarHash } from "@/lib/senha";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/admin/gerar-logins   (SOMENTE ADMIN)

   Funciona como CORRETOR + CRIADOR dos logins de policial:

   Para cada militar do efetivo:
     - login  = matricula (so digitos)
     - senha  = ID simples (so digitos do id do efetivo)
     - perfil = "policial"
     - precisaTrocar = true   (forca senha nova no 1o acesso)

   - Se o militar JA TEM usuario (via refEfetivo): ATUALIZA login+senha
     (corrige os logins antigos que estavam com nome de guerra).
   - Se NAO tem usuario: CRIA.
   - NUNCA mexe em quem tem perfil != "policial" (preserva o admin).

   GET  -> previa (quantos vao ser corrigidos / criados / sem matricula)
   POST -> aplica
   ========================================================================= */

function ehAdmin(perfil: string | null | undefined): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function soDigitos(v: string | null | undefined): string {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

async function levantar() {
  const efetivo = await prisma.efetivo.findMany({
    select: { id: true, matricula: true },
  });
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, login: true, refEfetivo: true, perfil: true },
  });

  const usuarioPorEfetivo = new Map<string, { id: string; login: string }>();
  let naoPolicial = 0;
  for (const u of usuarios) {
    const ehPol = (u.perfil || "").toLowerCase() === "policial" || (u.perfil || "") === "";
    if (!ehPol) { naoPolicial++; continue; }
    if (u.refEfetivo) usuarioPorEfetivo.set(u.refEfetivo, { id: u.id, login: u.login });
  }

  const corrigir: { efetivoId: string; usuarioId: string; login: string; senha: string }[] = [];
  const criar: { efetivoId: string; login: string; senha: string }[] = [];
  const semMatricula: string[] = [];

  for (const m of efetivo) {
    const login = soDigitos(m.matricula);
    const senha = soDigitos(m.id);
    if (!login || !senha) { semMatricula.push(m.id); continue; }

    const existente = usuarioPorEfetivo.get(m.id);
    if (existente) {
      corrigir.push({ efetivoId: m.id, usuarioId: existente.id, login, senha });
    } else {
      criar.push({ efetivoId: m.id, login, senha });
    }
  }

  return { totalEfetivo: efetivo.length, corrigir, criar, semMatricula, naoPolicial };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  try {
    const p = await levantar();
    return NextResponse.json({
      totalEfetivo: p.totalEfetivo,
      aCorrigir: p.corrigir.length,
      aCriar: p.criar.length,
      semMatricula: p.semMatricula.length,
      adminsPreservados: p.naoPolicial,
    });
  } catch (err) {
    console.error("[GET gerar-logins]", err);
    return NextResponse.json({ error: "Falha na previa" }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas admin" }, { status: 403 });

  try {
    const p = await levantar();
    let corrigidos = 0;
    let criados = 0;
    const erros: string[] = [];

    for (const c of p.corrigir) {
      const senhaHash = await gerarHash(c.senha);
      try {
        await prisma.usuario.update({
          where: { id: c.usuarioId },
          data: {
            login: c.login,
            senhaHash,
            salt: "",
            perfil: "policial",
            ativo: "SIM",
            precisaTrocar: true,
            tentativas: 0,
            bloqueadoAte: null,
          },
        });
        corrigidos++;
      } catch (e) {
        erros.push("corrigir " + c.login + ": " + String(e));
      }
    }

    for (const c of p.criar) {
      const senhaHash = await gerarHash(c.senha);
      try {
        await prisma.usuario.create({
          data: {
            id: "u_" + c.efetivoId,
            login: c.login,
            senhaHash,
            salt: "",
            ativo: "SIM",
            perfil: "policial",
            refEfetivo: c.efetivoId,
            precisaTrocar: true,
            dataCriacao: new Date().toISOString(),
          },
        });
        criados++;
      } catch (e) {
        erros.push("criar " + c.login + ": " + String(e));
      }
    }

    return NextResponse.json({
      ok: true,
      corrigidos,
      criados,
      semMatricula: p.semMatricula.length,
      adminsPreservados: p.naoPolicial,
      erros: erros.slice(0, 10),
    });
  } catch (err) {
    console.error("[POST gerar-logins]", err);
    return NextResponse.json({ error: "Falha ao processar" }, { status: 500 });
  }
}
