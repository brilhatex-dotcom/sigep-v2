import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerEscalaDias, slotsDoDia, slotEhDoMilitar } from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

/* /api/permutas/escala-dia?data=aaaa-mm-dd
   Visao somente-leitura da escala da sede de um dia, marcando as vagas do
   proprio policial logado (ehMeu) para ele poder pedir permuta. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get("data") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "Data invalida" }, { status: 400 });
  }

  try {
    const escalas = await lerEscalaDias();
    const dia = escalas[data];
    const slots = slotsDoDia(dia);

    const efetivoId = (session.user as any).refEfetivo as string | null;
    let militar: { nomeGuerra: string | null; nome: string | null; numeroBarra: string | null; matricula: string | null } | null = null;
    if (efetivoId) {
      militar = await prisma.efetivo.findUnique({
        where: { id: efetivoId },
        select: { nomeGuerra: true, nome: true, numeroBarra: true, matricula: true },
      });
    }

    const lista = slots.map((s) => ({
      ...s,
      ehMeu: militar ? slotEhDoMilitar(s.titular, militar) : false,
    }));

    return NextResponse.json({ data, existe: !!dia, slots: lista });
  } catch (err) {
    console.error("[GET /api/permutas/escala-dia]", err);
    return NextResponse.json({ error: "Falha ao carregar o dia" }, { status: 500 });
  }
}
