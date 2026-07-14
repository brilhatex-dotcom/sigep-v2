import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  lerPedidos, salvarPedidos, atualizarSlot, CAMPOS_ESCALA, type Pedido,
} from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function novoId(): string {
  return "pm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* =========================================================================
   /api/permutas/pedidos
   GET  -> pedidos relevantes para quem chama:
           { meus, paraMim, paraP1 }
   POST -> acoes:
     { acao:"criar", data, campo, idx, label, titular, colegaId, colegaNome, motivo? }
     { acao:"colega", id, resposta:"aceitar"|"recusar" }   (o colega)
     { acao:"p1", id, resposta:"deferir"|"indeferir", motivo? }  (admin)
     { acao:"cancelar", id }   (o solicitante, enquanto aguarda o colega)
   ========================================================================= */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  const pedidos = await lerPedidos();
  const meus = pedidos.filter((p) => meuId && p.solicitanteId === meuId);
  const paraMim = pedidos.filter((p) => meuId && p.colegaId === meuId && p.estado === "aguardando_colega");
  const paraP1 = admin ? pedidos.filter((p) => p.estado === "aguardando_p1") : [];

  // recentes primeiro
  const ord = (a: Pedido, b: Pedido) => (b.criadoEm || "").localeCompare(a.criadoEm || "");
  return NextResponse.json({
    meus: meus.sort(ord),
    paraMim: paraMim.sort(ord),
    paraP1: paraP1.sort(ord),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");

  try {
    const pedidos = await lerPedidos();

    // ---------- criar (solicitante) ----------
    if (acao === "criar") {
      if (!meuId) return NextResponse.json({ error: "Seu usuario nao esta vinculado a uma ficha." }, { status: 400 });
      const data = String(b?.data || "");
      const campo = String(b?.campo || "");
      const idx = Number.isInteger(b?.idx) ? b.idx : -1;
      const label = String(b?.label || "");
      const titular = String(b?.titular || "").trim();
      const colegaId = String(b?.colegaId || "");
      const colegaNome = String(b?.colegaNome || "").trim();
      const motivo = String(b?.motivo || "").trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !campo || !titular || !colegaId || !colegaNome) {
        return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
      }
      if (!CAMPOS_ESCALA.some((c) => c.campo === campo)) {
        return NextResponse.json({ error: "Serviço invalido." }, { status: 400 });
      }
      if (colegaId === meuId) {
        return NextResponse.json({ error: "Escolha um colega diferente de você." }, { status: 400 });
      }
      // evita pedido duplicado ativo para a mesma vaga
      const jaExiste = pedidos.some(
        (p) => p.data === data && p.campo === campo && p.idx === idx &&
          (p.estado === "aguardando_colega" || p.estado === "aguardando_p1")
      );
      if (jaExiste) {
        return NextResponse.json({ error: "Já existe uma permuta em andamento para esta vaga." }, { status: 409 });
      }

      const nomeSolic = (session.user.name || "").trim();
      const pedido: Pedido = {
        id: novoId(),
        data, campo, idx, label, titular,
        solicitanteId: meuId,
        solicitanteNome: nomeSolic,
        colegaId, colegaNome,
        motivo: motivo || undefined,
        estado: "aguardando_colega",
        criadoEm: new Date().toISOString(),
      };
      pedidos.push(pedido);
      await salvarPedidos(pedidos);
      return NextResponse.json({ ok: true, pedido });
    }

    // ---------- colega responde ----------
    if (acao === "colega") {
      const id = String(b?.id || "");
      const resposta = String(b?.resposta || "");
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
      if (p.colegaId !== meuId) return NextResponse.json({ error: "Este pedido nao e para voce." }, { status: 403 });
      if (p.estado !== "aguardando_colega") return NextResponse.json({ error: "Este pedido nao esta mais aguardando sua resposta." }, { status: 409 });

      if (resposta === "aceitar") {
        p.estado = "aguardando_p1";
        p.colegaEm = new Date().toISOString();
        // amarra o substituto na vaga (fica pendente ate o P/1 deferir)
        await atualizarSlot(p.data, p.campo, p.idx, { permuta: p.colegaNome, status: "pendente" });
      } else if (resposta === "recusar") {
        p.estado = "recusada_colega";
        p.colegaEm = new Date().toISOString();
      } else {
        return NextResponse.json({ error: "Resposta invalida." }, { status: 400 });
      }
      await salvarPedidos(pedidos);
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- P/1 defere/indefere ----------
    if (acao === "p1") {
      if (!admin) return NextResponse.json({ error: "Apenas o P/1 pode analisar." }, { status: 403 });
      const id = String(b?.id || "");
      const resposta = String(b?.resposta || "");
      const motivo = String(b?.motivo || "").trim();
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
      if (p.estado !== "aguardando_p1") return NextResponse.json({ error: "Este pedido nao esta aguardando o P/1." }, { status: 409 });

      if (resposta === "deferir") {
        p.estado = "deferida";
        p.p1Em = new Date().toISOString();
        p.motivoP1 = motivo || null;
        // confirma o substituto na escala (amarrado)
        await atualizarSlot(p.data, p.campo, p.idx, { permuta: p.colegaNome, status: "aprovada" });
      } else if (resposta === "indeferir") {
        p.estado = "indeferida";
        p.p1Em = new Date().toISOString();
        p.motivoP1 = motivo || null;
        // desfaz o substituto da vaga
        await atualizarSlot(p.data, p.campo, p.idx, { permuta: null, status: null });
      } else {
        return NextResponse.json({ error: "Resposta invalida." }, { status: 400 });
      }
      await salvarPedidos(pedidos);
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- cancelar (solicitante) ----------
    if (acao === "cancelar") {
      const id = String(b?.id || "");
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
      if (p.solicitanteId !== meuId) return NextResponse.json({ error: "Voce so pode cancelar os seus pedidos." }, { status: 403 });
      if (p.estado !== "aguardando_colega") return NextResponse.json({ error: "So da para cancelar enquanto o colega nao respondeu." }, { status: 409 });
      p.estado = "cancelada";
      await salvarPedidos(pedidos);
      return NextResponse.json({ ok: true, pedido: p });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/permutas/pedidos]", err);
    return NextResponse.json({ error: "Falha ao processar o pedido." }, { status: 500 });
  }
}
