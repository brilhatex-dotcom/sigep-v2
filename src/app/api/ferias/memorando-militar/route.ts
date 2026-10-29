import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { apagarAssinaturaDoPapel, assinaturasDoPapel } from "@/lib/assinaturaSigep";

export const dynamic = "force-dynamic";

/* /api/ferias/memorando-militar   (só o P/1)
   GET  ?ano=2027&ids=1,2,3        -> quem da lista já assinou o memorando de
                                     férias do ano: { assinados: { id: {nome, em} } }
   POST { efetivoId, ano }         -> DESFAZ a assinatura do militar (ex.: assinou
                                     antes da hora e o aviso "aguardando a seção"
                                     não sai mais da tela). A da seção, se houver,
                                     fica; o militar assina de novo quando abrir. */

const TIPO = "memorando_ferias";

async function soP1() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { erro: NextResponse.json({ error: "Nao autorizado" }, { status: 401 }) };
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return { erro: NextResponse.json({ error: "Somente o P/1." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: Request) {
  const a = await soP1();
  if (a.erro) return a.erro;
  const u = new URL(req.url);
  const ano = (u.searchParams.get("ano") || "").trim();
  const ids = (u.searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 300);
  if (!/^\d{4}$/.test(ano) || !ids.length) return NextResponse.json({ assinados: {} });
  const lista = await assinaturasDoPapel(TIPO, ids.map((id) => `${id}:${ano}`), "militar");
  const assinados: Record<string, { nome: string; em: string }> = {};
  for (const x of lista) assinados[x.ref.split(":")[0]] = { nome: x.nome, em: x.em };
  return NextResponse.json({ assinados });
}

export async function POST(req: Request) {
  const a = await soP1();
  if (a.erro) return a.erro;
  const b = await req.json().catch(() => ({}));
  const efetivoId = String(b?.efetivoId || "").trim();
  const ano = String(b?.ano || "").trim();
  if (!efetivoId || !/^\d{4}$/.test(ano)) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

  const n = await apagarAssinaturaDoPapel(TIPO, `${efetivoId}:${ano}`, "militar");
  if (!n) return NextResponse.json({ error: "Este militar não tem assinatura neste memorando." }, { status: 404 });
  const f = await prisma.efetivo.findUnique({ where: { id: efetivoId }, select: { postoGrad: true, nomeGuerra: true, nome: true } });
  await registrar({
    acao: "memorando_desfazer_assinatura", alvo: efetivoId,
    detalhe: `Desfez a assinatura de ${[f?.postoGrad, f?.nomeGuerra || f?.nome].filter(Boolean).join(" ") || efetivoId} no memorando de férias de ${ano}.`,
  });
  return NextResponse.json({ ok: true });
}
