import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  lerPermutas, salvarPermutas, fichaDe, linhaMilitar, aplicarPermutasNaEscala, cargoP1,
  type Permuta, type Assinatura,
} from "@/lib/permutaPedidos";
import { podeComoEncargo, podeVerP1, encargoDe, cargoDocDe } from "@/lib/encargos";
import { registrar } from "@/lib/auditoria";

// alvoNome padrão de uma permuta para a auditoria
function alvoPermuta(p: Permuta): string {
  return `${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome}`;
}

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

  const podeP1 = await podeComoEncargo(meuId, "chefe_p1", admin); // pode ASSINAR o parecer
  const veP1 = await podeVerP1(meuId, admin);                     // Seção P/1 (vê/acompanha)
  const podeSub = await podeComoEncargo(meuId, "subcmt", admin);

  const pedidos = await lerPermutas();
  // LGPD: o policial só enxerga as permutas em que ele é parte.
  const meus = pedidos.filter((p) => meuId && (p.solicitanteId === meuId || p.solicitadoId === meuId));
  const paraMim = pedidos.filter((p) => meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado");
  // A Seção P/1 (Chefe + Auxiliares) VÊ as que aguardam parecer; só o Chefe assina.
  const paraP1 = veP1 ? pedidos.filter((p) => p.estado === "aguardando_p1") : [];
  // Subcmt: as que ele PRECISA decidir (parecer não favorável) + as já autorizadas
  // pelo parecer favorável que ele ainda pode "vistar" (opcional, caixinha em branco).
  const paraSubcmt = podeSub
    ? pedidos.filter((p) => !p.visto && (p.estado === "aguardando_subcmt" || p.estado === "autorizada"))
    : [];

  const ord = (a: Permuta, b: Permuta) => (b.criadoEm || "").localeCompare(a.criadoEm || "");
  return NextResponse.json({
    meus: meus.sort(ord), paraMim: paraMim.sort(ord),
    paraP1: paraP1.sort(ord), paraSubcmt: paraSubcmt.sort(ord),
    podeP1, podeSubcmt: podeSub,
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
    const pedidos = await lerPermutas();

    // ---------- criar (solicitante assina pelo login) ----------
    if (acao === "criar") {
      if (!meuId) return NextResponse.json({ error: "Seu usuário não está vinculado a uma ficha." }, { status: 400 });
      const solicitadoId = String(b?.solicitadoId || "");
      const dataPermuta = String(b?.dataPermuta || "");
      const dataRetorno = String(b?.dataRetorno || "");
      const motivo = String(b?.motivo || "").trim();
      if (!solicitadoId || !/^\d{4}-\d{2}-\d{2}$/.test(dataPermuta)) {
        return NextResponse.json({ error: "Escolha o colega e a data da permuta." }, { status: 400 });
      }
      if (dataRetorno && !/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) {
        return NextResponse.json({ error: "Data de retorno inválida." }, { status: 400 });
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
        parecerP1: null, p1Favoravel: null, p1Nome: null, p1Cargo: null, p1Em: null, visto: null,
        subcmtNome: null, subcmtEm: null,
        criadoEm: new Date().toISOString(),
      };
      pedidos.push(pedido);
      await salvarPermutas(pedidos);
      await registrar({ acao: "permuta_criar", alvo: pedido.id, alvoNome: alvoPermuta(pedido), detalhe: `Solicitou e assinou a permuta para ${dataPermuta}${dataRetorno ? ` (retorno ${dataRetorno})` : ""}.` });
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
      await registrar({
        acao: resposta === "aceitar" ? "permuta_assinar" : "permuta_recusar",
        alvo: p.id, alvoNome: alvoPermuta(p),
        detalhe: resposta === "aceitar" ? "Assinou o \"concordo\" (colega solicitado)." : "Recusou a permuta (colega solicitado).",
      });
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- Chefe do P/1 (Silas) dá o PARECER ----------
    if (acao === "parecer") {
      if (!(await podeComoEncargo(meuId, "chefe_p1", admin))) {
        return NextResponse.json({ error: "Apenas o Chefe da Seção P/1 pode dar o parecer." }, { status: 403 });
      }
      const id = String(b?.id || "");
      const parecer = String(b?.parecer || "").trim();
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Permuta não encontrada." }, { status: 404 });
      if (p.estado !== "aguardando_p1") return NextResponse.json({ error: "Esta permuta não está aguardando o parecer do P/1." }, { status: 409 });
      const favoravel = b?.favoravel !== false; // padrão favorável
      p.parecerP1 = parecer || null;
      p.p1Favoravel = favoravel;
      p.p1Nome = (session.user.name || "").trim() || null;
      const enc = await encargoDe(meuId);
      p.p1Cargo = (enc && cargoDocDe(enc)) || cargoP1(session.user.name);
      p.p1Em = new Date().toISOString();
      if (favoravel) {
        // Parecer FAVORÁVEL do P/1 já dá o resultado: a permuta vale e entra na
        // escala mesmo sem o visto do Subcmt (a caixinha dele fica em branco; ele
        // pode assinar depois, mas não é impeditivo).
        p.estado = "autorizada";
        await salvarPermutas(pedidos);
        try { await aplicarPermutasNaEscala(); } catch {}
      } else {
        // Parecer não favorável: sobe para o Subcmt decidir.
        p.estado = "aguardando_subcmt";
        await salvarPermutas(pedidos);
      }
      await registrar({
        acao: "permuta_parecer", alvo: p.id, alvoNome: alvoPermuta(p),
        detalhe: `Parecer do P/1: ${favoravel ? "FAVORÁVEL (autoriza a permuta)" : "NÃO FAVORÁVEL (segue para o Subcmt)"}${parecer ? ` — ${parecer}` : ""}.`,
      });
      return NextResponse.json({ ok: true, pedido: p });
    }

    // ---------- Subcomandante (Frans) dá o VISTO: favorável / não ----------
    if (acao === "visto") {
      if (!(await podeComoEncargo(meuId, "subcmt", admin))) {
        return NextResponse.json({ error: "Apenas o Subcomandante pode dar o visto (favorável/não)." }, { status: 403 });
      }
      const id = String(b?.id || "");
      const visto = String(b?.visto || "");
      const p = pedidos.find((x) => x.id === id);
      if (!p) return NextResponse.json({ error: "Permuta não encontrada." }, { status: 404 });
      // O Subcmt pode dar o visto quando: (a) o parecer foi NÃO favorável (aguarda ele
      // decidir) OU (b) já está autorizada pelo parecer favorável mas sem o visto dele.
      const podeVistar = p.estado === "aguardando_subcmt" || (p.estado === "autorizada" && !p.visto);
      if (!podeVistar) return NextResponse.json({ error: "Esta permuta não está aguardando o visto do Subcmt." }, { status: 409 });
      if (visto !== "autorizado" && visto !== "nao_autorizado") {
        return NextResponse.json({ error: "Informe o visto (favorável ou não)." }, { status: 400 });
      }
      p.visto = visto;
      p.subcmtNome = (session.user.name || "").trim() || null;
      p.subcmtEm = new Date().toISOString();
      p.estado = visto === "autorizado" ? "autorizada" : "nao_autorizada";
      await salvarPermutas(pedidos);
      await registrar({
        acao: "permuta_visto", alvo: p.id, alvoNome: alvoPermuta(p),
        detalhe: `Visto do Subcomandante: ${visto === "autorizado" ? "FAVORÁVEL (autorizado)" : "NÃO AUTORIZADO"}.`,
      });
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
      await registrar({ acao: "permuta_cancelar", alvo: p.id, alvoNome: alvoPermuta(p), detalhe: "Cancelou a solicitação de permuta." });
      return NextResponse.json({ ok: true, pedido: p });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/permutas/pedidos]", err);
    return NextResponse.json({ error: "Falha ao processar a permuta." }, { status: 500 });
  }
}
