import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  lerPermutas, salvarPermutas, fichaDe, linhaMilitar, aplicarPermutasNaEscala,
  type Permuta, type Assinatura,
} from "@/lib/permutaPedidos";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function novoId(): string {
  return "pm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
async function assinaturaDe(efetivoId: string): Promise<Assinatura | null> {
  const f = await fichaDe(efetivoId);
  if (!f) return null;
  return { efetivoId, nome: f.nome || "", linha: linhaMilitar(f), em: new Date().toISOString() };
}

/* =========================================================================
   /api/permutas/pedidos  (SOLICITAÇÃO DE PERMUTA — documento)
   GET  -> { meus, paraMim, paraP1 }   (cada um só vê o que é seu; admin vê P/1)
   POST acoes:
     { acao:"criar", solicitadoId, dataPermuta, dataRetorno, motivo }
     { acao:"assinar", id, resposta:"aceitar"|"recusar" }        (o solicitado)
     { acao:"parecer", id, visto:"autorizado"|"nao_autorizado", parecer? } (admin)
     { acao:"cancelar", id }   (o solicitante, enquanto aguarda o colega)
   ========================================================================= */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  const pedidos = await lerPermutas();
  // LGPD: o policial só enxerga as permutas em que ele é parte.
  const meus = pedidos.filter((p) => meuId && (p.solicitanteId === meuId || p.solicitadoId === meuId));
  const paraMim = pedidos.filter((p) => meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado");
  const paraP1 = admin ? pedidos.filter((p) => p.estado === "aguardando_p1") : [];

  const ord = (a: Permuta, b: Permuta) => (b.criadoEm || "").localeCompare(a.criadoEm || "");
  return NextResponse.json({ meus: meus.sort(ord), paraMim: paraMim.sort(ord), paraP1: paraP1.sort(ord) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const meuId = (session.user as any).refEfetivo as string | null;
  const admin = ehAdmin((session.user as any).perfil);

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");

  try {
    const pedidos = await lerPermutas();

    // ---------- criar (solicitante assina pelo login) ----------
    if (acao === "criar") {
      if (!meuId) return NextResponse.json({ error: "Seu usuário não está vinculado a uma ficha." }, { status: 400 });
      const solicitadoId = String(b?.solicitadoId || "");
      const dataPermuta = String(b?.dataPermuta || "");
      const dataRetorno = String(b?.dataRetorno || "");
      const motivo = String(b?.motivo || "").trim();
      if (!solicitadoId || !/^\d{4}-\d{2}-\d{2}$/.test(dataPermuta) || !/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) {
        return NextResponse.json({ error: "Preencha o colega e as duas datas." }, { status: 400 });
      }
      if (solicitadoId === meuId) {
        return NextResponse.json({ error: "Escolha um colega diferente de você." }, { status: 400 });
      }
      const meuAss = await assinaturaDe(meuId);
      const fColega = await fichaDe(solicitadoId);
      if (!meuAss || !fColega) return NextResponse.json({ error: "Ficha não encontrada." }, { status: 400 });

      const pedido: Permuta = {
        id: novoId(),
        solicitanteId: meuId,
        solicitante: meuAss,
        solicitadoId,
        solicitadoNome: linhaMilitar(fColega),
        solicitado: null,
        dataPermuta, dataRetorno,
        motivo,
        estado: "aguardando_solicitado",
        parecerP1: null, p1Nome: null, p1Em: null, visto: null,
        criadoEm: new Date().toISOString(),
      };
      pedidos.push(pedido);
      await salvarPermutas(pedidos);
      return NextResponse.json({ ok: true, pedido });
    }

    // ---------- solicitado assina (concordo) ou recusa ----------
    if (acao === "assinar") {
      const id = String(b?.id || "");
      const resposta = String(b?.resposta || "");
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Permuta não encontrada." }, { status: 404 });
      if (p.solicitadoId !== meuId) return NextResponse.json({ error: "Esta permuta não é para você assinar." }, { status: 403 });
      if (p.estado !== "aguardando_solicitado") return NextResponse.json({ error: "Esta permuta não está mais aguardando sua assinatura." }, { status: 409 });

      if (resposta === "aceitar") {
        const ass = await assinaturaDe(meuId!);
        if (!ass) return NextResponse.json({ error: "Ficha não encontrada." }, { status: 400 });
        p.solicitado = ass;
        p.estado = "aguardando_p1";
      } else if (resposta === "recusar") {
        p.estado = "recusada";
      } else {
        return NextResponse.json({ error: "Resposta inválida." }, { status: 400 });
      }
      await salvarPermutas(pedidos);
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- P/1 dá parecer + visto do Subcomandante ----------
    if (acao === "parecer") {
      if (!admin) return NextResponse.json({ error: "Apenas o P/1 pode analisar." }, { status: 403 });
      const id = String(b?.id || "");
      const visto = String(b?.visto || "");
      const parecer = String(b?.parecer || "").trim();
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Permuta não encontrada." }, { status: 404 });
      if (p.estado !== "aguardando_p1") return NextResponse.json({ error: "Esta permuta não está aguardando o P/1." }, { status: 409 });
      if (visto !== "autorizado" && visto !== "nao_autorizado") {
        return NextResponse.json({ error: "Informe o visto (autorizado ou não autorizado)." }, { status: 400 });
      }
      p.visto = visto;
      p.parecerP1 = parecer || null;
      p.p1Nome = (session.user.name || "").trim() || null;
      p.p1Em = new Date().toISOString();
      p.estado = visto === "autorizado" ? "autorizada" : "nao_autorizada";
      await salvarPermutas(pedidos);
      // autorizada: ja tenta lancar o substituto na escala daquele(s) dia(s)
      // (se a escala ja existir). Se ainda nao existir, entra ao abrir a escala.
      if (p.estado === "autorizada") { try { await aplicarPermutasNaEscala(); } catch {} }
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- cancelar (solicitante) ----------
    if (acao === "cancelar") {
      const id = String(b?.id || "");
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Permuta não encontrada." }, { status: 404 });
      if (p.solicitanteId !== meuId) return NextResponse.json({ error: "Você só pode cancelar as suas permutas." }, { status: 403 });
      if (p.estado !== "aguardando_solicitado") return NextResponse.json({ error: "Só dá para cancelar enquanto o colega não assinou." }, { status: 409 });
      p.estado = "cancelada";
      await salvarPermutas(pedidos);
      return NextResponse.json({ ok: true, pedido: p });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/permutas/pedidos]", err);
    return NextResponse.json({ error: "Falha ao processar a permuta." }, { status: 500 });
  }
}
