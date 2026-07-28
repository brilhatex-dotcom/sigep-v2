import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveEscopada, chaveLeitura } from "@/lib/escalaEscopo";
import { papelNoLugar } from "@/lib/comandoLugar";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/publicacoes
   Arquivo das escalas emitidas (historico oficial do que foi publicado).
   Guarda um snapshot da escala do dia/semana + brasoes + chefe na tabela
   Config (chave "publicacoes[__<noId>]"), para poder rebaixar exatamente a
   versao publicada.
   GET            -> { publicacoes: Meta[] }  (so metadados)
   GET ?id=...    -> { publicacao: RegistroCompleto }
   POST           -> publica; unidade com sargenteante sai "pendente" (aguarda
                     o Cmt), Cmt/admin publica ja "autorizada".
   PATCH ?id=&acao=aprovar -> Cmt/admin do lugar autoriza uma pendente.
   DELETE ?id=... -> remove.
   ========================================================================= */

const CHAVE = "publicacoes";
const LIMITE = 800; // mantem no maximo os N mais recentes

type Status = "autorizada" | "pendente";
type Registro = {
  id: string; dataEscala: string; tipo: string;
  publicadoEm: string; publicadoPor: string;
  status?: Status; aprovadoPor?: string | null; aprovadoEm?: string | null;
  versao?: number; // 1, 2, 3... por dia. A MAIOR do dia é a que vigora.
  escala: any; brasoes?: any; chefe?: any;
};

/* Republicação do mesmo dia: a ÚLTIMA publicada é a que VIGORA; as anteriores
   ficam no arquivo como histórico ("substituída"). Vale para admin e policial. */
function marcarVigentes(lista: Registro[]): (Registro & { vigente: boolean })[] {
  const melhorDoDia = new Map<string, number>(); // dataEscala -> maior versao
  for (const r of lista) {
    const v = r.versao || 1;
    const atual = melhorDoDia.get(r.dataEscala);
    if (atual === undefined || v > atual) melhorDoDia.set(r.dataEscala, v);
  }
  const jaMarcado = new Set<string>();
  return lista.map((r) => {
    const v = r.versao || 1;
    const ehTopo = melhorDoDia.get(r.dataEscala) === v && !jaMarcado.has(r.dataEscala);
    if (ehTopo) jaMarcado.add(r.dataEscala);
    return { ...r, vigente: ehTopo };
  });
}

function ler(valor?: string | null): Registro[] {
  try { const a = valor ? JSON.parse(valor) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function salvar(lista: Registro[], chave: string) {
  const valor = JSON.stringify(lista.slice(0, LIMITE));
  await prisma.config.upsert({
    where: { chave },
    update: { valor },
    create: { chave, valor, descricao: "Escalas publicadas (arquivo)" },
  });
}

export async function GET(req: Request) {
  // LEITURA: todo policial logado vê o que foi publicado no âmbito dele (a sua
  // unidade destacada ou a SEDE). Quem edita continua passando por chaveEscopada.
  const ctx = await chaveLeitura(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
  let lista = ler(row?.valor);

  /* Rede de segurança: se a unidade do militar não tem nenhuma escala
     publicada, mostra a da SEDE em vez de uma tela vazia. Acontece quando o
     destacamento ainda não começou a publicar a própria folha — a tropa
     continua vendo a escala que vale para ela. Só para leitor comum. */
  if (ctx.restrito && ctx.escopo && lista.length === 0) {
    const sede = await prisma.config.findUnique({ where: { chave: CHAVE } });
    lista = ler(sede?.valor);
  }

  // Leitor comum só enxerga o que já foi AUTORIZADO (publicado de fato).
  if (ctx.restrito) lista = lista.filter((r) => (r.status || "autorizada") === "autorizada");

  if (id) {
    const p = lista.find((r) => r.id === id);
    if (!p) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
    return NextResponse.json({ publicacao: p });
  }
  // so metadados (sem o snapshot pesado)
  const meta = marcarVigentes(lista).map(({ id, dataEscala, tipo, publicadoEm, publicadoPor, status, aprovadoPor, aprovadoEm, versao, vigente }) =>
    ({ id, dataEscala, tipo, publicadoEm, publicadoPor, status: status || "autorizada", aprovadoPor: aprovadoPor || null, aprovadoEm: aprovadoEm || null, versao: versao || 1, vigente }));
  meta.sort((a, b) => (b.publicadoEm || "").localeCompare(a.publicadoEm || ""));
  return NextResponse.json({ publicacoes: meta, podeEditar: !ctx.restrito });
}

export async function POST(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  try {
    const b = await req.json();
    if (!b?.escala || !b.escala.data) {
      return NextResponse.json({ error: "Escala invalida" }, { status: 400 });
    }
    // Status: sede/admin publica autorizada; no lugar, sargenteante cai como
    // "pendente" (aguarda o Cmt) e o Cmt/admin ja publica "autorizada".
    let status: Status = "autorizada";
    let aprovadoPor: string | null = null, aprovadoEm: string | null = null;
    if (ctx.escopo) {
      const papel = await papelNoLugar(u?.refEfetivo, u?.perfil, ctx.escopo);
      if (papel === "sarg") status = "pendente";
      else { aprovadoPor = String(u?.name || u?.login || "—"); aprovadoEm = new Date().toISOString(); }
    }
    const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
    const lista = ler(row?.valor);
    const dataEscala = String(b.escala.data);
    // Republicou o mesmo dia? Esta vira a versao seguinte e passa a VIGORAR;
    // as anteriores continuam no arquivo como historico.
    const versao = lista.reduce((mx, r) => (r.dataEscala === dataEscala ? Math.max(mx, r.versao || 1) : mx), 0) + 1;
    const registro: Registro = {
      id: crypto.randomUUID(),
      dataEscala,
      tipo: String(b.escala.tipo || "normal"),
      publicadoEm: new Date().toISOString(),
      publicadoPor: String(u?.name || u?.login || "—"),
      status, aprovadoPor, aprovadoEm, versao,
      escala: b.escala, brasoes: b.brasoes || null, chefe: b.chefe || null,
    };
    lista.unshift(registro);
    await salvar(lista, ctx.chave);
    return NextResponse.json({ ok: true, id: registro.id, status, versao });
  } catch (err) {
    console.error("[POST /api/publicacoes]", err);
    return NextResponse.json({ error: "Falha ao publicar" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  if (!ctx.escopo) return NextResponse.json({ error: "So no ambito de uma unidade" }, { status: 400 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const acao = url.searchParams.get("acao") || "aprovar";
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const papel = await papelNoLugar(u?.refEfetivo, u?.perfil, ctx.escopo);
  if (papel !== "admin" && papel !== "cmt") {
    return NextResponse.json({ error: "So o Cmt local pode aprovar." }, { status: 403 });
  }
  const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
  const lista = ler(row?.valor);
  const p = lista.find((r) => r.id === id);
  if (!p) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  if (acao === "aprovar") {
    p.status = "autorizada";
    p.aprovadoPor = String(u?.name || u?.login || "—");
    p.aprovadoEm = new Date().toISOString();
  }
  await salvar(lista, ctx.chave);
  return NextResponse.json({ ok: true, status: p.status });
}

export async function DELETE(req: Request) {
  const ctx = await chaveEscopada(req, CHAVE);
  if (!ctx) return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const row = await prisma.config.findUnique({ where: { chave: ctx.chave } });
  const lista = ler(row?.valor).filter((r) => r.id !== id);
  await salvar(lista, ctx.chave);
  return NextResponse.json({ ok: true });
}
