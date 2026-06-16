// ============================================================
// ARQUIVO: src/app/api/cfs2026/inscricao/route.ts
// Endpoint POST publico que recebe inscricoes do Google Forms
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Headers CORS permissivos para o Apps Script
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar API Key
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.CFS2026_API_KEY;
    
    if (!expectedKey) {
      console.error("CFS2026_API_KEY nao configurada no .env");
      return NextResponse.json(
        { ok: false, error: "Servidor nao configurado" },
        { status: 500, headers: corsHeaders }
      );
    }
    
    if (apiKey !== expectedKey) {
      return NextResponse.json(
        { ok: false, error: "API Key invalida" },
        { status: 401, headers: corsHeaders }
      );
    }
    
    // 2. Parse do body
    const body = await req.json();
    
    // 3. Validacao basica
    const camposObrigatorios = [
      "matricula",
      "nomeCompleto",
      "graduacao",
      "dataNascimento",
      "email",
      "telefone",
      "lotacao",
    ];
    
    const camposFaltando = camposObrigatorios.filter((c) => !body[c]);
    if (camposFaltando.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campos obrigatorios ausentes",
          campos: camposFaltando,
        },
        { status: 400, headers: corsHeaders }
      );
    }
    
    // 4. Normalizacao
    const matricula = String(body.matricula).trim();
    const email = String(body.email).trim().toLowerCase();
    const telefone = String(body.telefone).replace(/\D/g, "");
    
    // Parse de data (aceita dd/mm/yyyy ou yyyy-mm-dd)
    let dataNascimento: Date;
    const dataStr = String(body.dataNascimento).trim();
    if (dataStr.includes("/")) {
      const [dia, mes, ano] = dataStr.split("/");
      dataNascimento = new Date(`${ano}-${mes}-${dia}T00:00:00`);
    } else {
      dataNascimento = new Date(dataStr);
    }
    
    if (isNaN(dataNascimento.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Data de nascimento invalida" },
        { status: 400, headers: corsHeaders }
      );
    }
    
    // 5. Verificar duplicata
    const jaExiste = await prisma.requerimentoCFS2026.findUnique({
      where: { matricula },
    });
    
    if (jaExiste) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ja existe inscricao para esta matricula",
          inscricaoId: jaExiste.id,
          dataInscricao: jaExiste.dataInscricao,
        },
        { status: 409, headers: corsHeaders }
      );
    }
    
    // 6. Capturar metadata
    const ipOrigem =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "desconhecido";
    const userAgent = req.headers.get("user-agent") || "desconhecido";
    
    // 7. Criar inscricao
    const inscricao = await prisma.requerimentoCFS2026.create({
      data: {
        matricula,
        idPmma: body.idPmma ? String(body.idPmma).trim() : null,
        nomeCompleto: String(body.nomeCompleto).trim().toUpperCase(),
        nomeGuerra: body.nomeGuerra ? String(body.nomeGuerra).trim().toUpperCase() : null,
        graduacao: String(body.graduacao).trim(),
        dataNascimento,
        cpf: body.cpf ? String(body.cpf).replace(/\D/g, "") : null,
        rg: body.rg ? String(body.rg).trim() : null,
        email,
        telefone,
        lotacao: String(body.lotacao).trim(),
        funcaoAtual: body.funcaoAtual ? String(body.funcaoAtual).trim() : null,
        observacoes: body.observacoes ? String(body.observacoes).trim() : null,
        ipOrigem,
        userAgent,
        fonteOrigem: "GOOGLE_FORMS",
      },
    });
    
    return NextResponse.json(
      {
        ok: true,
        message: "Inscricao registrada com sucesso",
        inscricaoId: inscricao.id,
        protocolo: `CFS2026-${inscricao.id.slice(-8).toUpperCase()}`,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Erro ao criar inscricao CFS 2026:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno do servidor",
        detalhe: err?.message || String(err),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
