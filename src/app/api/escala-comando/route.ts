import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada } from "@/lib/escalaEscopo";
import { cmtDoLugar, temSargenteante, papelNoLugar } from "@/lib/comandoLugar";

export const dynamic = "force-dynamic";

/* /api/escala-comando?escopo=<noId>
   Dados do COMANDO do lugar para a folha da unidade:
   - cmt: nome (de quem tem o encargo cmt_<noId>) + cargo + assinatura salva
   - assinarGov: sair em branco para assinar via Gov.br
   - temSargenteante / papel do usuário (admin | cmt | sarg)
   A assinatura (imagem/flag) fica na Config escopada "escala_comando__<noId>".
   Só o Cmt local (ou admin) pode gravar a assinatura. */
const CHAVE = "escala_comando";

export async function GET(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const noId = ctx.escopo;
  if (!noId) return NextResponse.json({ error: "Escopo obrigatorio" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const [cmt, sarg, papel, row] = await Promise.all([
    cmtDoLugar(noId),
    temSargenteante(noId),
    papelNoLugar(u?.refEfetivo, u?.perfil, noId),
    prisma.config.findUnique({ where: { chave: ctx.chave } }),
  ]);
  let assinatura = "", assinarGov = false;
  try {
    const v = row?.valor ? JSON.parse(row.valor) : {};
    assinatura = typeof v.assinatura === "string" ? v.assinatura : "";
    assinarGov = !!v.assinarGov;
  } catch { /* ignora */ }

  return NextResponse.json({
    cmt: { nome: cmt.nome, cargo: cmt.cargo, assinatura, assinarGov },
    temSargenteante: sarg,
    papel, // "admin" | "cmt" | "sarg" | null
  });
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  const noId = ctx.escopo;
  if (!noId) return NextResponse.json({ error: "Escopo obrigatorio" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const papel = await papelNoLugar(u?.refEfetivo, u?.perfil, noId);
  // Só o Cmt local (ou admin) define a assinatura de baixo.
  if (papel !== "admin" && papel !== "cmt") {
    return NextResponse.json({ error: "So o Cmt local pode alterar a assinatura." }, { status: 403 });
  }
  try {
    const b = await req.json();
    const valor = JSON.stringify({
      assinatura: typeof b.assinatura === "string" ? b.assinatura : "",
      assinarGov: !!b.assinarGov,
    });
    await prisma.config.upsert({
      where: { chave: ctx.chave },
      update: { valor },
      create: { chave: ctx.chave, valor, descricao: "Assinatura do Cmt da unidade" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/escala-comando]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
