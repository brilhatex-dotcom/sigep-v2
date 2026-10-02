import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { guardarCopia, idsComCopia, limparDados } from "@/lib/jmsDocumento";

export const dynamic = "force-dynamic";

/* /api/jms/emitidos
   O que já saiu pela aba Guia JMS e Ofício, para o P/1 conferir depois
   ("o ofício do Cb Moura eu fiz semana passada?").

   Junta as duas coisas numa lista só:
   - GUIA de encaminhamento: já era registrada em /api/jms/guias, no momento
     em que o número é consumido. Aqui só é lida.
   - OFÍCIO de apresentação: não tinha registro nenhum, porque a numeração
     dele é manual. Passa a ser gravado quando o documento é EMITIDO
     (imprimir, Word ou PDF) — é esse o momento em que o ofício "foi feito".

   Reemitir o mesmo ofício no MESMO dia não cria linha nova: a chave é o
   militar + o dia. Em outro dia é outro ofício, e entra separado.

   Cada registro guarda também uma CÓPIA dos campos da folha no momento em
   que o documento saiu (lib/jmsDocumento) — é o que deixa abrir de novo o
   documento em /api/jms/emitidos/documento.

   GET ?ano=2026 -> { itens }  (mais recentes primeiro; temCopia por item)
   POST { idPmma, nome, ..., doc? }  -> registra/atualiza o ofício do dia
   PATCH { id, doc }           -> atualiza a cópia de um registro (a guia
                                  reimpressa depois de editada)
   DELETE ?id=...              -> apaga um registro de OFÍCIO (a guia não sai
                                  por aqui: o número dela já foi protocolado) */

const CHAVE_OFICIOS = "jms_oficios";
const CHAVE_GUIAS = "jms_guias";

type Oficio = {
  id: string; idPmma: string; nome: string; postoGrad: string; matricula: string;
  numero: string; ano: string; dataJms: string; criadoEm: string; criadoPor: string;
};
type Guia = {
  id: string; numero: number; ano: string;
  idPmma: string; nome: string; dataVisita: string; criadoEm: string;
};

export type ItemEmitido = {
  id: string; tipo: "oficio" | "guia";
  idPmma: string; nome: string; postoGrad: string;
  numero: string; ano: string; dataJms: string;
  criadoEm: string; criadoPor: string;
  temCopia?: boolean; // abre exatamente como saiu (senão é refeito pelo cadastro)
};

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function lista<T>(v?: string | null): T[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function ler<T>(chave: string): Promise<T[]> {
  try { return lista<T>((await prisma.config.findUnique({ where: { chave } }))?.valor); } catch { return []; }
}
async function salvarOficios(v: Oficio[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE_OFICIOS },
    update: { valor: JSON.stringify(v) },
    create: { chave: CHAVE_OFICIOS, valor: JSON.stringify(v), descricao: "Oficios de apresentacao a JMS emitidos" },
  });
}
const hojeISO = () => new Date().toISOString().slice(0, 10);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });
  }

  const ano = new URL(req.url).searchParams.get("ano") || "";
  const [oficios, guias] = await Promise.all([ler<Oficio>(CHAVE_OFICIOS), ler<Guia>(CHAVE_GUIAS)]);

  /* O posto muda com o tempo (promoção) e o registro guardou o do dia da
     emissão. Quem ainda está na ficha vale mais: mostra o posto ATUAL, para o
     P/1 reconhecer a pessoa hoje. */
  const ids = Array.from(new Set([...oficios, ...guias].map((x) => x.idPmma).filter(Boolean)));
  const fichas = new Map<string, { postoGrad: string; nome: string }>();
  if (ids.length) {
    try {
      const efs = await prisma.efetivo.findMany({
        where: { id: { in: ids } },
        select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
      });
      for (const e of efs) fichas.set(e.id, { postoGrad: e.postoGrad || "", nome: (e.nomeGuerra || e.nome || "").trim() });
    } catch { /* sem ficha, usa o que foi gravado */ }
  }

  const itens: ItemEmitido[] = [
    ...oficios.map((o) => ({
      id: o.id, tipo: "oficio" as const, idPmma: o.idPmma,
      nome: fichas.get(o.idPmma)?.nome || o.nome || "",
      postoGrad: fichas.get(o.idPmma)?.postoGrad || o.postoGrad || "",
      numero: o.numero || "", ano: o.ano || "", dataJms: o.dataJms || "",
      criadoEm: o.criadoEm || "", criadoPor: o.criadoPor || "",
    })),
    ...guias.map((g) => ({
      id: g.id, tipo: "guia" as const, idPmma: g.idPmma,
      nome: fichas.get(g.idPmma)?.nome || g.nome || "",
      postoGrad: fichas.get(g.idPmma)?.postoGrad || "",
      numero: String(g.numero).padStart(3, "0"), ano: g.ano || "", dataJms: g.dataVisita || "",
      criadoEm: g.criadoEm || "", criadoPor: "",
    })),
  ]
    .filter((i) => !ano || (i.criadoEm || "").slice(0, 4) === ano)
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));

  const comCopia = await idsComCopia(itens.map((i) => i.id));
  for (const i of itens) i.temCopia = comCopia.has(i.id);

  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin(u.perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });

    const hoje = hojeISO();
    const oficios = await ler<Oficio>(CHAVE_OFICIOS);
    // Mesmo militar no mesmo dia = o mesmo ofício, reemitido.
    const jaTem = oficios.find((o) => o.idPmma === idPmma && o.criadoEm === hoje);
    const dados = {
      nome: String(b?.nome || "").trim(),
      postoGrad: String(b?.postoGrad || "").trim(),
      matricula: String(b?.matricula || "").trim(),
      numero: String(b?.numero || "").trim(),
      ano: String(b?.ano || "").trim(),
      dataJms: String(b?.dataJms || "").trim(),
      criadoPor: String(u.name || "").trim(),
    };
    let id: string;
    if (jaTem) { Object.assign(jaTem, dados); id = jaTem.id; }
    else { id = crypto.randomUUID(); oficios.push({ id, idPmma, criadoEm: hoje, ...dados }); }

    await salvarOficios(oficios);
    // a folha como saiu (reemitir no mesmo dia troca pela mais nova)
    if (b?.doc && typeof b.doc === "object") {
      try { await guardarCopia(id, "oficio", limparDados(b.doc)); } catch (e) { console.error("[emitidos] copia", e); }
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[POST /api/jms/emitidos]", err);
    return NextResponse.json({ error: "Falha ao registrar o ofício" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });

  const id = String(new URL(req.url).searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  try {
    const oficios = await ler<Oficio>(CHAVE_OFICIOS);
    const restantes = oficios.filter((o) => o.id !== id);
    if (restantes.length === oficios.length) {
      /* Só ofício sai daqui. A guia fica: o número dela já foi protocolado e
         apagar o registro esconderia um documento que existe no papel. */
      return NextResponse.json({ error: "Só um ofício pode ser apagado desta lista." }, { status: 400 });
    }
    await salvarOficios(restantes);
    try { await prisma.config.deleteMany({ where: { chave: `jms_doc_${id}` } }); } catch { /* sem cópia */ }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/jms/emitidos]", err);
    return NextResponse.json({ error: "Falha ao apagar" }, { status: 500 });
  }
}

/* PATCH { id, doc } — atualiza a cópia de um registro que já existe. A guia é
   registrada (consome o número) e muitas vezes ajustada e impressa depois:
   a cópia acompanha o que realmente saiu. */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o P/1" }, { status: 403 });
  try {
    const b = await req.json().catch(() => ({}));
    const id = String(b?.id || "");
    if (!id || !b?.doc || typeof b.doc !== "object") return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    const [oficios, guias] = await Promise.all([ler<Oficio>(CHAVE_OFICIOS), ler<Guia>(CHAVE_GUIAS)]);
    const guia = guias.find((g) => g.id === id);
    const oficio = oficios.find((o) => o.id === id);
    if (!guia && !oficio) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
    const doc = limparDados(b.doc);
    // o número da guia é o registrado — a tela não troca
    if (guia) doc.numero = String(guia.numero).padStart(3, "0");
    await guardarCopia(id, guia ? "guia" : "oficio", doc);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/jms/emitidos]", err);
    return NextResponse.json({ error: "Falha ao guardar a cópia" }, { status: 500 });
  }
}
