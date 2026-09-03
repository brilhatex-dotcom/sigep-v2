import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirPromocoes } from "@/lib/promocaoDb";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/* /api/promocoes/listao/lotes
   GET               -> os últimos lançamentos, agrupados por lote.
   DELETE ?lote=xxx  -> DESFAZ o lote: devolve cada militar ao posto anterior.

   Desfazer é o que dá segurança para o P/1 lançar sem medo: se o listão foi
   lido errado, ou foi o arquivo errado, um clique volta tudo ao que era.
   As linhas não são apagadas — ficam marcadas como desfeitas, para o
   histórico continuar contando o que aconteceu. */

export async function GET() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((u.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  try {
    await garantirPromocoes();
    const linhas = await prisma.promocaoLancada.findMany({
      orderBy: { aplicadoEm: "desc" },
      take: 400,
    });

    const porLote = new Map<string, {
      lote: string; referencia: string; aplicadoPor: string; aplicadoEm: string;
      quantidade: number; desfeito: boolean; militares: { nome: string; de: string; para: string }[];
    }>();

    for (const l of linhas) {
      const atual = porLote.get(l.lote) || {
        lote: l.lote,
        referencia: l.referencia || "",
        aplicadoPor: l.aplicadoPor || "",
        aplicadoEm: l.aplicadoEm.toISOString(),
        quantidade: 0,
        desfeito: true,           // vira false assim que aparecer uma linha viva
        militares: [],
      };
      atual.quantidade += 1;
      if (!l.desfeitoEm) atual.desfeito = false;
      if (atual.militares.length < 60) {
        atual.militares.push({ nome: l.nome || "", de: l.postoAnterior || "", para: l.postoNovo || "" });
      }
      porLote.set(l.lote, atual);
    }

    return NextResponse.json({ lotes: [...porLote.values()] });
  } catch (err) {
    console.error("[GET /api/promocoes/listao/lotes]", err);
    return NextResponse.json({ lotes: [] });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((u.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Só o P/1 pode desfazer." }, { status: 403 });
  }

  try {
    await garantirPromocoes();
    const lote = (new URL(req.url).searchParams.get("lote") || "").trim();
    if (!lote) return NextResponse.json({ error: "Informe o lote." }, { status: 400 });

    const linhas = await prisma.promocaoLancada.findMany({ where: { lote, desfeitoEm: null } });
    if (!linhas.length) {
      return NextResponse.json({ error: "Este lançamento já foi desfeito (ou não existe)." }, { status: 404 });
    }

    let voltaram = 0;
    const naoVoltaram: { nome: string; motivo: string }[] = [];

    for (const l of linhas) {
      const ficha = await prisma.efetivo.findUnique({ where: { id: l.efetivoId } });
      if (!ficha) { naoVoltaram.push({ nome: l.nome || "", motivo: "Ficha não encontrada." }); continue; }

      /* Só desfaz se a ficha ainda estiver no posto que ESTE lançamento pôs.
         Se alguém já mexeu depois (outra promoção, correção à mão), desfazer
         apagaria esse trabalho — melhor avisar do que atropelar. */
      if ((ficha.postoGrad || "") !== (l.postoNovo || "")) {
        naoVoltaram.push({
          nome: l.nome || "",
          motivo: `A ficha está como "${ficha.postoGrad || "sem posto"}" e não como "${l.postoNovo}" — foi alterada depois.`,
        });
        continue;
      }

      await prisma.efetivo.update({
        where: { id: l.efetivoId },
        data: {
          postoGrad: l.postoAnterior || null,
          dataPromocao: l.dataPromocaoAnterior || null,
          ultimaAtualizacao: new Date().toISOString(),
        },
      });
      await prisma.promocaoLancada.update({
        where: { id: l.id },
        data: { desfeitoEm: new Date(), desfeitoPor: u.login ?? null },
      });
      voltaram++;
    }

    await registrar({
      acao: "promocao.listao.desfazer",
      alvo: lote,
      alvoNome: linhas[0]?.referencia || "Listão de promoções",
      detalhe: `${voltaram} militar(es) voltaram ao posto anterior; ${naoVoltaram.length} não puderam voltar.`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, voltaram, naoVoltaram });
  } catch (err) {
    console.error("[DELETE /api/promocoes/listao/lotes]", err);
    return NextResponse.json({ error: "Falha ao desfazer." }, { status: 500 });
  }
}
