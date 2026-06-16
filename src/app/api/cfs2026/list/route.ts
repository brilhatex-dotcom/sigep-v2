// ============================================================
// ARQUIVO: src/app/api/cfs2026/list/route.ts
// Endpoint GET protegido (so admin) para listar inscricoes
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { ok: false, error: "Nao autenticado" },
        { status: 401 }
      );
    }
    
    // Apenas perfil "admin" pode listar
    const perfil = (session.user as any).perfil;
    if (perfil !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Sem permissao" },
        { status: 403 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const graduacao = searchParams.get("graduacao");
    const lotacao = searchParams.get("lotacao");
    
    const where: any = {};
    if (status) where.status = status;
    if (graduacao) where.graduacao = graduacao;
    if (lotacao) where.lotacao = lotacao;
    
    const inscricoes = await prisma.requerimentoCFS2026.findMany({
      where,
      orderBy: { dataInscricao: "desc" },
    });
    
    const stats = {
      total: inscricoes.length,
      pendente: inscricoes.filter((i) => i.status === "PENDENTE").length,
      validado: inscricoes.filter((i) => i.status === "VALIDADO").length,
      rejeitado: inscricoes.filter((i) => i.status === "REJEITADO").length,
      porGraduacao: {} as Record<string, number>,
      porLotacao: {} as Record<string, number>,
    };
    
    for (const i of inscricoes) {
      stats.porGraduacao[i.graduacao] = (stats.porGraduacao[i.graduacao] || 0) + 1;
      stats.porLotacao[i.lotacao] = (stats.porLotacao[i.lotacao] || 0) + 1;
    }
    
    return NextResponse.json({ ok: true, inscricoes, stats });
  } catch (err: any) {
    console.error("Erro ao listar inscricoes:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// PATCH para validar/rejeitar inscricoes
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
    }
    
    const perfil = (session.user as any).perfil;
    if (perfil !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissao" }, { status: 403 });
    }
    
    const body = await req.json();
    const { id, status, observacoes } = body;
    
    if (!id || !status) {
      return NextResponse.json(
        { ok: false, error: "id e status sao obrigatorios" },
        { status: 400 }
      );
    }
    
    const atualizado = await prisma.requerimentoCFS2026.update({
      where: { id },
      data: {
        status,
        observacoes,
        validadoPor: session.user.name || session.user.email || "admin",
        validadoEm: new Date(),
      },
    });
    
    return NextResponse.json({ ok: true, inscricao: atualizado });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}