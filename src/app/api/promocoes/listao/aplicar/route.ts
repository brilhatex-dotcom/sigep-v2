import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirPromocoes } from "@/lib/promocaoDb";
import { registrar } from "@/lib/auditoria";
import { classificarPatente } from "@/lib/patentes";

export const dynamic = "force-dynamic";

/* /api/promocoes/listao/aplicar
   POST { referencia, dataPromocao, itens: [{ efetivoId, postoNovo, ordListao, criterio }] }

   Aqui é onde a promoção realmente acontece. Tudo que chega já passou pela
   conferência do P/1 na tela — mas o servidor NÃO confia na tela: refaz as
   contas com o que está no banco antes de mexer em qualquer ficha.

   O que é conferido de novo, item por item:
   - a ficha existe;
   - o posto novo é um posto reconhecido;
   - o posto novo é EXATAMENTE um degrau acima do atual (nunca dois, nunca
     para baixo) — assim um erro de leitura não vira uma promoção absurda;
   - a pessoa ainda não está nesse posto.

   Cada promoção vira uma linha em promocoes_lancadas com o posto ANTERIOR,
   e o lote inteiro pode ser desfeito depois. */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((u.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Só o P/1 pode lançar promoções." }, { status: 403 });
  }

  try {
    await garantirPromocoes();

    const b = await req.json();
    const referencia = String(b?.referencia || "").trim().slice(0, 200);
    const dataPromocao = String(b?.dataPromocao || "").trim().slice(0, 10);
    const itens = Array.isArray(b?.itens) ? b.itens : [];
    if (!itens.length) return NextResponse.json({ error: "Nenhum militar selecionado." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPromocao)) {
      return NextResponse.json({ error: "Informe a data da promoção." }, { status: 400 });
    }

    const lote = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const aplicadas: { nome: string; de: string; para: string }[] = [];
    const recusadas: { efetivoId: string; nome: string; motivo: string }[] = [];

    for (const it of itens) {
      const efetivoId = String(it?.efetivoId || "").trim();
      const postoNovo = String(it?.postoNovo || "").trim();
      if (!efetivoId || !postoNovo) continue;

      const ficha = await prisma.efetivo.findUnique({ where: { id: efetivoId } });
      if (!ficha) {
        recusadas.push({ efetivoId, nome: "", motivo: "Ficha não encontrada." });
        continue;
      }
      const nome = (ficha.nome || ficha.nomeGuerra || "").trim();

      const ordemAtual = classificarPatente(ficha.postoGrad).ordem;
      const ordemNova = classificarPatente(postoNovo).ordem;

      if (ordemNova === 99) {
        recusadas.push({ efetivoId, nome, motivo: `Posto "${postoNovo}" não foi reconhecido.` });
        continue;
      }
      if (ordemAtual === 99) {
        recusadas.push({ efetivoId, nome, motivo: "A ficha está sem posto/graduação." });
        continue;
      }
      if (ordemAtual === ordemNova) {
        recusadas.push({ efetivoId, nome, motivo: `Já está como ${ficha.postoGrad}.` });
        continue;
      }
      // promoção sobe exatamente um degrau (a ordem diminui em 1)
      if (ordemAtual - ordemNova !== 1) {
        recusadas.push({
          efetivoId, nome,
          motivo: `Salto inválido: de ${ficha.postoGrad} para ${postoNovo}. Promoção sobe um posto de cada vez.`,
        });
        continue;
      }

      const postoAnterior = ficha.postoGrad || "";
      const dataAnterior = ficha.dataPromocao || "";

      await prisma.efetivo.update({
        where: { id: efetivoId },
        data: {
          postoGrad: postoNovo,
          dataPromocao,
          ultimaAtualizacao: new Date().toISOString(),
        },
      });

      await prisma.promocaoLancada.create({
        data: {
          lote,
          efetivoId,
          nome,
          postoAnterior,
          postoNovo,
          dataPromocaoAnterior: dataAnterior || null,
          dataPromocao,
          referencia: referencia || null,
          criterio: it?.criterio ? String(it.criterio).slice(0, 60) : null,
          ordListao: Number.isFinite(Number(it?.ordListao)) ? Number(it.ordListao) : null,
          aplicadoPor: u.login ?? null,
        },
      });

      aplicadas.push({ nome, de: postoAnterior, para: postoNovo });
    }

    await registrar({
      acao: "promocao.listao.aplicar",
      alvo: lote,
      alvoNome: referencia || "Listão de promoções",
      detalhe: `${aplicadas.length} militar(es) promovido(s); ${recusadas.length} recusado(s).`,
      depois: aplicadas,
    }).catch(() => {});

    return NextResponse.json({ ok: true, lote, aplicadas, recusadas });
  } catch (err) {
    console.error("[POST /api/promocoes/listao/aplicar]", err);
    return NextResponse.json({ error: "Falha ao lançar as promoções." }, { status: 500 });
  }
}
