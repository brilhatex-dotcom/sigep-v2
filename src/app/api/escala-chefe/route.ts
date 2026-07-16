import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala-chefe
   Guarda quem assina a Escala de Servico (Chefe do P/1), na tabela Config
   (chave "escala_chefe_p1", valor JSON { nome, funcao }). Assim fica igual
   em todos os computadores e o usuario troca pela aba, sem mexer no banco.
   GET  -> { nome, funcao }
   POST -> salva (somente admin/P1)
   ========================================================================= */

const CHAVE = "escala_chefe_p1";
// Padrao inicial (usado so quando nada foi salvo ainda). O valor real e
// editado na aba "Chefe do P1" da escala e fica salvo na Config — este campo
// e a fonte unica de quem assina a escala E os memorandos de ferias/LP.
const PADRAO = {
  nome: "1º TEN QOEM PAULO SILAS BARROS DE BRITO JUNIOR",
  funcao: "CHEFE DO P/1 DO 18º BPM",
  assinatura: "",       // imagem da assinatura (data URL/caminho); "" = em branco
  assinarGov: false,    // se true, a assinatura sai em branco (assina pelo Gov.br)
  cmtAssinatura: "/brasoes/assinatura-cmt.png",   // assinatura do Cmt (VISTO), trocavel se mudar o comando
  comandante: "TEN CEL FLÁVIO DE CARVALHO RAMOS", // Cmt do 18º BPM (assina solucao/portaria/decisao do disciplinar)
};

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    if (!row?.valor) return NextResponse.json(PADRAO);
    try {
      const v = JSON.parse(row.valor);
      return NextResponse.json({
        nome: typeof v.nome === "string" ? v.nome : PADRAO.nome,
        funcao: typeof v.funcao === "string" ? v.funcao : PADRAO.funcao,
        assinatura: typeof v.assinatura === "string" ? v.assinatura : "",
        assinarGov: v.assinarGov === true,
        cmtAssinatura: typeof v.cmtAssinatura === "string" ? v.cmtAssinatura : PADRAO.cmtAssinatura,
        comandante: typeof v.comandante === "string" && v.comandante.trim() ? v.comandante : PADRAO.comandante,
      });
    } catch {
      return NextResponse.json(PADRAO);
    }
  } catch (err) {
    console.error("[GET /api/escala-chefe]", err);
    return NextResponse.json(PADRAO);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P1 pode alterar o chefe" }, { status: 403 });
  }

  try {
    const b = await req.json();
    const nome = String(b.nome || "").trim();
    const funcao = String(b.funcao || "").trim();
    const assinatura = typeof b.assinatura === "string" ? b.assinatura : "";
    const assinarGov = b.assinarGov === true;
    const cmtAssinatura = typeof b.cmtAssinatura === "string" ? b.cmtAssinatura : PADRAO.cmtAssinatura;
    const comandante = typeof b.comandante === "string" && b.comandante.trim() ? b.comandante.trim() : PADRAO.comandante;
    if (!nome) return NextResponse.json({ error: "Informe o nome do chefe" }, { status: 400 });

    const valor = JSON.stringify({ nome, funcao, assinatura, assinarGov, cmtAssinatura, comandante });
    await prisma.config.upsert({
      where: { chave: CHAVE },
      update: { valor },
      create: { chave: CHAVE, valor, descricao: "Chefe do P/1 que assina a Escala de Servico" },
    });

    return NextResponse.json({ ok: true, nome, funcao });
  } catch (err) {
    console.error("[POST /api/escala-chefe]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
