import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/diarias/viagens/grupo
   Registra a MESMA viagem (BG/Nota, processo, trajeto, período, qtd) na ficha
   de VÁRIOS militares de uma vez — para quando um grupo viaja junto e a
   auxiliar não precisa redigitar o mesmo trajeto/processo uma vez por pessoa.

   Diferente do PUT de /api/diarias/viagens (que SUBSTITUI todas as viagens de
   UM militar naquele ano, porque a tela mostra a lista inteira dele), aqui
   ACRESCENTA uma linha nova na ficha de cada militar da lista, sem tocar no
   que já existia — quem está registrando o grupo não está vendo a ficha de
   cada um, então substituir apagaria viagens que nem sabia que existiam.

   A quantidade de diárias é a MESMA para todos os selecionados. Se um do
   grupo precisar de valor diferente (ex.: motorista ficou 1 dia a mais), o
   ajuste é feito depois abrindo a ficha individual dele — sem redigitar
   trajeto/processo, só o número daquela linha.

   POST { idsPmma: string[], ano, bgNota, processo, trajeto, periodo, qtd }
   -> { ok: true, adicionadas } */

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idsPmma: string[] = Array.isArray(b?.idsPmma)
      ? Array.from(new Set(b.idsPmma.map((x: any) => String(x || "").trim()).filter(Boolean)))
      : [];
    const ano = String(b?.ano || "").trim();
    if (!idsPmma.length) return NextResponse.json({ error: "Selecione ao menos um militar." }, { status: 400 });
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "Informe o ano (AAAA)." }, { status: 400 });

    const bgNota = String(b?.bgNota || "").trim();
    const processo = String(b?.processo || "").trim();
    const trajeto = String(b?.trajeto || "").trim();
    const periodo = String(b?.periodo || "").trim();
    const qtd = String(b?.qtd || "").trim();
    if (![bgNota, processo, trajeto, periodo, qtd].some(Boolean)) {
      return NextResponse.json({ error: "Preencha ao menos um campo da viagem." }, { status: 400 });
    }

    const row = await prisma.config.findUnique({ where: { chave: "diarias_viagens" } });
    let lista: any[] = [];
    try { const v = row?.valor ? JSON.parse(row.valor) : []; lista = Array.isArray(v) ? v : []; } catch { lista = []; }

    const novas = idsPmma.map((idPmma, i) => ({
      id: `grupo-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      idPmma, ano, bgNota, processo, trajeto, periodo, qtd,
    }));

    await prisma.config.upsert({
      where: { chave: "diarias_viagens" },
      update: { valor: JSON.stringify([...lista, ...novas]) },
      create: { chave: "diarias_viagens", valor: JSON.stringify(novas), descricao: "Viagens da ficha de controle individual de diarias" },
    });

    return NextResponse.json({ ok: true, adicionadas: novas.length });
  } catch (err) {
    console.error("[POST /api/diarias/viagens/grupo]", err);
    return NextResponse.json({ error: "Falha ao registrar a viagem em grupo." }, { status: 500 });
  }
}
